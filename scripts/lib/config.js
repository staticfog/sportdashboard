// Validates teams.config.json, so a typo in a new team fails loudly instead of producing an empty card.
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9-]+$/;

export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') throw new Error('config: geen object');
  if (!Array.isArray(config.teams) || config.teams.length === 0) errors.push('teams: minimaal één team nodig');
  const presets = config.columnPresets ?? {};
  const ids = new Set();

  for (const [i, t] of (config.teams ?? []).entries()) {
    const at = `teams[${i}]${t?.id ? ` (${t.id})` : ''}`;
    if (!t?.id || !ID.test(t.id)) errors.push(`${at}: id moet bestaan uit kleine letters, cijfers of -`);
    else if (ids.has(t.id)) errors.push(`${at}: id komt dubbel voor`);
    else ids.add(t.id);
    if (!t?.name) errors.push(`${at}: name ontbreekt`);
    if (!HEX.test(t?.colors?.light ?? '') || !HEX.test(t?.colors?.dark ?? '')) {
      errors.push(`${at}: colors.light en colors.dark moeten #rrggbb zijn`);
    }
    for (const [j, g] of (t?.games ?? []).entries()) {
      if (g.type === 'espn' && (!g.path || !g.teamId)) errors.push(`${at}.games[${j}]: espn vraagt path en teamId`);
      else if (g.type === 'mlb' && !g.teamId) errors.push(`${at}.games[${j}]: mlb vraagt teamId`);
      else if (g.type !== 'espn' && g.type !== 'mlb') errors.push(`${at}.games[${j}]: onbekend type "${g.type}"`);
      if (!g.competition) errors.push(`${at}.games[${j}]: competition ontbreekt`);
    }
    for (const [j, s] of (t?.standings ?? []).entries()) {
      const cols = typeof s.columns === 'string' ? presets[s.columns] : s.columns;
      if (!Array.isArray(cols) || cols.length === 0) errors.push(`${at}.standings[${j}]: columns onbekend of leeg`);
      if (s.type === 'espn' && (!s.path || !s.teamId)) errors.push(`${at}.standings[${j}]: espn vraagt path en teamId`);
      else if (s.type === 'mlb' && (!s.teamId || !s.leagueId || !s.divisionId)) {
        errors.push(`${at}.standings[${j}]: mlb vraagt teamId, leagueId en divisionId`);
      } else if (s.type !== 'espn' && s.type !== 'mlb') errors.push(`${at}.standings[${j}]: onbekend type "${s.type}"`);
    }
    for (const [j, n] of (t?.news ?? []).entries()) {
      if (!/^https?:\/\//.test(n?.url ?? '')) errors.push(`${at}.news[${j}]: url moet met http(s) beginnen`);
      if (!n?.source) errors.push(`${at}.news[${j}]: source ontbreekt`);
      if (n?.match) {
        try {
          new RegExp(n.match, 'i');
        } catch {
          errors.push(`${at}.news[${j}]: match is geen geldige regex`);
        }
      }
    }
  }
  if (errors.length) throw new Error(`Fouten in teams.config.json:\n- ${errors.join('\n- ')}`);

  return {
    timezone: config.timezone ?? 'Europe/Amsterdam',
    limits: { results: 5, fixtures: 4, news: 6, ...config.limits },
    summary: { enabled: true, model: 'claude-opus-5-5', ...config.summary },
    teams: config.teams.map((t) => ({
      ...t,
      games: t.games ?? [],
      news: t.news ?? [],
      standings: (t.standings ?? []).map((s) => ({
        ...s,
        columns: typeof s.columns === 'string' ? presets[s.columns] : s.columns,
      })),
    })),
  };
}

/** Stable key per source, used to match fresh data with the previous run. */
export function sourceKey(kind, src) {
  if (src.key) return `${kind}:${src.key}`;
  if (src.type === 'mlb') return `${kind}:mlb-${src.teamId}${src.divisionId ? `-${src.divisionId}` : ''}`;
  return `${kind}:espn-${src.path}-${src.teamId}`;
}
