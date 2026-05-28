const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TIMEOUT_MS = 7000;
const LOG_PATH = path.resolve(__dirname, '../../logs/url-validation.json');

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'LinkPlan-URLValidator/1.0' }
    });
    return { valid: res.ok, statusCode: res.status, responseTimeMs: Date.now() - startedAt, error: null };
  } catch (err) {
    return { valid: false, statusCode: null, responseTimeMs: Date.now() - startedAt, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const venues = await prisma.venue.findMany({ select: { id: true, name: true, url: true } });
  const now = new Date();
  const results = [];

  for (const v of venues) {
    const r = await checkUrl(v.url);
    await prisma.venue.update({
      where: { id: v.id },
      data: { urlValid: r.valid, lastStatusCode: r.statusCode, lastVerified: now }
    });
    if (!r.valid) {
      console.warn(`⚠️  ${v.id} ${v.name} → ${v.url} :: ${r.statusCode ?? r.error}`);
    }
    results.push({ id: v.id, name: v.name, url: v.url, ...r });
  }

  const broken = results.filter((r) => !r.valid);
  const summary = {
    checkedAt: now.toISOString(),
    total: results.length,
    valid: results.length - broken.length,
    broken: broken.length,
    brokenList: broken.map((b) => ({ id: b.id, name: b.name, url: b.url, statusCode: b.statusCode, error: b.error }))
  };

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
