// Fetches every source of one team and assembles the JSON the site reads.
import {
  espnNewsUrl,
  espnScheduleUrl,
  espnStandingsUrl,
  parseEspnNews,
  parseEspnSchedule,
  parseEspnStandings,
} from './espn.js';
import { mlbScheduleUrl, mlbSeasonFor, mlbStandingsUrl, parseMlbSchedule, parseMlbStandings } from './mlb.js';
import { mergeNews, parseFeed } from './rss.js';
import { sourceKey } from './config.js';
import { buildGameViews, buildNewsView, buildStandingsView, mergeSection, teamUpdatedAt } from './store.js';
import { resolveSummary, summaryInput } from './summary.js';
import { fetchJson as defaultFetchJson, fetchText as defaultFetchText } from './util.js';

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function loadEspnGames(src, { fetchJson }) {
  const required = src.queries ?? [''];
  const optional = src.optionalQueries ?? [];
  const lists = await Promise.all(
    required.map(async (q) => parseEspnSchedule(await fetchJson(espnScheduleUrl(src.path, src.teamId, q)), src)),
  );
  for (const q of optional) {
    // e.g. the play-offs: often empty or missing, never a reason to mark the team stale
    try {
      lists.push(parseEspnSchedule(await fetchJson(espnScheduleUrl(src.path, src.teamId, q)), src));
    } catch {
      /* optional */
    }
  }
  const byId = new Map(lists.flat().map((g) => [g.id, g]));
  return [...byId.values()];
}

async function loadMlbGames(src, { fetchJson, now }) {
  const season = mlbSeasonFor(new Date(now));
  const games = parseMlbSchedule(await fetchJson(mlbScheduleUrl(src.teamId, season)), src);
  if (games.some((g) => g.status === 'final')) return games;
  // Before opening day: show last season's results next to the new schedule.
  const previous = parseMlbSchedule(await fetchJson(mlbScheduleUrl(src.teamId, season - 1)), src);
  return [...previous, ...games];
}

async function loadStandings(src, { fetchJson, now }) {
  if (src.type === 'mlb') {
    const season = mlbSeasonFor(new Date(now));
    try {
      return parseMlbStandings(await fetchJson(mlbStandingsUrl(src.leagueId, season)), src);
    } catch (err) {
      // Before opening day the new season may have no table yet.
      try {
        return parseMlbStandings(await fetchJson(mlbStandingsUrl(src.leagueId, season - 1)), src);
      } catch {
        throw err;
      }
    }
  }
  return parseEspnStandings(await fetchJson(espnStandingsUrl(src.path, src.level)), src);
}

async function loadFeed(feed, { fetchJson, fetchText }) {
  if (feed.type === 'espn') return parseEspnNews(await fetchJson(espnNewsUrl(feed.path)), feed);
  return parseFeed(await fetchText(feed.url), feed);
}

async function loadNews(feeds, { fetchJson, fetchText, limit }) {
  const settled = await Promise.all(
    feeds.map(async (feed) => ({ feed, ...(await attempt(() => loadFeed(feed, { fetchJson, fetchText }))) })),
  );
  const ok = settled.filter((s) => s.ok);
  if (feeds.length > 0 && ok.length === 0) {
    throw new Error(`alle nieuwsbronnen faalden (${settled.map((s) => `${s.feed.source}: ${s.error}`).join('; ')})`);
  }
  return {
    items: mergeNews(ok.map((s) => s.value), limit),
    failedSources: settled.filter((s) => !s.ok).map((s) => s.feed.source),
    failures: settled.filter((s) => !s.ok).map((s) => ({ source: s.feed.source, error: s.error })),
  };
}

/**
 * deps: { fetchJson, fetchText, client, now } so tests can inject fakes.
 */
export async function buildTeam(team, prev, config, deps) {
  const { now, client } = deps;
  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const fetchText = deps.fetchText ?? defaultFetchText;
  const prevSections = prev?.sections ?? {};
  const sections = {};

  const gameSections = await Promise.all(
    team.games.map(async (src) => {
      const key = sourceKey('games', src);
      const loader = src.type === 'mlb' ? loadMlbGames : loadEspnGames;
      const fresh = await attempt(() => loader(src, { fetchJson, now }));
      sections[key] = mergeSection(prevSections[key], fresh, now);
      return { label: src.competition, section: sections[key] };
    }),
  );

  const standings = await Promise.all(
    team.standings.map(async (src) => {
      const key = sourceKey('standings', src);
      const fresh = await attempt(() => loadStandings(src, { fetchJson, now }));
      sections[key] = mergeSection(prevSections[key], fresh, now);
      return buildStandingsView(src.name ?? 'Stand', sections[key]);
    }),
  );

  const newsFresh = await attempt(() => loadNews(team.news, { fetchJson, fetchText, limit: config.limits.news }));
  sections.news = mergeSection(prevSections.news, newsFresh, now);

  const views = buildGameViews(gameSections, { now, limits: config.limits });
  const out = {
    id: team.id,
    name: team.name,
    short: team.short ?? null,
    sport: team.sport ?? null,
    colors: team.colors,
    competitions: [...new Set(team.games.map((g) => g.competition))],
    season: views.season,
    results: views.results,
    fixtures: views.fixtures,
    standings,
    news: buildNewsView(sections.news),
  };

  if (config.summary.enabled) {
    out.summary = await resolveSummary(prev?.summary, summaryInput(out, config.timezone), {
      client,
      model: config.summary.model,
      now,
      generate: deps.generateSummary,
    });
  } else {
    out.summary = { status: 'disabled', text: null, hash: null, generatedAt: null, model: null, error: null };
  }

  out.updatedAt = teamUpdatedAt(out);
  out.sections = sections;
  return out;
}
