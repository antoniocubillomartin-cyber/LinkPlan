const { XMLParser } = require('fast-xml-parser');

const SOURCES = {
  esmadrid: 'https://www.esmadrid.com/opendata/agenda_v1_es.xml',
  madridsecreto: 'https://madridsecreto.co/feed/',
  entradas: 'https://www.entradas.com/city/madrid-370/conciertos-y-festivales-85/',
  // Agenda municipal oficial (datos abiertos del Ayuntamiento). Los enlaces apuntan a madrid.es.
  madriddatos: 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json'
};
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Lista blanca: SOLO se muestran noticias cuyo enlace pertenezca a estas webs.
// Cualquier item con URL de otro dominio se descarta (no se "inventan" webs).
const ALLOWED_HOSTS = [
  'feverup.com',
  'madridsecreto.co',
  'timeout.es',
  'thefork.es',
  'guiarepsol.com',
  'esmadrid.com',
  'entradas.com',
  'madrid.es'
];

function hostAllowed(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
    return ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
const FETCH_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', trimValues: true });

let cache = { at: 0, items: [] };

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return String(v['#text'] ?? '').trim();
  return String(v).trim();
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', deg: '°', middot: '·',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ccedil: 'Ç'
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n] !== undefined ? ENTITIES[n] : m))
    .trim();
}

// Busca un <item name="X"> dentro de una lista de items de esMadrid
function findNamedItem(items, name) {
  for (const it of asArray(items)) {
    if (it && it['@_name'] === name) return textOf(it);
  }
  return '';
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// "DD/MM/YYYY" -> Date | null
function parseEsDate(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function scoreByProximity(start, end) {
  const today = startOfToday();
  if (!start) return 40; // sin fecha clara: relevancia media
  const effectiveEnd = end || start;
  if (effectiveEnd < today) return -1; // terminado
  const days = Math.round((start - today) / 86_400_000);
  if (days < -10) return -1; // empezó hace mucho → permanente
  return Math.min(100, Math.max(0, 100 - Math.abs(days) * 3));
}

function scoreByRecency(published) {
  if (!published) return 0;
  const days = Math.round((startOfToday() - published) / 86_400_000);
  if (days > 45) return -1; // demasiado viejo
  return Math.min(100, Math.max(0, 100 - days * 3));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEsMadrid(xml) {
  const doc = parser.parse(xml);
  const services = asArray(doc?.serviceList?.service);
  return services.map((s) => {
    const basic = s.basicData || {};
    const extra = s.extradata || {};

    let categoria = '';
    for (const c of asArray(extra?.categorias?.categoria)) {
      categoria = findNamedItem(c?.item, 'Categoria');
      if (categoria) break;
    }

    const rango = asArray(extra?.fechas?.rango)[0] || {};
    const start = parseEsDate(textOf(rango.inicio));
    const end = parseEsDate(textOf(rango.fin));

    const pago = findNamedItem(extra?.item, 'Servicios de pago');
    const body = stripHtml(textOf(basic.body));
    const free = /gratis|gratuit|entrada libre/i.test(pago) || /gratis|gratuit|entrada libre/i.test(body);

    const media = asArray(s?.multimedia?.media)[0];
    const image = media ? textOf(media?.url) || media?.['@_url'] || '' : '';

    return {
      id: `esmadrid-${textOf(s['@_id']) || textOf(basic.name)}`,
      source: 'esMadrid',
      title: decodeEntities(textOf(basic.name) || textOf(basic.title)),
      category: categoria ? `📌 ${decodeEntities(categoria)}` : '✨ Evento',
      description: decodeEntities(body).slice(0, 280),
      date: start ? start.toISOString().slice(0, 10) : null,
      time: null,
      free,
      price: null,
      venue: decodeEntities(textOf(s?.geoData?.address)) || null,
      url: textOf(basic.web) || null,
      image: image || null,
      score: scoreByProximity(start, end)
    };
  });
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function normalizeMadridSecreto(xml) {
  const doc = parser.parse(xml);
  const items = asArray(doc?.rss?.channel?.item);
  return items.map((it) => {
    const published = it.pubDate ? new Date(it.pubDate) : null;
    const cat = asArray(it.category)[0];
    return {
      id: `msecreto-${textOf(it.guid) || textOf(it.link)}`,
      source: 'Madrid Secreto',
      title: decodeEntities(textOf(it.title)),
      category: cat ? `📰 ${decodeEntities(textOf(cat))}` : '📰 Madrid Secreto',
      description: decodeEntities(stripHtml(textOf(it.description))).slice(0, 280),
      date: published && !Number.isNaN(published.getTime()) ? published.toISOString().slice(0, 10) : null,
      time: null,
      free: false,
      price: null,
      venue: null,
      url: textOf(it.link) || null,
      image: null,
      score: scoreByRecency(published && !Number.isNaN(published.getTime()) ? published : null)
    };
  });
}

// Entradas.com renderiza los conciertos como JSON-LD (schema.org/ItemList → MusicEvent).
function normalizeEntradas(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const events = [];
  for (const block of blocks) {
    let json;
    try {
      json = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(json) ? json : [json];
    const lists = [];
    for (const node of nodes) {
      if (node && node['@type'] === 'ItemList') lists.push(node);
      for (const g of asArray(node?.['@graph'])) if (g && g['@type'] === 'ItemList') lists.push(g);
    }
    for (const list of lists) {
      for (const li of asArray(list.itemListElement)) {
        const ev = li && li.item ? li.item : li;
        if (!ev || !ev.name) continue;
        const rawStart = typeof ev.startDate === 'string' ? ev.startDate : null;
        const offers = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
        const url = (offers && typeof offers.url === 'string' && offers.url) || (typeof ev.url === 'string' ? ev.url : null);
        const venue = ev.location && ev.location.name ? decodeEntities(textOf(ev.location.name)) : null;
        const lowPrice = offers && offers.lowPrice != null ? Number(offers.lowPrice) : null;
        const start = rawStart ? new Date(rawStart) : null;
        const end = typeof ev.endDate === 'string' ? new Date(ev.endDate) : null;
        events.push({
          id: `entradas-${url || ev.name}`,
          source: 'Entradas',
          title: decodeEntities(String(ev.name)),
          category: '🎵 Conciertos',
          description: venue ? `Concierto en ${venue}` : 'Concierto y festivales en Madrid',
          date: rawStart ? rawStart.slice(0, 10) : null,
          time: rawStart && rawStart.length >= 16 ? rawStart.slice(11, 16) : null,
          free: false,
          price: lowPrice != null && !Number.isNaN(lowPrice) ? `Desde ${Math.round(lowPrice)}€` : null,
          venue,
          url,
          image: null,
          score: scoreByProximity(start && !Number.isNaN(start.getTime()) ? start : null, end && !Number.isNaN(end.getTime()) ? end : null)
        });
      }
    }
  }
  return events;
}

// "2026-06-07 19:00:00.0" -> Date | null
function parseMadridDatosDate(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value.trim().replace(' ', 'T').replace(/\.\d+$/, ''));
  return Number.isNaN(d.getTime()) ? null : d;
}

function categoryFromType(typeUri) {
  const segment = String(typeUri || '').split('/').pop() || '';
  const pretty = segment.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return pretty ? `🎭 ${pretty}` : '🎭 Evento';
}

// Agenda municipal (datos.madrid.es): JSON oficial con @graph de eventos.
function normalizeMadridDatos(jsonText) {
  let doc;
  try {
    doc = JSON.parse(jsonText);
  } catch {
    return [];
  }
  return asArray(doc['@graph']).map((e) => {
    const start = parseMadridDatosDate(e.dtstart);
    const end = parseMadridDatosDate(e.dtend);
    const free = e.free === 1 || e.free === '1' || e.free === true;
    const priceText = typeof e.price === 'string' ? e.price.trim() : '';
    const loc = typeof e['event-location'] === 'string' ? e['event-location'].trim() : '';
    const venue = loc ? decodeEntities(loc) : null;
    return {
      id: `madrid-${e.id || e.uid || e.link}`,
      source: 'Agenda Madrid',
      title: decodeEntities(textOf(e.title)),
      category: categoryFromType(e['@type']),
      description: venue ? `Agenda municipal · ${venue}` : 'Agenda municipal de Madrid',
      date: typeof e.dtstart === 'string' ? e.dtstart.slice(0, 10) : null,
      time: typeof e.time === 'string' && e.time.trim() ? e.time.trim() : null,
      free,
      price: free ? null : priceText || null,
      venue,
      url: typeof e.link === 'string' ? e.link : null,
      image: null,
      score: scoreByProximity(start, end)
    };
  });
}

// Reparte las noticias en round-robin por fuente para que el feed alterne entre
// webs (esMadrid / Madrid Secreto / Entradas / Agenda Madrid) sin que domine una.
function interleaveBySource(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.source)) groups.set(item.source, []);
    groups.get(item.source).push(item);
  }
  const queues = [...groups.values()];
  const result = [];
  let pushed = true;
  while (pushed) {
    pushed = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next);
        pushed = true;
      }
    }
  }
  return result;
}

