import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMlbStatus, mlbSeasonFor, parseMlbSchedule, parseMlbStandings } from '../scripts/lib/mlb.js';
import { fixture } from './helpers.js';

const cols = [
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'V' },
  { key: 'gamesBack', label: 'ACH' },
  { key: 'streak', label: 'REEKS' },
];

test('Yankees schedule: postponed game excluded from finals, play-off rounds named', () => {
  const games = parseMlbSchedule(fixture('mlb-schedule.json'), { teamId: 147, competition: 'MLB' });
  assert.equal(games.length, 5);
  const postponed = games.filter((g) => g.status === 'postponed');
  assert.equal(postponed.length, 1);
  assert.equal(postponed[0].teamScore, null);

  const finals = games.filter((g) => g.status === 'final').sort((a, b) => a.date.localeCompare(b.date));
  assert.equal(finals.length, 4);
  assert.deepEqual(finals.map((g) => g.outcome), ['W', 'V', 'V', 'V']);
  assert.equal(finals[0].competition, 'MLB · AL Wild Card Series');
  const last = finals.at(-1);
  assert.equal(last.competition, 'MLB · AL Division Series');
  assert.equal(last.home, true);
  assert.equal(last.opponent, 'Tampa Bay Rays');
  assert.equal(`${last.teamScore}-${last.opponentScore}`, '3-4');
  const away = finals[1];
  assert.equal(away.home, false);
  assert.equal(`${away.teamScore}-${away.opponentScore}`, '0-1');
});

test('schedule: off-season (no dates) gives no games; malformed throws', () => {
  assert.deepEqual(parseMlbSchedule({ totalGames: 0, dates: [] }, { teamId: 147 }), []);
  for (const bad of [null, {}, { dates: {} }, 'x']) {
    assert.throws(() => parseMlbSchedule(bad, { teamId: 147 }), /MLB-programma/);
  }
});

test('schedule: games of other teams and broken games are ignored', () => {
  const json = {
    dates: [
      {
        games: [
          { gamePk: 1, gameDate: '2026-05-01T23:05:00Z', status: { abstractGameState: 'Preview' }, teams: { home: { team: { id: 1 } }, away: { team: { id: 2 } } } },
          { gamePk: 2, gameDate: '2026-05-02T23:05:00Z', status: { abstractGameState: 'Preview' }, teams: { home: { team: { id: 147, name: 'NYY' } } } },
          { gamePk: 3, gameDate: 'onzin', status: {}, teams: { home: { team: { id: 147 } }, away: { team: { id: 2 } } } },
        ],
      },
    ],
  };
  assert.deepEqual(parseMlbSchedule(json, { teamId: 147 }), []);
});

test('status mapping', () => {
  assert.equal(mapMlbStatus({ abstractGameState: 'Final', detailedState: 'Final' }), 'final');
  assert.equal(mapMlbStatus({ abstractGameState: 'Final', detailedState: 'Postponed' }), 'postponed');
  assert.equal(mapMlbStatus({ abstractGameState: 'Final', detailedState: 'Cancelled' }), 'cancelled');
  assert.equal(mapMlbStatus({ abstractGameState: 'Live', detailedState: 'In Progress' }), 'live');
  assert.equal(mapMlbStatus({ abstractGameState: 'Preview', detailedState: 'Scheduled' }), 'scheduled');
  assert.equal(mapMlbStatus(undefined), 'other');
});

test('season: January belongs to the previous season', () => {
  assert.equal(mlbSeasonFor(new Date('2027-01-15T12:00:00Z')), 2026);
  assert.equal(mlbSeasonFor(new Date('2027-03-01T12:00:00Z')), 2027);
  assert.equal(mlbSeasonFor(new Date('2026-10-28T12:00:00Z')), 2026);
});

test('AL East standings: Yankees second, highlighted', () => {
  const t = parseMlbStandings(fixture('mlb-standings.json'), { teamId: 147, divisionId: 201, name: 'AL East', columns: cols });
  assert.equal(t.name, 'AL East');
  assert.deepEqual(t.rows.map((r) => r.short), ['TB', 'NYY', 'BOS', 'BAL', 'TOR']);
  assert.equal(t.rows[1].highlight, true);
  assert.equal(t.rows[1].values.length, 4);
  assert.ok(t.rows.every((r) => r.values[3] !== undefined));
});

test('standings: malformed, missing division or team throws', () => {
  assert.throws(() => parseMlbStandings({}, { teamId: 147, divisionId: 201, columns: cols }), /records/);
  assert.throws(() => parseMlbStandings({ records: [] }, { teamId: 147, divisionId: 201, columns: cols }), /niet gevonden/);
  assert.throws(
    () => parseMlbStandings(fixture('mlb-standings.json'), { teamId: 999, divisionId: 201, columns: cols }),
    /niet in divisie/,
  );
});
