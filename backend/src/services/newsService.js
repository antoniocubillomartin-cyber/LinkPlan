const FEED_URL = 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h

let cache = { at: 0, items: [] };

const CATEGORY_LABELS = {
  Fiestas: '🎉 Fiestas',
  Conciertos: '🎵 Música',
  Musica: '🎵 Música',
  DanzaBaile: '🩰 Danza',
  TeatroPerformance: '🎭 Teatro',
  Teatro: '🎭 Teatro',
  ExposicionesYMuseos: '🖼️ Exposiciones',
  Exposiciones: '🖼️ Exposiciones',
  CursosTalleres: '📚 Talleres',
  Cine: '🎬 Cine',
  Literatura: '📖 Literatura',
  Recitales: '🎤 Recitales',
  RecitalesPresentacionesActosLiterarios: '🎤 Recitales',
  ClubesLectura: '📖 Clubes de lectura',
  ConferenciasColoquios: '🗣️ Conferencias',
  ExcursionesItinerariosVisitas: '🧭 Rutas y visitas',
  ProgramacionDestacadaAgendaCultura: '⭐ Destacado',
  DeportesActividadesDeportivas: '🏅 Deporte',
  Infantil: '🧸 Infantil'
};

function categoryFromType(type) {
  if (!type || typeof type !== 'string') return '✨ Evento';
  const slug = type.split('/').pop() || '';
  if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
  if (!slug) return '✨ Evento';
  const humanized = slug.replace(/([a-z])([A-Z])/g, '$1 $2');
  return `✨ ${humanized}`;
}

function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value.slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function scoreEvent(start, end, free) {
  const today = startOfToday();
  if (!start) return -1;
  const effectiveEnd = end || start;
  if (effectiveEnd < today) return -1; // ya terminado
  const days = Math.round((start - today) / 86_400_000);
  if (days < -7) return -1; // empezó hace más de una semana → permanente, no es "novedad"
  // Pico cerca de hoy: lo que empieza pronto o acaba de empezar es lo más "trending".
  let score = Math.max(0, 100 - Math.abs(days) * 3);
  if (free) score += 3;
  return Math.min(100, score);
}

function normalize(raw) {
  const start = parseDate(raw.dtstart);
  const end = parseDate(raw.dtend);
  const free = raw.free === 1 || raw.free === '1';
  const score = scoreEvent(start, end, free);
  const venue =
    raw['event-location'] ||
    raw.organization?.['organization-name'] ||
    raw.address?.area?.['street-address'] ||
    null;

  return {
    id: String(raw.id ?? raw.uid ?? raw['@id'] ?? raw.title),
    title: (raw.title || '').trim(),
    category: categoryFromType(raw['@type']),
    description: (raw.description || '').slice(0, 280),
    date: raw.dtstart ? raw.dtstart.slice(0, 10) : null,
    time: raw.time || null,
    free,
    price: free ? null : (raw.price || '').trim() || null,
    venue: venue ? String(venue).trim() : null,
    url: raw.link || null,
    score
  };
}

async function fetchFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GatosYCanas/1.0', Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Feed respondió ${res.status}`);
    const json = await res.json();
    return Array.isArray(json['@graph']) ? json['@graph'] : [];
  } finally {
    clearTimeout(timer);
  }
}

async function loadItems() {
  if (cache.items.length && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.items;
  }
  const graph = await fetchFeed();
  const seen = new Set();
  const items = graph
    .map(normalize)
    .filter((e) => e.title && e.url && e.score >= 0)
    .filter((e) => {
      const key = `${e.title}|${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || (a.date || '').localeCompare(b.date || ''));

  cache = { at: Date.now(), items };
  return items;
}

async function getTrendingNews({ limit = 15 } = {}) {
  const items = await loadItems();
  return { updatedAt: new Date(cache.at).toISOString(), total: items.length, items: items.slice(0, limit) };
}

module.exports = { getTrendingNews };
