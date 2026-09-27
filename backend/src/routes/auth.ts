import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';

export const authRouter = Router();

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: env.GOOGLE_CALLBACK_URL
  }, async (_accessToken, _refreshToken, profile: Profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('Google account did not provide an email'));
      const user = await prisma.user.upsert({
        where: { email },
        update: { googleId: profile.id, name: profile.displayName, avatarUrl: profile.photos?.[0]?.value },
        create: { email, googleId: profile.id, name: profile.displayName, avatarUrl: profile.photos?.[0]?.value }
      });
      await prisma.sender.upsert({
        where: { userId_email: { userId: user.id, email } },
        update: {},
        create: { userId: user.id, email, displayName: user.name }
      });
      done(null, user);
    } catch (error) { done(error as Error); }
  }));
}

authRouter.get('/google', (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.' });
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

authRouter.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login?error=oauth', session: false }), (req, res) => {
  const user = req.user as any;
  req.session.userId = user.id;
  res.redirect(`${env.FRONTEND_URL}/`);
});

authRouter.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated' });
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, include: { senders: true, slackConnection: { select: { teamName: true } } } });
  if (!user) return res.status(401).json({ message: 'Not authenticated' });
  res.json({ ...user, slackConnected: Boolean(user.slackConnection) });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.post('/demo', async (req, res) => {
  if (env.NODE_ENV !== 'development') return res.status(404).json({ message: 'Not found' });
  const user = await prisma.user.upsert({
    where: { email: 'demo@reachinbox.local' },
    update: { avatarUrl: null },
    create: { email: 'demo@reachinbox.local', name: 'Oliver Brown' }
  });
  await prisma.sender.upsert({ where: { userId_email: { userId: user.id, email: 'oliver.brown@domain.io' } }, update: {}, create: { userId: user.id, email: 'oliver.brown@domain.io', displayName: user.name } });
  req.session.userId = user.id;
  res.json({ ok: true });
});
