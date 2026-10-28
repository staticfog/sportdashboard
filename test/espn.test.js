import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEspnStatus, parseEspnSchedule, parseEspnStandings } from '../scripts/lib/espn.js';
import { fixture } from './helpers.js';

const soccerCols = [
  { key: 'gamesPlayed', label: 'GS' },
  { key: 'points', label: 'P' },
];
const nflCols = [
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'V' },
  { key: 'winPercent', label: 'PCT' },
];

test('NFL schedule: finished and upcoming games from the Eagles point of view', () => {
  const games = parseEspnSchedule(fixture('espn-nfl-schedule.json'), { teamId: '21', competition: 'NFL' });
  assert.equal(games.length, 5);
  const finals = games.filter((g) => g.status === 'final');
  assert.equal(finals.length, 3);
  assert.deepEqual(finals.map((g) => g.outcome), ['V', 'V', 'V']);
  const dal = finals.find((g) => g.opponentShort === 'DAL');
  assert.equal(dal.home, true);
  assert.equal(dal.teamScore, 21);
  assert.equal(dal.opponentScore, 38);
  const jax = finals.find((g) => g.opponentShort === 'JAX');
  assert.equal(jax.home, false);

  const upcoming = games.filter((g) => g.status === 'scheduled');
  assert.equal(upcoming.length, 2);
  assert.ok(upcoming.every((g) => g.teamScore === null && g.outcome === null));
  assert.equal(upcoming[0].date, '2026-11-02T01:20:00.000Z');
});

test('soccer results: wins and a draw, with home/away', () => {
  const games = parseEspnSchedule(fixture('espn-soccer-results.json'), { teamId: '139', competition: 'Eredivisie' });
  const byOpp = Object.fromEntries(games.map((g) => [g.opponentShort, g]));
  assert.equal(byOpp.SPA.outcome, 'W');
  assert.equal(byOpp.SPA.home, false);
  assert.equal(`${byOpp.SPA.teamScore}-${byOpp.SPA.opponentScore}`, '2-1');
  assert.equal(byOpp.GRO.outcome, 'W');
  assert.equal(byOpp.NEC.outcome, 'G');
  assert.equal(byOpp.NEC.home, true);
  assert.ok(games.every((g) => g.competition === 'Eredivisie'));
});

test('soccer fixtures: scheduled, no scores', () => {
  const games = parseEspnSchedule(fixture('espn-soccer-fixtures.json'), { teamId: '139', competition: 'Eredivisie' });
  assert.equal(games.length, 2);
  assert.equal(games[0].opponent, 'AZ Alkmaar');
  assert.equal(games[0].home, true);
  assert.equal(games[0].status, 'scheduled');
  assert.equal(games[1].home, false);
});

test('schedule: empty events list gives no games', () => {
  assert.deepEqual(parseEspnSchedule({ events: [] }, { teamId: '21', competition: 'NFL' }), []);
});

test('schedule: malformed responses throw', () => {
  for (const bad of [null, {}, { events: 'x' }, 'html', 42]) {
    assert.throws(() => parseEspnSchedule(bad, { teamId: '21', competition: 'NFL' }), /ESPN-programma/);
  }
});

test('schedule: broken events are skipped, missing scores stay null', () => {
  const json = {
    events: [
      { id: '1', date: '2026-10-01T18:00Z', competitions: [] },
      { id: '2', date: 'geen datum', competitions: [{ competitors: [{ team: { id: '21' } }, { team: { id: '1' } }] }] },
      {
        id: '3',
        date: '2026-10-02T18:00Z',
        competitions: [
          {
            status: { type: { state: 'post', completed: true, name: 'STATUS_FINAL' } },
            competitors: [
              { homeAway: 'home', team: { id: '21', displayName: 'Eagles' } },
              { homeAway: 'away', team: { id: '1', displayName: 'Falcons' } },
            ],
          },
        ],
      },
    ],
  };
  const games = parseEspnSchedule(json, { teamId: '21', competition: 'NFL' });
  assert.equal(games.length, 1);
  assert.equal(games[0].status, 'final');
  assert.equal(games[0].teamScore, null);
  assert.equal(games[0].outcome, null);
});

test('status mapping', () => {
  assert.equal(mapEspnStatus({ state: 'post', completed: true }), 'final');
  assert.equal(mapEspnStatus({ state: 'post', completed: false, name: 'STATUS_POSTPONED' }), 'postponed');
  assert.equal(mapEspnStatus({ state: 'post', name: 'STATUS_CANCELED' }), 'cancelled');
  assert.equal(mapEspnStatus({ state: 'in', name: 'STATUS_IN_PROGRESS' }), 'live');
  assert.equal(mapEspnStatus({ state: 'pre' }), 'scheduled');
  assert.equal(mapEspnStatus(undefined), 'other');
});

test('Eredivisie standings: 18 rows by rank, Ajax highlighted', () => {
  const t = parseEspnStandings(fixture('espn-soccer-standings.json'), {
    teamId: '139',
    name: 'Eredivisie',
    sort: 'rank',
    columns: soccerCols,
  });
  assert.equal(t.name, 'Eredivisie');
  assert.deepEqual(t.columns, ['GS', 'P']);
  assert.equal(t.rows.length, 18);
  const ajax = t.rows.filter((r) => r.highlight);
  assert.equal(ajax.length, 1);
  assert.equal(ajax[0].rank, 2);
  assert.deepEqual(t.rows.map((r) => r.rank), Array.from({ length: 18 }, (_, i) => i + 1));
});

test('NFL standings: finds NFC East and sorts by win percentage', () => {
  const t = parseEspnStandings(fixture('espn-nfl-standings.json'), { teamId: '21', sort: 'winPercent', columns: nflCols });
  assert.equal(t.name, 'NFC East');
  assert.deepEqual(t.rows.map((r) => r.short), ['NYG', 'DAL', 'PHI', 'WSH']);
  assert.equal(t.rows[2].highlight, true);
  assert.equal(t.rows[2].values.length, 3);
});

test('standings: missing stat shows a dash', () => {
  const json = { children: [{ name: 'X', standings: { entries: [{ team: { id: '21', displayName: 'E' }, stats: [] }] } }] };
  const t = parseEspnStandings(json, { teamId: '21', columns: nflCols });
  assert.deepEqual(t.rows[0].values, ['–', '–', '–']);
});

test('standings: empty, malformed or team missing throws', () => {
  assert.throws(() => parseEspnStandings({}, { teamId: '21', columns: nflCols }), /geen tabellen/);
  assert.throws(() => parseEspnStandings(null, { teamId: '21', columns: nflCols }), /geen tabellen/);
  assert.throws(
    () => parseEspnStandings(fixture('espn-nfl-standings.json'), { teamId: '999', columns: nflCols }),
    /niet gevonden/,
  );
});
