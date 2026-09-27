import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { handleSlackCallback, slackAuthorizeUrl, slackConfigured, verifySlackState } from '../services/slack.js';
import { env } from '../config/env.js';

export const slackRouter = Router();
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!slackConfigured()) return res.status(503).json({ message: 'Configure Slack OAuth credentials and a real HTTPS callback URL in SLACK_REDIRECT_URI before connecting.' });
  res.redirect(slackAuthorizeUrl(req.session.userId!));
});
slackRouter.get('/oauth/callback', async (req, res) => {
  try {
    const state = String(req.query.state ?? '');
    const userId = verifySlackState(state);
    const code = String(req.query.code ?? '');
    if (!code) throw new Error('Missing Slack OAuth code');
    await handleSlackCallback(code, userId);
    res.redirect(`${env.FRONTEND_URL}/settings?slack=connected`);
  } catch (error) {
    console.error('Slack OAuth callback failed:', error instanceof Error ? error.message : 'Unknown error');
    res.redirect(`${env.FRONTEND_URL}/settings?slack=error`);
  }
});
slackRouter.post('/disconnect', requireAuth, async (req, res) => {
  await prisma.slackConnection.deleteMany({ where: { userId: req.session.userId! } });
  res.json({ ok: true });
});
slackRouter.get('/status', requireAuth, async (req, res) => {
  const connection = await prisma.slackConnection.findUnique({ where: { userId: req.session.userId! }, select: { teamName: true, createdAt: true } });
  res.json({ connected: Boolean(connection), teamName: connection?.teamName ?? null });
});
