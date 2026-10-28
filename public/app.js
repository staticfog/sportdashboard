// Renders the dashboard from data/*.json. All data goes in via textContent, never as HTML.
let TZ = 'Europe/Amsterdam';
const RUN_STALE_MS = 36 * 3600 * 1000;
const OUTCOME_LABEL = { W: 'winst', G: 'gelijk', V: 'verlies' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const fmt = (iso, opts) => new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, ...opts }).format(new Date(iso));
const day = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const shortDay = (iso) => fmt(iso, { day: 'numeric', month: 'short' });
const time = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit' });
const stamp = (iso) => (iso ? `${day(iso)} ${time(iso)}` : 'onbekend');

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function accentVars(colors) {
  const hex = /^#[0-9a-f]{6}$/i;
  return {
    '--accent-light': hex.test(colors?.light) ? colors.light : '#4a5563',
    '--accent-dark': hex.test(colors?.dark) ? colors.dark : '#a3afbd',
  };
}

const score = (g) => (g.teamScore !== null && g.opponentScore !== null ? `${g.teamScore}-${g.opponentScore}` : null);
const ordinal = (n) => `${n}e`;

/* ---------- small pieces ---------- */

function statusBadge(status) {
  if (status === 'stale') return h('span', { class: 'badge badge--stale' }, 'Verouderd');
  if (status === 'unavailable') return h('span', { class: 'badge badge--bad' }, 'Niet beschikbaar');
  return null;
}

function statusNote(view, what) {
  if (!view || view.status === 'ok') return null;
  const issues = (view.issues ?? [])
    .map((i) => `${i.source}: ${i.status === 'unavailable' ? 'niet beschikbaar' : 'verouderd'}`)
    .join(' · ');
  if (view.status === 'unavailable') {
    return h('p', { class: 'note note--bad' }, `${what} niet beschikbaar.${issues ? ` ${issues}` : ''}`);
  }
  const since = view.updatedAt ? ` Laatst bijgewerkt ${stamp(view.updatedAt)}.` : '';
  return h('p', { class: 'note note--stale' }, `Bron gaf een fout; oude gegevens getoond.${since}${issues ? ` ${issues}` : ''}`);
}

function section(title, hint, status, body) {
  return h(
    'details',
    { class: 'sec' },
    h('summary', {}, h('span', { class: 'sec__title' }, title), statusBadge(status), h('span', { class: 'sec__hint' }, hint ?? '')),
    h('div', { class: 'sec__body' }, body),
  );
}

function formStrip(results) {
  const last = results.slice(0, 5).reverse();
  if (last.length === 0) return null;
  const label = `Vorm, laatste ${last.length} van oud naar nieuw: ${last.map((g) => OUTCOME_LABEL[g.outcome] ?? 'onbekend').join(', ')}`;
  return h(
    'ol',
    { class: 'form', 'aria-label': label },
    last.map((g) =>
      h(
        'li',
        { class: `pill ${g.outcome ? `pill--${g.outcome}` : 'pill--x'}`, title: `${shortDay(g.date)} ${g.opponent} ${score(g) ?? ''}`.trim(), 'aria-hidden': 'true' },
        g.outcome ?? '?',
      ),
    ),
  );
}

/* ---------- scoreboard ---------- */

function ourTable(team) {
  for (const s of team.standings ?? []) {
    const row = s.table?.rows?.find((r) => r.highlight);
    if (row) return { name: s.table.name, row, size: s.table.rows.length };
  }
  return null;
}

