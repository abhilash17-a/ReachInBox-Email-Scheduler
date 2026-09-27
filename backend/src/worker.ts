import { emailQueue, reconcileScheduledEmailJobs } from './queues/emailQueue.js';
import { bullConnection, redis } from './config/redis.js';
import { prisma } from './config/db.js';
import { emailWorker } from './workers/emailWorker.js';

const recovered = await reconcileScheduledEmailJobs();
console.log(`Reconciled ${recovered} scheduled email jobs from PostgreSQL.`);
await emailWorker.waitUntilReady();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await emailWorker.close();
  await emailQueue.close();
  await Promise.all([bullConnection.quit(), redis.quit(), prisma.$disconnect()]);
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
