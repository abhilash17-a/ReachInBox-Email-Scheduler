import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { emailQueue, enqueueEmailJobs } from '../queues/emailQueue.js';
import { env } from '../config/env.js';
import { indexEmail, indexEmails, removeEmailIndex, searchEmails } from '../services/elasticsearch.js';

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  contentBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).max(7_000_000)
});

export const emailRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const scheduleSchema = z.object({
  senderId: z.string().optional(),
  recipients: z.array(z.string().email()).min(1).max(env.MAX_EMAIL_BATCH_SIZE),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  startAt: z.string().datetime(),
  delayMs: z.number().int().min(0).max(86_400_000).default(env.DEFAULT_MIN_DELAY_MS),
  hourlyLimit: z.number().int().min(1).max(100_000).default(env.DEFAULT_HOURLY_LIMIT),
  attachments: z.array(attachmentSchema).max(5).default([])
});

emailRouter.use(requireAuth);

emailRouter.get('/senders', async (req, res) => {
  res.json(await prisma.sender.findMany({ where: { userId: req.session.userId!, active: true }, orderBy: { createdAt: 'asc' } }));
});

emailRouter.post('/parse-leads', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'CSV or text file is required' });
  const raw = req.file.buffer.toString('utf8');
  const candidates = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const unique = [...new Set(candidates.map((x) => x.toLowerCase()))];
  res.json({ count: unique.length, emails: unique });
});

emailRouter.post('/schedule', async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join(', ') });
  const attachmentBytes = parsed.data.attachments.reduce((total, attachment) => total + Buffer.from(attachment.contentBase64, 'base64').byteLength, 0);
  if (attachmentBytes > 5 * 1024 * 1024) return res.status(400).json({ message: 'Attachments must total 5 MB or less.' });
  const userId = req.session.userId!;
  const sender = parsed.data.senderId
    ? await prisma.sender.findFirst({ where: { id: parsed.data.senderId, userId, active: true } })
    : await prisma.sender.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'asc' } });
  if (!sender) return res.status(400).json({ message: 'No active sender account configured' });

  const startAt = new Date(parsed.data.startAt);
  if (startAt.getTime() < Date.now() - 30_000) return res.status(400).json({ message: 'Start time must be in the future' });
  const delayMs = Math.max(parsed.data.delayMs, env.DEFAULT_MIN_DELAY_MS);

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      senderId: sender.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      startAt,
      delayMs,
      hourlyLimit: parsed.data.hourlyLimit,
      attachments: parsed.data.attachments,
      status: 'SCHEDULED'
    }
  });

  const emails = await prisma.$transaction(parsed.data.recipients.map((recipient, sequence) => {
    const scheduledAt = new Date(startAt.getTime() + sequence * delayMs);
    return prisma.email.create({
      data: {
        userId,
        campaignId: campaign.id,
        senderId: sender.id,
        recipient,
        subject: parsed.data.subject,
        body: parsed.data.body,
        sequence,
        scheduledAt,
        bullmqJobId: `email-${randomUUID()}`, 
        idempotencyKey: `${campaign.id}:${recipient}:${sequence}`
      }
    });
  }));

  await Promise.all([enqueueEmailJobs(emails), indexEmails(emails)]);

  res.status(201).json({ campaign, count: emails.length });
});

emailRouter.get('/scheduled', async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { userId: req.session.userId!, status: { in: ['SCHEDULED', 'PROCESSING'] } },
    orderBy: { scheduledAt: 'asc' },
    take: 1000
  });
  res.json(emails);
});

emailRouter.get('/sent', async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { userId: req.session.userId!, status: { in: ['SENT', 'FAILED'] } },
    orderBy: { sentAt: 'desc' },
    take: 1000
  });
  res.json(emails);
});

emailRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.json([]);
  res.json(await searchEmails(req.session.userId!, q));
});

emailRouter.patch('/:id/star', async (req, res) => {
  if (typeof req.body?.isStarred !== 'boolean') return res.status(400).json({ message: 'isStarred must be a boolean.' });
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.session.userId! } });
  if (!email) return res.status(404).json({ message: 'Email not found.' });
  const updated = await prisma.email.update({ where: { id: email.id }, data: { isStarred: req.body.isStarred } });
  await indexEmail(updated);
  res.json(updated);
});

emailRouter.delete('/:id', async (req, res) => {
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.session.userId! } });
  if (!email) return res.status(404).json({ message: 'Email not found.' });

  if (email.status === 'PROCESSING') return res.status(409).json({ message: 'This email is being sent and cannot be deleted yet.' });
  if (email.status === 'SCHEDULED') {
    const cancelled = await prisma.email.updateMany({
      where: { id: email.id, userId: req.session.userId!, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' }
    });
    if (cancelled.count !== 1) return res.status(409).json({ message: 'This email started processing and cannot be deleted yet.' });
    const job = await emailQueue.getJob(email.bullmqJobId);
    if (job) await job.remove();
  }

  await prisma.email.delete({ where: { id: email.id } });
  await removeEmailIndex(email.id);
  res.json({ ok: true });
});

emailRouter.get('/:id', async (req, res) => {
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.session.userId! }, include: { sender: true, campaign: true } });
  if (!email) return res.status(404).json({ message: 'Email not found' });
  res.json(email);
});

emailRouter.post('/:id/cancel', async (req, res) => {
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.session.userId! } });
  if (!email) return res.status(400).json({ message: 'Email cannot be cancelled' });
  const cancelled = await prisma.email.updateMany({
    where: { id: email.id, userId: req.session.userId!, status: 'SCHEDULED' },
    data: { status: 'CANCELLED' }
  });
  if (cancelled.count !== 1) return res.status(400).json({ message: 'Email cannot be cancelled' });
  const job = await emailQueue.getJob(email.bullmqJobId);
  if (job) await job.remove();
  const updated = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });
  await indexEmail(updated);
  res.json(updated);
});

emailRouter.get('/stats/queue', async (_req, res) => {
  const [waiting, delayed, active, failed] = await Promise.all([
    emailQueue.getWaitingCount(), emailQueue.getDelayedCount(), emailQueue.getActiveCount(), emailQueue.getFailedCount()
  ]);
  res.json({ waiting, delayed, active, failed });
});