function renderNext(team) {
  const next = team.fixtures.items[0];
  if (!next) {
    let title = 'Geen wedstrijden gepland';
    let label = 'Volgende wedstrijd';
    let foot = null;
    if (team.fixtures.status === 'unavailable') title = 'Programma niet beschikbaar';
    else if (!team.season.active) {
      label = 'Buiten het seizoen';
      const t = ourTable(team);
      if (t) foot = `Eindstand: ${ordinal(t.row.rank)} in ${t.name}`;
    }
    return h(
      'section',
      { class: 'board board--quiet', 'aria-label': label },
      h('p', { class: 'board__label' }, label),
      h('p', { class: 'board__title' }, title),
      foot && h('p', { class: 'board__foot' }, foot),
    );
  }

  const live = next.status === 'live';
  const us = { name: team.name, score: next.teamScore, us: true };
  const them = { name: next.opponent, score: next.opponentScore, us: false };
  const rows = next.home ? [us, them] : [them, us];
  const when = live
    ? h('div', { class: 'board__when' }, h('span', { class: 'board__live' }, 'Live'))
    : h(
        'div',
        { class: 'board__when' },
        h('span', { class: 'board__day' }, day(next.date)),
        h('span', { class: 'board__time' }, next.timeKnown ? time(next.date) : 'n.n.b.'),
      );

  return h(
    'section',
    { class: 'board', 'aria-label': live ? 'Wedstrijd bezig' : 'Volgende wedstrijd' },
    h('p', { class: 'board__label' }, `${live ? 'Nu bezig' : 'Volgende wedstrijd'} · ${next.competition}`),
    h(
      'div',
      { class: 'board__grid' },
      h(
        'ul',
        { class: 'board__teams' },
        rows.map((r) =>
          h(
            'li',
            { class: `board__team${r.us ? ' board__team--us' : ''}` },
            h('span', {}, r.name),
            live && h('span', { class: 'board__score' }, r.score ?? '–'),
          ),
        ),
      ),
      when,
    ),
    h('p', { class: 'board__foot' }, `${next.home ? 'Thuis' : 'Uit'}${next.timeKnown ? '' : ' · aftrap nog niet bekend'}`),
  );
}

/* ---------- sections ---------- */

function gameRow(g, isResult) {
  const s = score(g);
  return h(
    'li',
    { class: `game${isResult ? ' game--result' : ''}` },
    h(
      'span',
      { class: 'game__date mono' },
      isResult ? shortDay(g.date) : [day(g.date), h('br'), g.timeKnown ? time(g.date) : 'n.n.b.'],
    ),
    h('span', { class: 'game__ha', title: g.home ? 'Thuis' : 'Uit', 'aria-label': g.home ? 'Thuis' : 'Uit' }, g.home ? 'T' : 'U'),
    h('span', { class: 'game__opp' }, h('strong', {}, g.opponent), h('small', {}, g.competition)),
    isResult
      ? s
        ? h('span', { class: 'game__score mono' }, s)
        : h('span', { class: 'game__score game__score--na' }, 'niet beschikbaar')
      : g.status === 'live'
        ? h('span', { class: 'board__live' }, 'Live')
        : h('span'),
    isResult &&
      h(
        'span',
        { class: `pill ${g.outcome ? `pill--${g.outcome}` : 'pill--x'}`, 'aria-label': OUTCOME_LABEL[g.outcome] ?? 'uitkomst onbekend' },
        g.outcome ?? '?',
      ),
  );
}

function renderResults(team) {
  const v = team.results;
  const last = v.items[0];
  const hint = last ? `${last.outcome ?? '?'} ${score(last) ?? ''} ${last.opponentShort ?? last.opponent}`.replace(/\s+/g, ' ') : '';
  const body = [
    statusNote(v, 'Uitslagen'),
    v.items.length
      ? h('ul', { class: 'games' }, v.items.map((g) => gameRow(g, true)))
      : v.status !== 'unavailable' && h('p', { class: 'empty' }, 'Nog geen uitslagen.'),
  ];
  return section('Uitslagen', hint, v.status, body);
}

function renderFixtures(team) {
  const v = team.fixtures;
  const hint = v.items.length ? `${v.items.length} gepland` : team.season.active ? 'geen' : 'buiten het seizoen';
  const body = [
    statusNote(v, 'Programma'),
    v.items.length
      ? h('ul', { class: 'games' }, v.items.map((g) => gameRow(g, false)))
      : v.status !== 'unavailable' && h('p', { class: 'empty' }, team.season.active ? 'Geen wedstrijden gepland.' : 'Buiten het seizoen: geen wedstrijden gepland.'),
  ];
  return section('Programma', hint, v.status, body);
}

