import axios from 'axios';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { redis } from '../config/redis.js';

export function slackConfigured() {
  let callback: URL;
  try { callback = new URL(env.SLACK_REDIRECT_URI); } catch { return false; }
  const hasPlaceholderHost = /your-tunnel-domain|example\.com/i.test(callback.hostname);
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) && callback.protocol === 'https:' && !hasPlaceholderHost;
}

export function slackAuthorizeUrl(userId: string) {
  const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(userId).digest('hex');
  const state = `${userId}.${signature}`;
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID ?? '',
    scope: env.SLACK_SCOPES,
    redirect_uri: env.SLACK_REDIRECT_URI,
    state
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export function verifySlackState(state: string) {
  const [userId, signature] = state.split('.');
  if (!userId || !signature) throw new Error('Invalid Slack OAuth state');
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(userId).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid Slack OAuth state');
  return userId;
}

export async function handleSlackCallback(code: string, userId: string) {
  const body = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID ?? '',
    client_secret: env.SLACK_CLIENT_SECRET ?? '',
    code,
    redirect_uri: env.SLACK_REDIRECT_URI
  });
  const response = await axios.post('https://slack.com/api/oauth.v2.access', body, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  });
  if (!response.data.ok) throw new Error(response.data.error || 'Slack OAuth failed');
  await prisma.slackConnection.upsert({
    where: { userId },
    update: { accessToken: response.data.access_token, teamId: response.data.team?.id, teamName: response.data.team?.name, botUserId: response.data.bot_user_id, slackUserId: response.data.authed_user?.id },
    create: { userId, accessToken: response.data.access_token, teamId: response.data.team?.id, teamName: response.data.team?.name, botUserId: response.data.bot_user_id, slackUserId: response.data.authed_user?.id }
  });
}

export async function notifyRateLimit(userId: string, senderEmail: string, limit: number) {
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!connection) return;
  const hour = new Date().toISOString().slice(0, 13);
  const dedupeKey = `slack:rate-limit:${userId}:${senderEmail}:${hour}`;
  const claim = crypto.randomUUID();
  const lockValue = `sending:${claim}`;
  const claimed = await redis.set(dedupeKey, lockValue, 'EX', 30, 'NX');
  if (claimed !== 'OK') return;
  try {
    let channel = connection.slackUserId;
    if (channel) {
      const opened = await axios.post('https://slack.com/api/conversations.open', { users: channel }, {
        headers: { Authorization: `Bearer ${connection.accessToken}` }, timeout: 10_000
      });
      if (!opened.data.ok) throw new Error(`Slack conversations.open failed: ${opened.data.error ?? 'unknown_error'}`);
      channel = opened.data.channel?.id;
    }
    if (!channel) throw new Error('Slack connection has no user ID for the rate-limit direct message.');
    const sent = await axios.post('https://slack.com/api/chat.postMessage', {
      channel,
      text: `ReachInbox rate limit reached for ${senderEmail}. The configured hourly limit (${limit}) was reached; remaining emails are being rescheduled to the next available hour.`
    }, { headers: { Authorization: `Bearer ${connection.accessToken}` }, timeout: 10_000 });
    if (!sent.data.ok) throw new Error(`Slack chat.postMessage failed: ${sent.data.error ?? 'unknown_error'}`);
    await redis.set(dedupeKey, 'sent', 'EX', 60 * 60 * 2);
  } catch (error) {
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1, dedupeKey, lockValue
    );
    console.warn('Slack notification failed:', error instanceof Error ? error.message : error);
  }
}
