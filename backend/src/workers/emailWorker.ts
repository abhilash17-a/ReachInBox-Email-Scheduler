import { DelayedError, Worker, Job } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { acquireHourlySlot, acquireSenderPacing } from '../services/rateLimiter.js';
import { sendEmail } from '../services/ethereal.js';
import { indexEmail } from '../services/elasticsearch.js';
import { notifyRateLimit } from '../services/slack.js';

async function reschedule(job: Job, emailId: string, at: Date, reason: string) {
  const updated = await prisma.email.update({ where: { id: emailId }, data: { status: 'SCHEDULED', scheduledAt: at, error: reason } });
  await indexEmail(updated);
  await job.moveToDelayed(at.getTime(), job.token);
  throw new DelayedError();
}

export const emailWorker = new Worker('email-scheduler', async (job) => {
  const email = await prisma.email.findUnique({ include: { sender: true, campaign: true }, where: { id: job.data.emailId } });
  if (!email) return;
  if (email.status === 'SENT' || email.status === 'CANCELLED') return;

  // Atomic state transition: only one worker can claim a scheduled email.
  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: 'SCHEDULED' },
    data: { status: 'PROCESSING', attempts: { increment: 1 } }
  });
  if (claimed.count !== 1) return;

  try {
    const pacing = await acquireSenderPacing(email.senderId, Math.max(0, email.campaign.delayMs));
    if (pacing.waitMs > 0) {
      await reschedule(job, email.id, new Date(Date.now() + pacing.waitMs), 'Sender pacing delay applied.');
      return;
    }

    const hourly = await acquireHourlySlot(email.senderId, email.campaign.hourlyLimit, new Date());
    if (!hourly.allowed && hourly.nextAt) {
      await notifyRateLimit(email.userId, email.sender.email, email.campaign.hourlyLimit);
      await reschedule(job, email.id, hourly.nextAt, 'Hourly rate limit reached; rescheduled.');
      return;
    }

    const result = await sendEmail({
      from: email.sender.email,
      to: email.recipient,
      subject: email.subject,
      html: email.body,
      messageId: `<${email.id}@reachinbox.local>`,
      attachments: Array.isArray(email.campaign.attachments)
        ? email.campaign.attachments as Array<{ filename: string; contentType: string; contentBase64: string }>
        : []
    });

    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'SENT', sentAt: new Date(), messageId: typeof result.messageId === 'string' ? result.messageId : null, previewUrl: result.previewUrl, error: null }
    });
    await indexEmail(updated);

    const remaining = await prisma.email.count({ where: { campaignId: email.campaignId, status: { in: ['SCHEDULED', 'PROCESSING'] } } });
    if (remaining === 0) await prisma.campaign.update({ where: { id: email.campaignId }, data: { status: 'COMPLETED' } });
  } catch (error) {
    if (error instanceof DelayedError) throw error;
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    const attempts = email.attempts + 1;
    if (attempts >= 5) {
      const failed = await prisma.email.update({ where: { id: email.id }, data: { status: 'FAILED', failedAt: new Date(), error: message } });
      await indexEmail(failed);
    } else {
      await prisma.email.update({ where: { id: email.id }, data: { status: 'SCHEDULED', error: message } });
      throw error;
    }
  }
}, { connection: bullConnection, concurrency: env.WORKER_CONCURRENCY });

emailWorker.on('completed', (job) => console.log(`Email job completed: ${job.id}`));
emailWorker.on('failed', (job, error) => console.error(`Email job failed: ${job?.id}`, error.message));
