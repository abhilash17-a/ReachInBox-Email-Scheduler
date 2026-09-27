import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis.js';
import { prisma } from '../config/db.js';

export const EMAIL_QUEUE = 'email-scheduler';
export const emailQueue = new Queue(EMAIL_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});

type SchedulableEmail = { id: string; scheduledAt: Date; bullmqJobId: string };

export async function enqueueEmailJobs(emails: SchedulableEmail[]) {
  if (emails.length === 0) return;
  const now = Date.now();
  await emailQueue.addBulk(emails.map((email) => ({
    name: 'send-email',
    data: { emailId: email.id },
    opts: { jobId: email.bullmqJobId, delay: Math.max(0, email.scheduledAt.getTime() - now) }
  })));
}

/** Recreate missing Redis jobs from authoritative database state on API startup. */
export async function reconcileScheduledEmailJobs() {
  let cursor: string | undefined;
  let enqueued = 0;

  while (true) {
    const emails = await prisma.email.findMany({
      where: { status: 'SCHEDULED' },
      select: { id: true, scheduledAt: true, bullmqJobId: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (emails.length === 0) break;
    await enqueueEmailJobs(emails);
    enqueued += emails.length;
    cursor = emails[emails.length - 1].id;
    if (emails.length < 500) break;
  }

  return enqueued;
}
