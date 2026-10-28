# Sportdashboard

Persoonlijk dashboard met uitslagen, programma, stand, nieuws en een korte samenvatting van Ajax, Philadelphia Eagles, New York Yankees en New York Knicks. Het is een statische site zonder eigen server en is ontworpen voor mobiel (390 px) maar werkt ook op desktop.

```
teams.config.json         alle teams, bronnen, kleuren en tabelkolommen
scripts/fetch-data.js     haalt alles op en schrijft public/data/*.json
scripts/should-run.js     beslist per uur of de workflow moet ophalen
scripts/lib/              adapters per bron (espn, mlb, rss), samenvoegen, samenvatting
public/                   de site (index.html, styles.css, app.js) en de data
test/                     tests met echte, ingekorte API-antwoorden in test/fixtures
.github/workflows/        GitHub Actions: ophalen, committen, publiceren
```

## Hoe het werkt

1. GitHub Actions draait elk uur. `should-run.js` laat de ronde alleen doorgaan als het de eerste ronde van de dag is (vanaf 07:00 Amsterdamse tijd), of als er een wedstrijd begint binnen een uur of minder dan vijf uur geleden is begonnen. Op wedstrijddagen wordt dus elk uur bijgewerkt rond de wedstrijd, en verder één keer per ochtend.
2. `npm test` draait, daarna `npm run fetch`.
3. Het script vergelijkt de nieuwe data met de bestaande JSON. Alleen als er echt iets veranderd is, wordt er gecommit en gepubliceerd.
4. De site leest alleen `public/data/*.json`. API-sleutels komen nooit in de browser.

## Databronnen

| Wat | Bron | Sleutel | Beperkingen |
|---|---|---|---|
| Ajax: Eredivisie en Conference League (uitslagen, programma, stand) | ESPN site-API: `site.api.espn.com/apis/site/v2/sports/soccer/ned.1/…` en `…/uefa.europa.conf/…` | geen | Niet officieel en niet gedocumenteerd. ESPN kan het zonder aankondiging wijzigen. Alleen voor persoonlijk, niet-commercieel gebruik. |
| Eagles (NFL) en Knicks (NBA) | ESPN site-API: `football/nfl`, `basketball/nba` (team- en standings-endpoints) | geen | Zoals hierboven. De play-offs (`seasontype=3`) worden opgehaald als ze bestaan. Als ze ontbreken, is dat geen fout. |
| Yankees (MLB) | Officiële MLB Stats API: `statsapi.mlb.com/api/v1/schedule` en `/standings` | geen | Elk antwoord vermeldt "Copyright MLB Advanced Media, L.P." met verwijzing naar hun voorwaarden. Alleen persoonlijk, niet-commercieel gebruik. Bronvermelding staat in de footer. |
| Nieuws Ajax | RSS van Het Parool (Ajax-rubriek) en NOS Voetbal, allebei gefilterd op "Ajax" in de kop | geen | De Parool-rubriek bevat ook columns over ander voetbal, vandaar het filter. NOS bevat vaak geen Ajax-berichten. Ajax.nl en AD blokkeren automatische aanvragen en worden daarom niet gebruikt. |
| Nieuws Eagles | RSS van philadelphiaeagles.com en de ESPN-nieuws-API (`site.api.espn.com/…/football/nfl/news`) | geen | Zie de opmerking over ESPN-nieuws hieronder. |
| Nieuws Yankees | RSS van mlb.com/yankees en de ESPN-nieuws-API (`…/baseball/mlb/news`) | geen | |
| Nieuws Knicks | RSS van Posting and Toasting (SB Nation) en de ESPN-nieuws-API (`…/basketball/nba/news`) | geen | nba.com weigert RSS-aanvragen (403). |
| Samenvatting | Anthropic API, model `claude-opus-5-5` | `ANTHROPIC_API_KEY` | Kost een paar cent per keer. Wordt alleen aangeroepen als de onderliggende data veranderd is. |

