import { createHash } from 'node:crypto';

const USER_AGENT = 'sportdashboard/1.0 (persoonlijk dashboard; +https://github.com)';

/** Fetch text with a timeout and one retry on network errors or 5xx. */
export async function fetchText(url, { timeoutMs = 15000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
      }
      return await res.text();
    } catch (err) {
      lastError = err;
      if (err.retryable === false) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`${lastError?.message ?? 'onbekende fout'} bij ${hostOf(url)}`);
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`geen geldige JSON van ${hostOf(url)}`);
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** JSON.stringify with sorted object keys, so equal data gives an equal string. */
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Calendar date (YYYY-MM-DD) of an instant in a given time zone. */
export function localDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function localHour(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
}

/** Readable local date-time for the summary prompt, e.g. "za 31 okt 21:00". */
export function formatLocal(iso, timeZone, withTime = true) {
  const opts = { timeZone, weekday: 'short', day: 'numeric', month: 'short' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat('nl-NL', opts).format(new Date(iso));
}

/** Outcome from our score vs theirs, with explicit winner flags taking precedence. */
export function outcomeOf(us, them, usWinner, themWinner) {
  if (usWinner === true) return 'W';
  if (themWinner === true) return 'V';
  if (us === null || them === null) return null;
  if (us > them) return 'W';
  if (us < them) return 'V';
  return 'G';
}
