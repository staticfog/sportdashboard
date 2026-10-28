// ESPN's public site API (unofficial, no key). See README for the caveats.
import { outcomeOf, toNumber } from './util.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const V2 = 'https://site.api.espn.com/apis/v2/sports';

export function espnScheduleUrl(path, teamId, query = '') {
  return `${SITE}/${path}/teams/${encodeURIComponent(teamId)}/schedule${query ? `?${query}` : ''}`;
}

export function espnStandingsUrl(path, level) {
  return `${V2}/${path}/standings${level ? `?level=${level}` : ''}`;
}

function scoreOf(score) {
  if (score && typeof score === 'object') return toNumber(score.value ?? score.displayValue);
  return toNumber(score);
}

export function mapEspnStatus(type = {}) {
  const name = String(type.name ?? '');
  if (type.completed === true) return 'final';
  if (/POSTPONED/.test(name)) return 'postponed';
  if (/CANCEL/.test(name)) return 'cancelled';
  if (type.state === 'in') return 'live';
  if (type.state === 'pre') return 'scheduled';
  return 'other';
}

/** Normalise a team schedule response to a list of games from our team's point of view. */
export function parseEspnSchedule(json, { teamId, competition }) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.events)) {
    throw new Error('ESPN-programma: antwoord bevat geen events-lijst');
  }
  const games = [];
  for (const ev of json.events) {
    const comp = ev?.competitions?.[0];
    const competitors = comp?.competitors;
    if (!Array.isArray(competitors) || competitors.length !== 2) continue;
    const us = competitors.find((c) => String(c?.team?.id ?? c?.id) === String(teamId));
    const them = competitors.find((c) => c !== us);
    if (!us || !them) continue;
    const date = new Date(ev.date);
    if (Number.isNaN(date.getTime())) continue;

    const status = mapEspnStatus(comp.status?.type ?? ev.status?.type);
    const game = {
      id: `espn-${ev.id}`,
      date: date.toISOString(),
      timeKnown: ev.timeValid !== false,
      competition,
      home: us.homeAway === 'home',
      opponent: them.team?.displayName ?? them.team?.name ?? 'Onbekende tegenstander',
      opponentShort: them.team?.abbreviation ?? null,
      status,
      teamScore: null,
      opponentScore: null,
      outcome: null,
    };
    if (status === 'final' || status === 'live') {
      game.teamScore = scoreOf(us.score);
      game.opponentScore = scoreOf(them.score);
    }
    if (status === 'final') {
      game.outcome = outcomeOf(game.teamScore, game.opponentScore, us.winner, them.winner);
    }
    games.push(game);
  }
  return games;
}

export function espnNewsUrl(path) {
  return `${SITE}/${path}/news?limit=50`;
}

const MAX_TEAM_TAGS = 2;

/**
 * League news, kept when the headline matches `match`, or when ESPN tagged the article with our team
 * and at most two teams in total (league round-ups such as power rankings tag every team).
 * Used instead of ESPN's RSS on www.espn.com, which does not answer requests from GitHub Actions.
 */
export function parseEspnNews(json, { teamId, source = 'ESPN', match } = {}) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.articles)) {
    throw new Error('ESPN-nieuws: antwoord bevat geen articles-lijst');
  }
  const filter = match ? new RegExp(match, 'i') : null;
  const items = [];
  for (const a of json.articles) {
    if (!a || a.type === 'Media') continue;
    const title = String(a.headline ?? '').replace(/\s+/g, ' ').trim();
    const url = a.links?.web?.href;
    if (!title || typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
    const teams = (Array.isArray(a.categories) ? a.categories : []).filter((c) => c?.type === 'team');
    const tagged = teams.length <= MAX_TEAM_TAGS && teams.some((c) => String(c.teamId) === String(teamId));
    if (!tagged && !(filter && filter.test(title))) continue;
    const d = new Date(a.published);
    items.push({ title, url, date: Number.isNaN(d.getTime()) ? null : d.toISOString(), source });
  }
  return items;
}

function collectGroups(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  const entries = node.standings?.entries;
  if (Array.isArray(entries) && entries.length > 0) out.push({ name: node.name ?? null, entries });
  for (const child of Array.isArray(node.children) ? node.children : []) collectGroups(child, out);
  return out;
}

/**
 * Find the table (league, conference or division) that contains our team.
 * columns: [{ key, label }] with ESPN stat names as keys.
 */
export function parseEspnStandings(json, { teamId, name, sort = 'rank', columns }) {
  const groups = collectGroups(json);
  if (groups.length === 0) throw new Error('ESPN-stand: geen tabellen in antwoord');
  const group = groups.find((g) => g.entries.some((e) => String(e?.team?.id) === String(teamId)));
  if (!group) throw new Error(`ESPN-stand: team ${teamId} niet gevonden`);

  const rows = group.entries.map((e, index) => {
    const stats = Object.fromEntries((Array.isArray(e.stats) ? e.stats : []).map((s) => [s.name, s]));
    return {
      order: index,
      rankValue: toNumber(stats.rank?.value) ?? Infinity,
      pct: toNumber(stats.winPercent?.value) ?? -1,
      wins: toNumber(stats.wins?.value) ?? -1,
      row: {
        team: e.team?.displayName ?? e.team?.name ?? 'Onbekend',
        short: e.team?.abbreviation ?? null,
        highlight: String(e.team?.id) === String(teamId),
        values: columns.map((c) => {
          const v = stats[c.key]?.displayValue;
          return v === undefined || v === null || v === '' ? '–' : String(v);
        }),
      },
    };
  });

  rows.sort((a, b) =>
    sort === 'winPercent'
      ? b.pct - a.pct || b.wins - a.wins || a.order - b.order
      : a.rankValue - b.rankValue || a.order - b.order,
  );

  return {
    name: name ?? group.name ?? 'Stand',
    columns: columns.map((c) => c.label),
    rows: rows.map((r, i) => ({ rank: i + 1, ...r.row })),
  };
}
