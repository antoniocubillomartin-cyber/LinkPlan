const TIMEOUT_MS = 7000;

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'GatosYCanas-URLValidator/1.0' }
    });
    return { valid: res.ok, statusCode: res.status, responseTimeMs: Date.now() - startedAt, error: null };
  } catch (err) {
    return {
      valid: false,
      statusCode: null,
      responseTimeMs: Date.now() - startedAt,
      error: err.name === 'AbortError' ? 'timeout' : err.message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function validateAllVenues(prisma) {
  const venues = await prisma.venue.findMany({ select: { id: true, name: true, url: true } });
  const now = new Date();

  const results = await Promise.all(
    venues.map(async (v) => {
      const r = await checkUrl(v.url);
      await prisma.venue.update({
        where: { id: v.id },
        data: { urlValid: r.valid, lastStatusCode: r.statusCode, lastVerified: now }
      });
      return { id: v.id, name: v.name, url: v.url, ...r };
    })
  );

  const broken = results.filter((r) => !r.valid);
  return {
    checkedAt: now.toISOString(),
    total: results.length,
    valid: results.length - broken.length,
    broken: broken.length,
    brokenList: broken.map((b) => ({ id: b.id, name: b.name, url: b.url, statusCode: b.statusCode, error: b.error }))
  };
}

module.exports = { checkUrl, validateAllVenues };