async function loadItems() {
  if (cache.items.length && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;

  const [esmadridXml, madridsecretoXml, entradasHtml, madridDatosJson] = await Promise.all([
    fetchText(SOURCES.esmadrid).catch(() => null),
    fetchText(SOURCES.madridsecreto).catch(() => null),
    fetchText(SOURCES.entradas).catch(() => null),
    fetchText(SOURCES.madriddatos).catch(() => null)
  ]);

  let items = [];
  const collect = (raw, normalizer) => {
    if (!raw) return;
    try {
      items = items.concat(normalizer(raw));
    } catch {
      /* feed con formato inesperado: se ignora */
    }
  };
  collect(esmadridXml, normalizeEsMadrid);
  collect(madridsecretoXml, normalizeMadridSecreto);
  collect(entradasHtml, normalizeEntradas);
  collect(madridDatosJson, normalizeMadridDatos);

  const seen = new Set();
  items = items
    .filter((e) => e.title && e.url && e.score >= 0 && hostAllowed(e.url))
    .filter((e) => {
      const key = e.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || ''));

  items = interleaveBySource(items);

  if (items.length) cache = { at: Date.now(), items };
  return items;
}

async function getTrendingNews({ limit = 15 } = {}) {
  const items = await loadItems();
  return { updatedAt: new Date(cache.at || Date.now()).toISOString(), total: items.length, items: items.slice(0, limit) };
}

module.exports = { getTrendingNews };
