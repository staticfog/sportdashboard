// RSS 2.0 / Atom / RDF parsing. Only headline, link, date and source are kept: never article text.
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function text(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text']);
  return String(v);
}

function clean(s) {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function linkOf(item) {
  const links = asArray(item.link);
  // Atom: <link rel="alternate" href="..."/>
  const atom = links.find((l) => l && typeof l === 'object' && l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate'));
  if (atom) return atom['@_href'];
  const plain = links.map(text).find(Boolean);
  if (plain) return plain.trim();
  const guid = item.guid;
  if (guid && (typeof guid !== 'object' || guid['@_isPermaLink'] !== 'false')) return text(guid).trim();
  return '';
}

function dateOf(item) {
  const raw = text(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']);
  const d = new Date(raw);
  return raw && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * Parse a feed into [{ title, url, date, source }].
 * match: optional regex (string) a headline or description must contain, for general feeds.
 */
export function parseFeed(xml, { source, match } = {}) {
  if (typeof xml !== 'string' || xml.trim() === '') throw new Error('RSS: leeg antwoord');
  if (XMLValidator.validate(xml) !== true) throw new Error('RSS: ongeldige XML');
  const doc = parser.parse(xml);
  const rawItems = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item;
  if (!doc?.rss?.channel && !doc?.feed && !doc?.['rdf:RDF']) throw new Error('RSS: geen RSS- of Atom-feed');

  const filter = match ? new RegExp(match, 'i') : null;
  const items = [];
  for (const item of asArray(rawItems)) {
    if (!item || typeof item !== 'object') continue;
    const title = clean(text(item.title));
    const url = linkOf(item);
    if (!title || !isHttpUrl(url)) continue;
    if (filter) {
      const haystack = `${title} ${clean(text(item.description ?? item.summary))}`;
      if (!filter.test(haystack)) continue;
    }
    items.push({ title, url, date: dateOf(item), source });
  }
  return items;
}

/** Merge items of several feeds: dedupe by url, newest first, undated last. */
export function mergeNews(lists, limit) {
  const seen = new Set();
  const all = [];
  for (const item of lists.flat()) {
    const key = item.url.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(item);
  }
  all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return all.slice(0, limit);
}
