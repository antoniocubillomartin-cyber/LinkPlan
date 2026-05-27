const { PrismaClient } = require('@prisma/client');
const { venues, demoUsers } = require('../src/data/seedData');

const prisma = new PrismaClient();

async function main() {
  for (const v of venues) {
    await prisma.venue.upsert({ where: { id: v.id }, update: v, create: v });
  }

  for (const u of demoUsers) {
    await prisma.user.upsert({ where: { id: u.id }, update: u, create: u });
  }

  console.log(`Seeded ${venues.length} venues, ${demoUsers.length} demo users (idempotent).`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
