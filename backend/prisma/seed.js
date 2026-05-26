const { PrismaClient } = require('@prisma/client');
const { venues, demoUsers } = require('../src/data/seedData');

const prisma = new PrismaClient();

async function main() {
  await prisma.reservation.deleteMany();
  await prisma.planParticipant.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.venue.deleteMany();

  await prisma.venue.createMany({ data: venues });
  await prisma.user.createMany({ data: demoUsers });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
