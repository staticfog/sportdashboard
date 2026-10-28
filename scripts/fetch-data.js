// Fetches all team data and writes public/data/*.json. Only rewrites files whose content changed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { validateConfig } from './lib/config.js';
import { buildTeam } from './lib/team.js';
import { localDate, stableStringify } from './lib/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function writeIfChanged(file, data, prev) {
  if (prev && stableStringify(prev) === stableStringify(data)) return false;
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return true;
}

async function main() {
  const config = validateConfig(JSON.parse(await readFile(path.join(ROOT, 'teams.config.json'), 'utf8')));
  await mkdir(DATA_DIR, { recursive: true });
  const now = new Date().toISOString();
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  if (!client) console.warn('Let op: ANTHROPIC_API_KEY ontbreekt, samenvattingen worden niet vernieuwd.');

  let anyChanged = false;
  for (const team of config.teams) {
    const file = path.join(DATA_DIR, `${team.id}.json`);
    const prev = await readJson(file);
    const next = await buildTeam(team, prev, config, { now, client });
    const changed = await writeIfChanged(file, next, prev);
    anyChanged ||= changed;
    const problems = Object.entries(next.sections)
      .filter(([, s]) => s.status !== 'ok')
      .map(([k, s]) => `${k}=${s.status} (${s.error})`);
    console.log(`${team.id}: ${changed ? 'bijgewerkt' : 'ongewijzigd'}${problems.length ? ` | ${problems.join(', ')}` : ''}`);
    if (next.summary.error) console.log(`${team.id}: samenvatting ${next.summary.status}: ${next.summary.error}`);
  }

  // The index also records the last run, refreshed at least once per (Amsterdam) day,
  // so the site can warn when the workflow itself has stopped running.
  const indexFile = path.join(DATA_DIR, 'index.json');
  const prevIndex = await readJson(indexFile);
  const today = localDate(new Date(now), config.timezone);
  const refresh = anyChanged || prevIndex?.lastRunDate !== today;
  const index = {
    timezone: config.timezone,
    teams: config.teams.map((t) => ({ id: t.id, name: t.name, short: t.short ?? null, colors: t.colors })),
    lastRunAt: refresh ? now : prevIndex.lastRunAt,
    lastRunDate: refresh ? today : prevIndex.lastRunDate,
  };
  await writeIfChanged(indexFile, index, prevIndex);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
