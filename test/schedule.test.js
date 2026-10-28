import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRun } from '../scripts/lib/schedule.js';

const tz = 'Europe/Amsterdam';
const base = { timeZone: tz, lastRunDate: '2026-10-28', gameDates: [] };

test('forced or first run always runs', () => {
  assert.equal(shouldRun({ ...base, now: new Date('2026-10-28T12:00:00Z'), force: true }).run, true);
  assert.equal(shouldRun({ ...base, now: new Date('2026-10-28T12:00:00Z'), lastRunDate: null }).run, true);
});

test('first run of the day from 07:00 Amsterdam', () => {
  // 05:30 UTC = 06:30 Amsterdam (winter time): too early
  assert.equal(shouldRun({ ...base, lastRunDate: '2026-10-28', now: new Date('2026-10-29T05:30:00Z') }).run, false);
  // 06:10 UTC = 07:10 Amsterdam
  assert.equal(shouldRun({ ...base, lastRunDate: '2026-10-28', now: new Date('2026-10-29T06:10:00Z') }).run, true);
  // already ran today
  assert.equal(shouldRun({ ...base, lastRunDate: '2026-10-29', now: new Date('2026-10-29T09:00:00Z') }).run, false);
});

test('game window: one hour before until five hours after kick-off', () => {
  const gameDates = ['2026-10-28T20:00:00.000Z'];
  const at = (iso) => shouldRun({ ...base, gameDates, now: new Date(iso) }).run;
  assert.equal(at('2026-10-28T18:30:00Z'), false);
  assert.equal(at('2026-10-28T19:05:00Z'), true);
  assert.equal(at('2026-10-28T22:00:00Z'), true);
  assert.equal(at('2026-10-29T01:30:00Z'), false);
});