/** Long tables (e.g. 36 teams) are condensed to the top 3 plus the rows around our team. */
function visibleRows(rows) {
  if (rows.length <= 20) return rows;
  const at = rows.findIndex((r) => r.highlight);
  const keep = new Set([0, 1, 2]);
  for (let i = at - 2; i <= at + 2; i++) if (i >= 0 && i < rows.length) keep.add(i);
  const out = [];
  let prev = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i - prev > 1) out.push(null);
    out.push(rows[i]);
    prev = i;
  }
  if (prev < rows.length - 1) out.push(null);
  return out;
}

function renderTable(view, seasonActive) {
  const t = view.table;
  if (!t) return h('p', { class: 'note note--bad' }, `Stand ${view.label} niet beschikbaar.`);
  const cols = t.columns.length + 2;
  return h(
    'div',
    { class: 'table-wrap' },
    statusNote(view, `Stand ${t.name}`),
    h(
      'table',
      { class: 'standings' },
      h('caption', {}, `${t.name}${seasonActive ? '' : ' · eindstand'}`),
      h(
        'thead',
        {},
        h('tr', {}, h('th', { scope: 'col', class: 't-rank' }, '#'), h('th', { scope: 'col', class: 't-team' }, 'Team'), t.columns.map((c) => h('th', { scope: 'col' }, c))),
      ),
      h(
        'tbody',
        {},
        visibleRows(t.rows).map((r) =>
          r === null
            ? h('tr', { class: 'gap' }, h('td', { colspan: cols, 'aria-hidden': 'true' }, '⋯'))
            : h(
                'tr',
                { class: r.highlight ? 'is-us' : null, 'aria-current': r.highlight ? 'true' : null },
                h('td', { class: 't-rank' }, r.rank),
                h('td', { class: 't-team', title: r.team }, r.team),
                r.values.map((v) => h('td', { class: 't-num' }, v)),
              ),
        ),
      ),
    ),
  );
}

function renderStandings(team) {
  const views = team.standings ?? [];
  if (views.length === 0) return null;
  const t = ourTable(team);
  const hint = t ? `${ordinal(t.row.rank)} van ${t.size} · ${t.name}` : '';
  const statuses = views.map((v) => v.status);
  const status = statuses.every((s) => s === 'ok') ? 'ok' : statuses.every((s) => s === 'unavailable') ? 'unavailable' : 'stale';
  return section('Stand', hint, status, views.map((v) => renderTable(v, team.season.active)));
}

function renderNews(team) {
  const v = team.news;
  const items = v.items.filter((n) => safeUrl(n.url));
  const failed = v.failedSources?.length ? h('p', { class: 'note note--stale' }, `Niet bereikbaar: ${v.failedSources.join(', ')}.`) : null;
  const body = [
    statusNote(v, 'Nieuws'),
    v.status === 'ok' && failed,
    items.length
      ? h(
          'ul',
          { class: 'news' },
          items.map((n) =>
            h(
              'li',
              {},
              h(
                'a',
                { href: safeUrl(n.url), target: '_blank', rel: 'noopener noreferrer' },
                h('span', { class: 'news__title' }, n.title),
                h('span', { class: 'news__meta' }, `${n.source}${n.date ? ` · ${shortDay(n.date)}` : ''}`),
              ),
            ),
          ),
        )
      : v.status !== 'unavailable' && h('p', { class: 'empty' }, 'Geen recente berichten.'),
  ];
  return section('Nieuws', items.length ? `${items.length} koppen` : '', v.status, body);
}

function renderSummary(s) {
  if (s?.text) {
    return h('p', { class: 'summary' }, s.text, s.status === 'stale' ? h('span', { class: 'badge badge--stale', style: 'margin-left:6px' }, 'Verouderd') : null);
  }
  return h('p', { class: 'summary summary--empty' }, 'Samenvatting niet beschikbaar.');
}

