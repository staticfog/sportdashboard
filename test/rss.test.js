import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNews, parseFeed } from '../scripts/lib/rss.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title>
  <item>
    <title><![CDATA[Ajax wint <b>ruim</b> van AZ]]></title>
    <link>https://example.nl/ajax-az</link>
    <description><![CDATA[<p>Lange artikeltekst die niet bewaard mag worden.</p>]]></description>
    <pubDate>Sun, 25 Oct 2026 19:36:00 GMT</pubDate>
  </item>
  <item>
    <title>Feyenoord &amp; PSV spelen gelijk</title>
    <link>https://example.nl/fey-psv</link>
    <pubDate>Sat, 24 Oct 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Gevaarlijke link</title>
    <link>javascript:alert(1)</link>
  </item>
  <item>
    <title>2026</title>
    <guid isPermaLink="true">https://example.nl/getal</guid>
  </item>
  <item>
    <link>https://example.nl/zonder-titel</link>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
  <entry>
    <title type="html">Knicks win in overtime</title>
    <link rel="alternate" href="https://example.com/knicks"/>
    <link rel="self" href="https://example.com/self"/>
    <updated>2026-10-26T11:03:42Z</updated>
  </entry>
</feed>`;

test('RSS: headline, link, date and source only', () => {
  const items = parseFeed(RSS, { source: 'Test' });
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    title: 'Ajax wint ruim van AZ',
    url: 'https://example.nl/ajax-az',
    date: '2026-10-25T19:36:00.000Z',
    source: 'Test',
  });
  assert.equal(items[1].title, 'Feyenoord & PSV spelen gelijk');
  assert.equal(items[2].title, '2026');
  assert.equal(items[2].date, null);
  assert.ok(items.every((i) => !('description' in i)));
  assert.ok(!items.some((i) => i.url.startsWith('javascript')));
});

test('RSS: match filters general feeds', () => {
  const items = parseFeed(RSS, { source: 'NOS', match: '\\bAjax\\b' });
  assert.deepEqual(items.map((i) => i.url), ['https://example.nl/ajax-az']);
});

test('RSS: match looks at the headline, not the description', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>Telstar onderuit tegen Almere City</title><link>https://e.nl/1</link><description>Eerder won Ajax van ...</description></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml, { source: 'NOS', match: '\\bAjax\\b' }), []);
});

test('Atom: uses the alternate link', () => {
  const items = parseFeed(ATOM, { source: 'P&T' });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/knicks');
  assert.equal(items[0].date, '2026-10-26T11:03:42.000Z');
});

test('feed with no items is valid and empty', () => {
  assert.deepEqual(parseFeed('<rss version="2.0"><channel><title>Leeg</title></channel></rss>', { source: 'x' }), []);
});

test('empty, broken or non-feed answers throw', () => {
  assert.throws(() => parseFeed('', { source: 'x' }), /leeg/);
  assert.throws(() => parseFeed(undefined, { source: 'x' }), /leeg/);
  assert.throws(() => parseFeed('<rss><channel><item><title>open', { source: 'x' }), /ongeldige XML/);
  assert.throws(() => parseFeed('<html><body>Toegang geweigerd</body></html>', { source: 'x' }), /geen RSS/);
});

test('mergeNews: dedupes by url, newest first, undated last, limited', () => {
  const a = [
    { title: 'oud', url: 'https://x/1', date: '2026-10-01T00:00:00.000Z', source: 'A' },
    { title: 'zonder datum', url: 'https://x/2', date: null, source: 'A' },
  ];
  const b = [
    { title: 'nieuw', url: 'https://x/3', date: '2026-10-20T00:00:00.000Z', source: 'B' },
    { title: 'dubbel', url: 'https://x/1?utm=rss', date: '2026-10-01T00:00:00.000Z', source: 'B' },
  ];
  assert.deepEqual(mergeNews([a, b], 10).map((i) => i.title), ['nieuw', 'oud', 'zonder datum']);
  assert.equal(mergeNews([a, b], 1).length, 1);
});
