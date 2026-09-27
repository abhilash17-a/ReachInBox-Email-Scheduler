import express from 'express';
import session, { Store } from 'express-session';
import passport from 'passport';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env.js';
import { bullConnection } from './config/redis.js';
import { emailQueue, reconcileScheduledEmailJobs } from './queues/emailQueue.js';
import { authRouter } from './routes/auth.js';
import { emailRouter } from './routes/emails.js';
import { slackRouter } from './routes/slack.js';
import { ensureEmailIndex } from './services/elasticsearch.js';

const app = express();

class IoredisSessionStore extends Store {
  constructor(private readonly client: typeof bullConnection) { super(); }

  get(sid: string, callback: (err: unknown, value?: session.SessionData | null) => void) {
    this.client.get(`session:${sid}`).then((value) => {
      callback(null, value ? JSON.parse(value) as session.SessionData : null);
    }, callback);
  }

  set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void) {
    const ttlSeconds = Math.max(1, Math.ceil((value.cookie?.maxAge ?? 86_400_000) / 1000));
    this.client.set(`session:${sid}`, JSON.stringify(value), 'EX', ttlSeconds).then(() => callback?.(), callback);
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    this.client.del(`session:${sid}`).then(() => callback?.(), callback);
  }

  touch(sid: string, value: session.SessionData, callback?: (err?: unknown) => void) {
    const ttlSeconds = Math.max(1, Math.ceil((value.cookie?.maxAge ?? 86_400_000) / 1000));
    this.client.expire(`session:${sid}`, ttlSeconds).then(() => callback?.(), callback);
  }
}

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');
app.use(session({
  store: new IoredisSessionStore(bullConnection),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'reachinbox-api' }));
app.use('/api/auth', authRouter);
app.use('/api/emails', emailRouter);
app.use('/api/slack', slackRouter);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
app.use('/admin/queues', (req, res, next) => {
  const expected = `Basic ${Buffer.from(`${env.BULL_BOARD_USER}:${env.BULL_BOARD_PASSWORD}`).toString('base64')}`;
  if (req.headers.authorization !== expected) return res.status(401).setHeader('WWW-Authenticate', 'Basic').send('Authentication required');
  next();
}, serverAdapter.getRouter());

ensureEmailIndex().catch(console.error);
reconcileScheduledEmailJobs()
  .then((count) => console.log(`Reconciled ${count} scheduled email jobs from PostgreSQL.`))
  .catch((error) => console.error('Scheduled email job reconciliation failed:', error));

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log(`Bull Board: http://localhost:${env.PORT}/admin/queues`);
});