Getest op 26 en 28 oktober 2026. football-data.org is bewust niet gebruikt. De gratis versie bevat de Conference League niet, levert uitslagen met vertraging en vraagt een sleutel, terwijl ESPN beide Ajax-competities zonder sleutel levert.

**ESPN-nieuws:** de RSS-feeds op www.espn.com werken vanaf een gewone pc, maar niet vanuit GitHub Actions. Daarom gebruikt het dashboard de nieuws-API op site.api.espn.com. Een artikel telt mee als de teamnaam in de kop staat, of als ESPN het artikel met het team heeft gelabeld en er hooguit twee teams in voorkomen. Zo vallen overzichtsstukken als power rankings weg. In de config is dat een nieuwsbron met `"type": "espn"`, `path` en het ESPN-`teamId`.

Faalt een nieuwsbron, dan staat de foutmelding in `sections.news.data.failures` in de JSON van het team en in het log van de workflow.

Het dashboard bewaart van nieuws alleen kop, bron, datum en link. Er wordt geen artikeltekst opgeslagen of getoond.

### De samenvatting

Claude krijgt alleen de opgehaalde uitslagen, het programma, de positie in de stand en maximaal vijf nieuwskoppen, met de instructie niets te verzinnen. De samenvatting is maximaal drie korte zinnen (richtlijn 350 tekens; boven de 600 wordt hij afgekeurd). Van de invoer en de promptversie wordt een hash bewaard (`summary.hash`). Zolang die hetzelfde blijft, wordt de opgeslagen tekst hergebruikt en is er geen API-aanroep. Mislukt een aanroep, of ontbreekt de sleutel, dan blijft de vorige tekst staan met de markering "Verouderd". Zonder vorige tekst toont de site "Samenvatting niet beschikbaar". Server-side fallback (`fallbacks: "default"`) staat aan, zodat een eventuele weigering automatisch door een ander model wordt opgevangen.

## Betrouwbaarheid

- Elke kaart toont wanneer de data voor het laatst is gewijzigd.
- Faalt een bron, dan blijft de oude data staan met de markering "Verouderd". Is er geen oude data, dan toont de kaart "niet beschikbaar". Ontbreekt een uitslag bij een gespeelde wedstrijd, dan staat er "niet beschikbaar" in plaats van een score.
- Valt één competitie weg (bijvoorbeeld alleen de Conference League), dan blijft de rest gewoon zichtbaar en wordt genoemd welke bron ontbreekt.
- Buiten het seizoen toont de kaart "Buiten het seizoen · Geen wedstrijden gepland" met de eindstand. Dat gebeurt alleen als de bronnen wel antwoorden. Een storing wordt dus nooit als zomerstop getoond.
- Draait de workflow meer dan 36 uur niet, dan verschijnt bovenaan een waarschuwing.

## Zelf deployen

### 1. Repository

Maak een nieuwe GitHub-repository, bijvoorbeeld `sportdashboard`, en zet deze map erin. Een publieke repository krijgt onbeperkt gratis Actions-minuten. Bij een private repository gaan de uurlijkse rondes van je gratis 2000 minuten per maand af. De meeste rondes stoppen na een paar seconden, maar GitHub rekent elke ronde af als minimaal één minuut. Reken dus op ongeveer 750 tot 900 minuten per maand.

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Sportdashboard"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/<jouw-naam>/sportdashboard.git
```

```bash
git push -u origin main
```

### 2. Secret instellen

Ga naar **Settings → Secrets and variables → Actions → New repository secret**:

| Naam | Waarde | Verplicht |
|---|---|---|
| `ANTHROPIC_API_KEY` | je sleutel van console.anthropic.com | Alleen voor de samenvattingen. Zonder sleutel werkt al het andere gewoon. |

Er zijn verder geen sleutels nodig.

Ga daarna naar **Settings → Actions → General → Workflow permissions** en kies **Read and write permissions**, zodat de workflow de data kan committen.

### 3a. Hosten op GitHub Pages (eenvoudigst)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Ga naar **Actions → Data bijwerken → Run workflow**. Na een minuut staat de site op `https://<jouw-naam>.github.io/sportdashboard/`.

