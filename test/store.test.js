import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGameViews, combinedStatus, mergeSection } from '../scripts/lib/store.js';

const T0 = '2026-10-20T08:00:00.000Z';
const T1 = '2026-10-21T08:00:00.000Z';

test('mergeSection: new data is ok with a fresh timestamp', () => {
  const s = mergeSection(null, { ok: true, value: [1] }, T1);
  assert.deepEqual(s, { status: 'ok', updatedAt: T1, data: [1], error: null });
});

test('mergeSection: unchanged data keeps its timestamp (nothing to commit)', () => {
  const prev = { status: 'ok', updatedAt: T0, data: { b: 1, a: 2 }, error: null };
  const s = mergeSection(prev, { ok: true, value: { a: 2, b: 1 } }, T1);
  assert.equal(s.updatedAt, T0);
});

test('mergeSection: failure keeps old data, marked stale', () => {
  const prev = { status: 'ok', updatedAt: T0, data: [1], error: null };
  const s = mergeSection(prev, { ok: false, error: 'HTTP 503' }, T1);
  assert.deepEqual(s, { status: 'stale', updatedAt: T0, data: [1], error: 'HTTP 503' });
});

test('mergeSection: failure without old data is unavailable', () => {
  assert.equal(mergeSection(null, { ok: false, error: 'x' }, T1).status, 'unavailable');
  const prev = { status: 'unavailable', updatedAt: null, data: null, error: 'x' };
  assert.equal(mergeSection(prev, { ok: false, error: 'y' }, T1).status, 'unavailable');
});

test('mergeSection: recovery after a failure gets a new timestamp', () => {
  const prev = { status: 'stale', updatedAt: T0, data: [1], error: 'x' };
  const s = mergeSection(prev, { ok: true, value: [1] }, T1);
  assert.equal(s.status, 'ok');
  assert.equal(s.updatedAt, T1);
});

test('combinedStatus', () => {
  assert.equal(combinedStatus([{ status: 'ok' }, { status: 'ok' }]), 'ok');
  assert.equal(combinedStatus([{ status: 'ok' }, { status: 'unavailable' }]), 'stale');
  assert.equal(combinedStatus([{ status: 'unavailable' }]), 'unavailable');
  assert.equal(combinedStatus([]), 'unavailable');
});

const game = (id, date, status, extra = {}) => ({ id, date, status, competition: 'X', home: true, opponent: 'Y', ...extra });
const limits = { results: 2, fixtures: 2 };

test('buildGameViews: splits, sorts, limits and drops postponed/old fixtures', () => {
  const now = '2026-10-28T12:00:00.000Z';
  const section = {
    status: 'ok',
    updatedAt: T0,
    data: [
      game('a', '2026-10-20T18:00:00.000Z', 'final'),
      game('b', '2026-10-25T18:00:00.000Z', 'final'),
      game('c', '2026-10-10T18:00:00.000Z', 'final'),
      game('d', '2026-10-27T18:00:00.000Z', 'postponed'),
      game('e', '2026-10-01T18:00:00.000Z', 'scheduled'),
      game('f', '2026-11-05T18:00:00.000Z', 'scheduled'),
      game('g', '2026-10-28T11:00:00.000Z', 'live'),
      game('h', '2026-11-01T18:00:00.000Z', 'scheduled'),
    ],
  };
  const v = buildGameViews([{ label: 'X', section }], { now, limits });
  assert.deepEqual(v.results.items.map((g) => g.id), ['b', 'a']);
  assert.deepEqual(v.fixtures.items.map((g) => g.id), ['g', 'h']);
  assert.equal(v.results.status, 'ok');
  assert.equal(v.season.active, true);
});

test('buildGameViews: off-season when sources answered and nothing is planned', () => {
  const now = '2027-01-15T12:00:00.000Z';
  const section = { status: 'ok', updatedAt: T0, data: [game('a', '2026-10-08T00:00:00.000Z', 'final')] };
  const v = buildGameViews([{ label: 'MLB', section }], { now, limits });
  assert.equal(v.season.active, false);
  assert.equal(v.fixtures.items.length, 0);
  assert.equal(v.results.items.length, 1);
});

test('buildGameViews: a failing source is never mistaken for the off-season', () => {
  const now = '2027-01-15T12:00:00.000Z';
  const v = buildGameViews(
    [{ label: 'NBA', section: { status: 'unavailable', updatedAt: null, data: null } }],
    { now, limits },
  );
  assert.equal(v.season.active, true);
  assert.equal(v.results.status, 'unavailable');
  assert.deepEqual(v.results.issues, [{ source: 'NBA', status: 'unavailable' }]);
});

test('buildGameViews: one competition failing marks the combined view stale', () => {
  const now = '2026-10-28T12:00:00.000Z';
  const ok = { status: 'ok', updatedAt: T1, data: [game('a', '2026-10-25T18:00:00.000Z', 'final')] };
  const stale = { status: 'stale', updatedAt: T0, data: [game('b', '2026-10-22T18:00:00.000Z', 'final')] };
  const v = buildGameViews([{ label: 'Eredivisie', section: ok }, { label: 'Conference League', section: stale }], { now, limits });
  assert.equal(v.results.status, 'stale');
  assert.equal(v.results.updatedAt, T1);
  assert.deepEqual(v.results.items.map((g) => g.id), ['a', 'b']);
  assert.deepEqual(v.results.issues, [{ source: 'Conference League', status: 'stale' }]);
});
