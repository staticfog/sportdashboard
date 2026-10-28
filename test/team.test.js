// End-to-end for one team with faked network: config -> fetch -> merge -> views.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig } from '../scripts/lib/config.js';
import { buildTeam } from '../scripts/lib/team.js';
import { fixture } from './helpers.js';

const config = validateConfig(JSON.parse(readFileSync(new URL('../teams.config.json', import.meta.url), 'utf8')));
const ajax = config.teams.find((t) => t.id === 'ajax');
const yankees = config.teams.find((t) => t.id === 'yankees');
const NOW = '2026-10-28T08:00:00.000Z';
const RSS = '<rss version="2.0"><channel><item><title>Ajax nieuws</title><link>https://e.nl/1</link></item></channel></rss>';

function fakeNet(routes, { feedsUp = true } = {}) {
  const fetchJson = async (url) => {
    for (const [pattern, body] of routes) if (url.includes(pattern)) return structuredClone(body);
    throw new Error(`HTTP 404 bij ${url}`);
  };
  const fetchText = async (url) => {
    if (feedsUp && url.includes('parool')) return RSS;
    throw new Error('HTTP 503');
  };
  return { fetchJson, fetchText };
}

const ajaxRoutes = [
  ['ned.1/teams/139/schedule?fixture=true', fixture('espn-soccer-fixtures.json')],
  ['ned.1/teams/139/schedule', fixture('espn-soccer-results.json')],
  ['ned.1/standings', fixture('espn-soccer-standings.json')],
];

test('Ajax: Conference League down, Eredivisie fine -> partial data, clearly marked', async () => {
  const net = fakeNet(ajaxRoutes);
  const out = await buildTeam(ajax, null, config, { ...net, now: NOW, client: null });

  assert.equal(out.results.status, 'stale');
  assert.deepEqual(out.results.issues, [{ source: 'Conference League', status: 'unavailable' }]);
  assert.equal(out.results.items.length, 3);
  assert.equal(out.fixtures.items[0].opponent, 'AZ Alkmaar');

  assert.equal(out.standings[0].status, 'ok');
  assert.equal(out.standings[0].table.rows.find((r) => r.highlight).rank, 2);
  assert.equal(out.standings[1].status, 'unavailable');
  assert.equal(out.standings[1].table, null);

  assert.equal(out.news.status, 'ok');
  assert.deepEqual(out.news.failedSources, ['NOS']);
  assert.equal(out.news.items[0].title, 'Ajax nieuws');

  assert.equal(out.summary.status, 'unavailable');
  assert.equal(out.season.active, true);
  assert.equal(out.updatedAt, NOW);
});

test('Ajax: second run with every source down keeps the old data as stale', async () => {
  const first = await buildTeam(ajax, null, config, { ...fakeNet(ajaxRoutes), now: NOW, client: null });
  const later = '2026-10-28T09:00:00.000Z';
  const down = await buildTeam(ajax, first, config, { ...fakeNet([], { feedsUp: false }), now: later, client: null });

  assert.equal(down.results.status, 'stale');
  assert.equal(down.results.items.length, 3);
  assert.equal(down.standings[0].status, 'stale');
  assert.equal(down.standings[0].updatedAt, NOW);
  assert.equal(down.news.status, 'stale');
  assert.equal(down.news.items.length, 1);
});

test('Ajax: unchanged second run produces identical output (no commit)', async () => {
  const first = await buildTeam(ajax, null, config, { ...fakeNet(ajaxRoutes), now: NOW, client: null });
  const again = await buildTeam(ajax, first, config, { ...fakeNet(ajaxRoutes), now: '2026-10-28T09:00:00.000Z', client: null });
  assert.deepEqual(again, first);
});

test('Yankees in winter: final standings, no games, off-season', async () => {
  const winter = '2027-01-15T08:00:00.000Z';
  const net = fakeNet([
    ['schedule', fixture('mlb-schedule.json')],
    ['standings', fixture('mlb-standings.json')],
  ]);
  const out = await buildTeam(yankees, null, config, { ...net, now: winter, client: null });
  assert.equal(out.season.active, false);
  assert.equal(out.fixtures.items.length, 0);
  assert.equal(out.results.items.length, 4);
  assert.equal(out.standings[0].table.name, 'AL East');
  assert.equal(out.standings[0].table.rows[1].highlight, true);
});

test('Knicks: ESPN news via the API, failing RSS reported with its error', async () => {
  const knicks = config.teams.find((t) => t.id === 'knicks');
  const net = fakeNet([['basketball/nba/news', fixture('espn-nba-news.json')]], { feedsUp: false });
  const out = await buildTeam(knicks, null, config, { ...net, now: NOW, client: null });
  assert.equal(out.news.status, 'ok');
  assert.equal(out.news.items.length, 2);
  assert.deepEqual(out.news.failedSources, ['Posting and Toasting']);
  assert.deepEqual(out.sections.news.data.failures, [{ source: 'Posting and Toasting', error: 'HTTP 503' }]);
});

test('summary is generated once and then served from cache', async () => {
  let calls = 0;
  const deps = {
    ...fakeNet(ajaxRoutes),
    client: {},
    generateSummary: async () => (calls++, 'Ajax won twee keer.'),
  };
  const first = await buildTeam(ajax, null, config, { ...deps, now: NOW });
  const second = await buildTeam(ajax, first, config, { ...deps, now: '2026-10-28T09:00:00.000Z' });
  assert.equal(calls, 1);
  assert.equal(second.summary.text, 'Ajax won twee keer.');
  assert.equal(second.summary.status, 'ok');
});

test('config validation catches mistakes in a new team', () => {
  const bad = {
    teams: [
      { id: 'Ajax!', name: 'A', colors: { light: 'red', dark: '#000000' }, games: [{ type: 'espn' }], news: [{ url: 'ftp://x' }] },
    ],
  };
  assert.throws(() => validateConfig(bad), (err) => {
    assert.match(err.message, /id moet/);
    assert.match(err.message, /colors/);
    assert.match(err.message, /path en teamId/);
    assert.match(err.message, /competition ontbreekt/);
    assert.match(err.message, /http/);
    return true;
  });
  assert.throws(() => validateConfig({ teams: [] }), /minimaal één team/);
});