### 3b. Of hosten op Cloudflare Pages

1. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** en kies de repository.
2. Laat de build-opdracht leeg en zet de build-uitvoermap op `public`.
3. Zet in GitHub de repository-variabele `DEPLOY_TARGET` op `cloudflare` (**Settings → Secrets and variables → Actions → Variables**). De workflow publiceert dan niet meer zelf naar GitHub Pages. Cloudflare bouwt automatisch na elke data-commit.

## Op je telefoon

Open de site en zet hem op je beginscherm. Op de iPhone doe je dat in Safari via het deel-icoon en **Zet op beginscherm**. Op Android doe je dat in Chrome via het menu en **Toevoegen aan startscherm**. De app heet dan SPORT27, heeft het rugnummer-icoon en opent schermvullend. De icoontjes staan in `public/icons/` en de app-instellingen in `public/manifest.webmanifest`.

## Lokaal draaien (optioneel)

Hiervoor is Node 22 of nieuwer nodig.

```bash
npm install
```

```bash
npm test
```

```bash
npm run fetch
```

```bash
npm run serve
```

Zet voor samenvattingen eerst `ANTHROPIC_API_KEY` in je omgeving. Commit na de eerste `npm install` ook `package-lock.json`, zodat de workflow altijd dezelfde versies gebruikt.

## Een team toevoegen

Je past alleen `teams.config.json` aan, geen code. Voeg een object toe aan `teams`. In het voorbeeld hieronder (PSV) is `"<ESPN-id>"` een plek die je zelf invult; zie de toelichting onder het voorbeeld.

```json
{
  "id": "psv",
  "name": "PSV",
  "short": "PSV",
  "sport": "Voetbal",
  "colors": { "light": "#C8102E", "dark": "#FF6B7A" },
  "games": [
    { "type": "espn", "path": "soccer/ned.1", "teamId": "<ESPN-id>", "competition": "Eredivisie", "queries": ["", "fixture=true"] }
  ],
  "standings": [
    { "type": "espn", "path": "soccer/ned.1", "teamId": "<ESPN-id>", "name": "Eredivisie", "sort": "rank", "columns": "voetbal" }
  ],
  "news": [
    { "url": "https://feeds.nos.nl/nosvoetbal", "source": "NOS", "match": "\\bPSV\\b" }
  ]
}
```

- **`id`**: kleine letters, cijfers of `-`. Dit wordt ook de bestandsnaam `public/data/<id>.json`.
- **`colors`**: `light` is de accentkleur in het lichte thema. `dark` is een lichtere variant, voor genoeg contrast op een donkere achtergrond.
- **`games`**:
  - **ESPN**: `path` is `sport/competitie`, bijvoorbeeld `soccer/ned.1`, `soccer/uefa.champions`, `football/nfl`, `basketball/nba` of `hockey/nhl`. `teamId` is het ESPN-id van het team: het getal in de URL van de teampagina op espn.com. Voor voetbal vraag je met `"queries": ["", "fixture=true"]` zowel de uitslagen als het programma op. Bij Amerikaanse sporten volstaat `[""]`.
  - **MLB**: gebruik `"type": "mlb"` met het `teamId` van de MLB Stats API (de Yankees zijn 147).
- **`standings`**:
  - **`sort`**: `rank` voor voetbal, `winPercent` voor Amerikaanse sporten.
  - **`level: 3`**: geeft bij NFL en NBA de divisiestand.
  - **`columns`**: verwijst naar een preset in `columnPresets`, of je geeft zelf een lijst `[{ "key": "<ESPN-statnaam>", "label": "…" }]`.
  - **MLB**: geef `leagueId` (103 = AL, 104 = NL) en `divisionId` op.
- **`news`**: RSS- of Atom-feeds. Met `match` (een reguliere expressie) filter je een feed op het team. Er wordt alleen in de kop gezocht.

Draai daarna `npm test`. De configtest meldt typefouten met een duidelijke foutmelding. Push de wijziging, en de workflow haalt het nieuwe team meteen op.
