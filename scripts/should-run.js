// Gate for the hourly workflow: prints run=true|false to $GITHUB_OUTPUT. Needs no npm packages.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldRun } from './lib/schedule.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const index = readJson(path.join(DATA_DIR, 'index.json'));
const gameDates = [];
for (const t of index?.teams ?? []) {
  const team = readJson(path.join(DATA_DIR, `${t.id}.json`));
  for (const g of [...(team?.fixtures?.items ?? []), ...(team?.results?.items ?? [])]) gameDates.push(g.date);
}

const decision = shouldRun({
  now: new Date(),
  timeZone: index?.timezone ?? 'Europe/Amsterdam',
  lastRunDate: index?.lastRunDate ?? null,
  gameDates,
  force: process.env.FORCE_RUN === 'true',
});

console.log(`run=${decision.run} (${decision.reason})`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
