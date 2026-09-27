import { redis } from '../config/redis.js';

const pacingScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local delay = tonumber(ARGV[2])
local last = tonumber(redis.call('GET', key) or '0')
local allowed = last + delay
if allowed > now then
  return allowed
end
redis.call('SET', key, now, 'PX', delay * 2)
return now
`;

const hourlyScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then redis.call('EXPIRE', key, ttl) end
if current <= limit then return 1 end
redis.call('DECR', key)
return 0
`;

export async function acquireSenderPacing(senderId: string, minDelayMs: number) {
  const now = Date.now();
  if (minDelayMs <= 0) return { allowedAt: now, waitMs: 0 };
  const key = `sender:pacing:${senderId}`;
  const result = Number(await redis.eval(pacingScript, 1, key, now, minDelayMs));
  return { allowedAt: result, waitMs: Math.max(0, result - now) };
}

export async function acquireHourlySlot(senderId: string, limit: number, at = new Date()) {
  const start = new Date(at);
  start.setUTCMinutes(0, 0, 0);
  const key = `sender:hour:${senderId}:${start.toISOString()}`;
  const allowed = Number(await redis.eval(hourlyScript, 1, key, limit, 60 * 60 * 3)) === 1;
  if (allowed) return { allowed: true, nextAt: undefined as Date | undefined };
  return { allowed: false, nextAt: new Date(start.getTime() + 60 * 60 * 1000) };
}
