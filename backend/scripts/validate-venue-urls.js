const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { validateAllVenues } = require('../src/services/urlValidationService');

const prisma = new PrismaClient();
const LOG_PATH = path.resolve(__dirname, '../../logs/url-validation.json');

async function main() {
  const summary = await validateAllVenues(prisma);

  for (const b of summary.brokenList) {
    console.warn(`⚠️  ${b.id} ${b.name} → ${b.url} :: ${b.statusCode ?? b.error}`);
  }

  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(summary, null, 2));
  } catch (err) {
    console.warn('No se pudo escribir el log:', err.message);
  }

  console.log(`URLs verificadas: ${summary.valid}/${summary.total} OK, ${summary.broken} caídas.`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
