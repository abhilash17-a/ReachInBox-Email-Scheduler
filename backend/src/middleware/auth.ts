import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ message: 'Authentication required' });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ message: 'Session expired' });
  res.locals.user = user;
  next();
}
