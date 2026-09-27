import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve backend/.env from either src/config (tsx) or dist/src/config (compiled).
const envPath = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env')
].find(existsSync);
dotenv.config(envPath ? { path: envPath } : undefined);
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  SESSION_SECRET: z.string().min(16),
  WORKER_CONCURRENCY: z.coerce.number().default(10),
  DEFAULT_MIN_DELAY_MS: z.coerce.number().default(2000),
  DEFAULT_HOURLY_LIMIT: z.coerce.number().default(200),
  MAX_EMAIL_BATCH_SIZE: z.coerce.number().default(5000),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/auth/google/callback'),
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().default(587),
  ETHEREAL_USER: z.string().optional(),
  ETHEREAL_PASS: z.string().optional(),
  ETHEREAL_FROM_NAME: z.string().default('ReachInbox Demo'),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/api/slack/oauth/callback'),
  SLACK_SCOPES: z.string().default('chat:write,im:write'),
  BULL_BOARD_USER: z.string().default('admin'),
  BULL_BOARD_PASSWORD: z.string().default('admin')
});

export const env = schema.parse(process.env);
