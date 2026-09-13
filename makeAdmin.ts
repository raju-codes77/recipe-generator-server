import { prisma } from './src/lib/prisma.js';

async function main() {
  await prisma.user.updateMany({
    data: { role: 'ADMIN' },
  });
  console.log('Users updated to ADMIN');
}

main().catch(console.error).finally(() => prisma.$disconnect());
