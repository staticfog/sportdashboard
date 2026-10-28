// Official MLB Stats API (statsapi.mlb.com, no key). See README for the terms.
import { outcomeOf, toNumber } from './util.js';

const BASE = 'https://statsapi.mlb.com/api/v1';

/** MLB seasons run within one calendar year; in Jan/Feb the last season is the previous year. */
export function mlbSeasonFor(date) {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() < 2 ? year - 1 : year;
}

export function mlbScheduleUrl(teamId, season) {
  return `${BASE}/schedule?sportId=1&teamId=${encodeURIComponent(teamId)}&season=${season}&gameType=R,F,D,L,W`;
}

export function mlbStandingsUrl(leagueId, season) {
  return `${BASE}/standings?leagueId=${encodeURIComponent(leagueId)}&season=${season}&hydrate=team`;
}

export function mapMlbStatus(status = {}) {
  const detailed = String(status.detailedState ?? '');
  if (/postpon/i.test(detailed)) return 'postponed';
  if (/cancel/i.test(detailed)) return 'cancelled';
  if (/suspend/i.test(detailed)) return 'other';
  switch (status.abstractGameState) {
    case 'Final':
      return 'final';
    case 'Live':
      return 'live';
    case 'Preview':
      return 'scheduled';
    default:
      return 'other';
  }
}

export function parseMlbSchedule(json, { teamId, competition = 'MLB' }) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.dates)) {
    throw new Error('MLB-programma: antwoord bevat geen dates-lijst');
  }
  const games = [];
  for (const day of json.dates) {
    for (const g of Array.isArray(day?.games) ? day.games : []) {
      const home = g?.teams?.home;
      const away = g?.teams?.away;
      if (!home?.team || !away?.team) continue;
      const isHome = Number(home.team.id) === Number(teamId);
      if (!isHome && Number(away.team.id) !== Number(teamId)) continue;
      const us = isHome ? home : away;
      const them = isHome ? away : home;
      const date = new Date(g.gameDate);
      if (Number.isNaN(date.getTime())) continue;

      const status = mapMlbStatus(g.status);
      const series = g.seriesDescription && g.seriesDescription !== 'Regular Season' ? g.seriesDescription : null;
      const game = {
        id: `mlb-${g.gamePk}-${date.toISOString()}`,
        date: date.toISOString(),
        timeKnown: g.status?.startTimeTBD !== true,
        competition: series ? `${competition} · ${series}` : competition,
        home: isHome,
        opponent: them.team.name ?? 'Onbekende tegenstander',
        opponentShort: them.team.abbreviation ?? null,
        status,
        teamScore: null,
        opponentScore: null,
        outcome: null,
      };
      if (status === 'final' || status === 'live') {
        game.teamScore = toNumber(us.score);
        game.opponentScore = toNumber(them.score);
      }
      if (status === 'final') {
        game.outcome = outcomeOf(game.teamScore, game.opponentScore, us.isWinner, them.isWinner);
      }
      games.push(game);
    }
  }
  return games;
}

const MLB_FIELDS = {
  streak: (r) => r.streak?.streakCode,
};

export function parseMlbStandings(json, { teamId, divisionId, name, columns }) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.records)) {
    throw new Error('MLB-stand: antwoord bevat geen records-lijst');
  }
  const record = json.records.find((r) => Number(r?.division?.id) === Number(divisionId));
  if (!record || !Array.isArray(record.teamRecords) || record.teamRecords.length === 0) {
    throw new Error(`MLB-stand: divisie ${divisionId} niet gevonden`);
  }
  const rows = record.teamRecords
    .map((r, index) => ({ r, index, rank: toNumber(r.divisionRank) ?? Infinity }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ r }, i) => ({
      rank: i + 1,
      team: r.team?.name ?? 'Onbekend',
      short: r.team?.abbreviation ?? null,
      highlight: Number(r.team?.id) === Number(teamId),
      values: columns.map((c) => {
        const v = MLB_FIELDS[c.key] ? MLB_FIELDS[c.key](r) : r[c.key];
        return v === undefined || v === null || v === '' ? '–' : String(v);
      }),
    }));
  if (!rows.some((r) => r.highlight)) throw new Error(`MLB-stand: team ${teamId} niet in divisie ${divisionId}`);
  return { name: name ?? record.division?.name ?? 'Stand', columns: columns.map((c) => c.label), rows };
}
