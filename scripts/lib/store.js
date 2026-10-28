// Merging fresh fetch results with the previous JSON, and building the views the site reads.
import { stableStringify } from './util.js';

/**
 * fresh: { ok: true, value } | { ok: false, error }
 * - success: status "ok"; updatedAt only moves when the content changed (so unchanged runs commit nothing)
 * - failure with old data: keep it, status "stale"
 * - failure without old data: status "unavailable"
 */
export function mergeSection(prev, fresh, now) {
  if (fresh.ok) {
    const changed = !prev || prev.status !== 'ok' || stableStringify(prev.data) !== stableStringify(fresh.value);
    return { status: 'ok', updatedAt: changed ? now : prev.updatedAt, data: fresh.value, error: null };
  }
  if (prev && prev.data !== null && prev.data !== undefined) {
    return { status: 'stale', updatedAt: prev.updatedAt ?? null, data: prev.data, error: fresh.error };
  }
  return { status: 'unavailable', updatedAt: null, data: null, error: fresh.error };
}

export function combinedStatus(sections) {
  if (sections.length === 0) return 'unavailable';
  if (sections.every((s) => s.status === 'ok')) return 'ok';
  if (sections.every((s) => s.status === 'unavailable')) return 'unavailable';
  return 'stale';
}

function latest(dates) {
  return dates.filter(Boolean).sort().at(-1) ?? null;
}

const STALE_FIXTURE_MS = 6 * 3600 * 1000;
const RECENT_RESULT_MS = 10 * 24 * 3600 * 1000;

/**
 * gameSections: [{ label, section }] where section.data is a list of games.
 */
export function buildGameViews(gameSections, { now, limits }) {
  const nowMs = new Date(now).getTime();
  const byId = new Map();
  for (const { section } of gameSections) {
    for (const g of section.data ?? []) byId.set(g.id, g);
  }
  const games = [...byId.values()];

  const results = games
    .filter((g) => g.status === 'final')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limits.results);
  const fixtures = games
    .filter((g) => (g.status === 'scheduled' || g.status === 'live') && new Date(g.date).getTime() > nowMs - STALE_FIXTURE_MS)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limits.fixtures);

  const issues = gameSections
    .filter(({ section }) => section.status !== 'ok')
    .map(({ label, section }) => ({ source: label, status: section.status }));
  const status = combinedStatus(gameSections.map((s) => s.section));
  const updatedAt = latest(gameSections.map((s) => s.section.updatedAt));

  // Off-season only when the sources answered and there is genuinely nothing scheduled.
  const lastResultMs = results[0] ? new Date(results[0].date).getTime() : null;
  const allOk = status === 'ok';
  const active = !allOk || fixtures.length > 0 || (lastResultMs !== null && nowMs - lastResultMs < RECENT_RESULT_MS);

  return {
    results: { status, updatedAt, issues, items: results },
    fixtures: { status, updatedAt, issues, items: fixtures },
    season: { active },
  };
}

export function buildStandingsView(label, section) {
  return {
    label,
    status: section.status,
    updatedAt: section.updatedAt,
    table: section.data ?? null,
  };
}

export function buildNewsView(section) {
  return {
    status: section.status,
    updatedAt: section.updatedAt,
    failedSources: section.data?.failedSources ?? [],
    items: section.data?.items ?? [],
  };
}

export function teamUpdatedAt(team) {
  return latest([
    team.results.updatedAt,
    ...team.standings.map((s) => s.updatedAt),
    team.news.updatedAt,
    team.summary?.generatedAt,
  ]);
}
