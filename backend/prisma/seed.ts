import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@reachinbox.local' },
    update: { avatarUrl: null },
    create: { email: 'demo@reachinbox.local', name: 'Oliver Brown' }
  });

  for (const sender of [
    { email: 'oliver.brown@domain.io', displayName: 'Oliver Brown' },
    { email: 'sales@domain.io', displayName: 'Sales Team' }
  ]) {
    await prisma.sender.upsert({ where: { userId_email: { userId: user.id, email: sender.email } }, update: {}, create: { userId: user.id, ...sender } });
  }
}

main().finally(() => prisma.$disconnect());
