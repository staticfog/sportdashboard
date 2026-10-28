import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSummary, resolveSummary, summaryHash, summaryInput } from '../scripts/lib/summary.js';

const team = {
  name: 'Ajax',
  sport: 'Voetbal',
  season: { active: true },
  results: {
    status: 'ok',
    items: [
      { date: '2026-10-25T15:45:00.000Z', timeKnown: true, competition: 'Eredivisie', home: false, opponent: 'Sparta', status: 'final', teamScore: 2, opponentScore: 1, outcome: 'W' },
      { date: '2026-10-22T19:00:00.000Z', timeKnown: true, competition: 'Conference League', home: true, opponent: 'X', status: 'final', teamScore: null, opponentScore: null, outcome: null },
    ],
  },
  fixtures: { status: 'unavailable', items: [] },
  standings: [
    { label: 'Eredivisie', table: { name: 'Eredivisie', columns: ['P'], rows: [{ rank: 1, highlight: false, values: ['24'] }, { rank: 2, highlight: true, values: ['21'] }] } },
    { label: 'Conference League', table: null },
  ],
  news: { items: [{ title: 'Kop', source: 'NOS', url: 'https://x' }] },
};

test('summaryInput: only facts, "niet beschikbaar" for gaps, local time', () => {
  const input = summaryInput(team, 'Europe/Amsterdam');
  assert.equal(input.uitslagen[0].uitslag, '2-1');
  assert.equal(input.uitslagen[0].thuisOfUit, 'uit');
  assert.match(input.uitslagen[0].datum, /25 okt.*16:45/);
  assert.equal(input.uitslagen[1].uitslag, 'niet beschikbaar');
  assert.equal(input.programma, 'niet beschikbaar');
  assert.equal(input.stand[0].positie, 2);
  assert.equal(input.stand[0].vanTotaal, 2);
  assert.equal(input.stand[1].positie, 'niet beschikbaar');
  assert.deepEqual(input.nieuwskoppen, ['Kop (NOS)']);
});

test('summaryHash is stable and changes with the facts', () => {
  const a = summaryInput(team, 'Europe/Amsterdam');
  assert.equal(summaryHash(a), summaryHash(structuredClone(a)));
  assert.notEqual(summaryHash(a), summaryHash({ ...a, nieuwskoppen: ['Andere kop (NOS)'] }));
});

const NOW = '2026-10-28T08:00:00.000Z';
const input = { team: 'Ajax' };
const hash = summaryHash(input);

test('resolveSummary: cached when the input is unchanged, no API call', async () => {
  const prev = { status: 'ok', text: 'Oud.', hash, generatedAt: '2026-10-27T08:00:00.000Z', model: 'm' };
  let calls = 0;
  const s = await resolveSummary(prev, input, { client: {}, model: 'm', now: NOW, generate: async () => (calls++, 'Nieuw.') });
  assert.equal(calls, 0);
  assert.equal(s.text, 'Oud.');
  assert.equal(s.status, 'ok');
});

test('resolveSummary: regenerates when the input changed', async () => {
  const prev = { status: 'ok', text: 'Oud.', hash: 'anders', generatedAt: '2026-10-27T08:00:00.000Z', model: 'm' };
  const s = await resolveSummary(prev, input, { client: {}, model: 'm', now: NOW, generate: async () => 'Nieuw.' });
  assert.deepEqual(s, { status: 'ok', text: 'Nieuw.', hash, generatedAt: NOW, model: 'm', error: null });
});

test('resolveSummary: API failure keeps the old text, marked stale, and retries next run', async () => {
  const prev = { status: 'ok', text: 'Oud.', hash: 'anders', generatedAt: '2026-10-27T08:00:00.000Z', model: 'm' };
  const s = await resolveSummary(prev, input, {
    client: {},
    model: 'm',
    now: NOW,
    generate: async () => {
      throw new Error('529 overloaded');
    },
  });
  assert.equal(s.status, 'stale');
  assert.equal(s.text, 'Oud.');
  assert.equal(s.hash, 'anders');
  assert.match(s.error, /529/);
});

test('resolveSummary: no API key and no old text is unavailable', async () => {
  const s = await resolveSummary(null, input, { client: null, model: 'm', now: NOW });
  assert.equal(s.status, 'unavailable');
  assert.equal(s.text, null);
});

function fakeClient(response) {
  const calls = [];
  return { calls, beta: { messages: { create: async (params) => (calls.push(params), response) } } };
}

test('generateSummary: sends model, fallbacks and data; returns the text', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: ' Ajax won.\n Daarna gelijk. ' }] });
  const text = await generateSummary(client, input, { model: 'claude-opus-5-5' });
  assert.equal(text, 'Ajax won. Daarna gelijk.');
  const p = client.calls[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.match(p.messages[0].content, /"team": "Ajax"/);
});

test('generateSummary: refusals, truncation and empty answers throw', async () => {
  await assert.rejects(generateSummary(fakeClient({ stop_reason: 'refusal', content: [] }), input, { model: 'm' }), /geweigerd/);
  await assert.rejects(generateSummary(fakeClient({ stop_reason: 'max_tokens', content: [] }), input, { model: 'm' }), /afgebroken/);
  await assert.rejects(generateSummary(fakeClient({ stop_reason: 'end_turn', content: [] }), input, { model: 'm' }), /lege samenvatting/);
  await assert.rejects(
    generateSummary(fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x'.repeat(601) }] }), input, { model: 'm' }),
    /te lang/,
  );
});
