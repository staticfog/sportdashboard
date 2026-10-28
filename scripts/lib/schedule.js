// Decides whether an hourly workflow run should actually fetch.
import { localDate, localHour } from './util.js';

export const MORNING_HOUR = 7;
const BEFORE_MS = 1 * 3600 * 1000;
const AFTER_MS = 5 * 3600 * 1000;

/**
 * Run when: forced, no data yet, the first run of the day from 07:00 (Amsterdam),
 * or a game starts within the next hour or started less than five hours ago.
 */
export function shouldRun({ now, timeZone, lastRunDate, gameDates, force = false }) {
  if (force) return { run: true, reason: 'handmatig gestart' };
  if (!lastRunDate) return { run: true, reason: 'nog geen data' };
  if (localHour(now, timeZone) >= MORNING_HOUR && localDate(now, timeZone) !== lastRunDate) {
    return { run: true, reason: 'ochtendronde' };
  }
  const t = now.getTime();
  const near = gameDates.find((d) => {
    const start = new Date(d).getTime();
    return start - BEFORE_MS <= t && t <= start + AFTER_MS;
  });
  if (near) return { run: true, reason: `wedstrijd rond ${near}` };
  return { run: false, reason: 'geen wedstrijd in de buurt' };
}