function problemCount(team) {
  // The summary shows its own state; this badge is about the match data and news.
  const all = [team.results, team.news, ...(team.standings ?? [])].filter(Boolean);
  return all.filter((v) => v.status === 'stale' || v.status === 'unavailable').length;
}

function renderCard(team) {
  const problems = problemCount(team);
  return h(
    'article',
    { class: 'card', id: `team-${team.id}`, vars: accentVars(team.colors), 'aria-labelledby': `name-${team.id}` },
    h(
      'header',
      { class: 'card__head' },
      h(
        'div',
        {},
        h('h2', { class: 'card__name', id: `name-${team.id}` }, team.name),
        h('p', { class: 'card__meta' }, (team.competitions ?? []).join(' · ')),
      ),
      formStrip(team.results.items),
    ),
    h(
      'p',
      { class: 'updated' },
      team.updatedAt ? `Bijgewerkt ${stamp(team.updatedAt)}` : 'Nog niet bijgewerkt',
      problems > 0 && h('span', { class: 'badge badge--stale' }, 'Deels verouderd'),
    ),
    renderSummary(team.summary),
    renderNext(team),
    renderResults(team),
    renderFixtures(team),
    renderStandings(team),
    renderNews(team),
  );
}

function renderMissing(t) {
  return h(
    'article',
    { class: 'card', id: `team-${t.id}`, vars: accentVars(t.colors) },
    h('h2', { class: 'card__name' }, t.name),
    h('p', { class: 'note note--bad', style: 'margin-top:12px' }, 'Gegevens niet beschikbaar.'),
  );
}

/* ---------- page ---------- */

function renderPicker(teams) {
  document.getElementById('picker').replaceChildren(
    ...teams.map((t) =>
      h('li', {}, h('a', { href: `#team-${t.id}`, vars: accentVars(t.colors), 'data-team': t.id }, h('span', { class: 'dot', 'aria-hidden': 'true' }), t.name)),
    ),
  );
}

function renderRunStatus(index) {
  const el = document.getElementById('run-status');
  if (!index.lastRunAt) return;
  el.textContent = `Ververst ${stamp(index.lastRunAt)}`;
  if (Date.now() - new Date(index.lastRunAt).getTime() > RUN_STALE_MS) {
    const banner = document.getElementById('banner');
    banner.textContent = `Let op: de gegevens zijn sinds ${stamp(index.lastRunAt)} niet ververst en kunnen verouderd zijn.`;
    banner.hidden = false;
  }
}

function setActive(id) {
  for (const a of document.querySelectorAll('#picker a')) {
    const on = a.dataset.team === id;
    if (on) {
      a.setAttribute('aria-current', 'true');
      a.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    } else a.removeAttribute('aria-current');
  }
}

function observeActive() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length) setActive(visible[0].target.id.replace(/^team-/, ''));
    },
    { rootMargin: '-35% 0px -60% 0px' },
  );
  for (const card of document.querySelectorAll('.card')) io.observe(card);
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const cards = document.getElementById('cards');
  let index;
  try {
    index = await getJson('data/index.json');
  } catch {
    cards.replaceChildren(h('p', { class: 'note note--bad' }, 'Gegevens niet beschikbaar. Draai eerst het ophaalscript (npm run fetch).'));
    return;
  }
  TZ = index.timezone || TZ;
  renderPicker(index.teams);
  renderRunStatus(index);
  const teams = await Promise.all(index.teams.map((t) => getJson(`data/${encodeURIComponent(t.id)}.json`).catch(() => null)));
  cards.replaceChildren(
    ...index.teams.map((t, i) => {
      try {
        return teams[i] ? renderCard(teams[i]) : renderMissing(t);
      } catch (err) {
        console.error(t.id, err);
        return renderMissing(t);
      }
    }),
  );
  observeActive();
}

main();
