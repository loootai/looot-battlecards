# looot-battlecards

Competitive battlecards from public data, with a source link and a fetch date next to every claim. Give it your product and 1 to 10 competitor domains. It reads each competitor's pricing page, homepage, careers page, news, tech stack, review snippets and ads through [looot](https://looot.ai) and writes one card per competitor as JSON, markdown and PDF-ready HTML.

An open-source alternative to Klue and Crayon. Neither publishes a starting price: on 2026-10-10 Klue's pricing page offered only "Get a demo" and Crayon's asked for an estimate request. Here a competitor costs about $0.015 in looot calls.

![Overview](docs/screenshots/overview-light.png)

| Light | Dark |
| --- | --- |
| ![Card, light](docs/screenshots/card-light.png) | ![Card, dark](docs/screenshots/card-dark.png) |

## What it does

- Reads 7 signals per competitor and keeps only what the page or result says. No claim is written from memory.
- Builds the card with templates and plain extraction rules. No LLM is needed. An optional summary step runs when `ANTHROPIC_API_KEY` is set and `--summary` is passed. The summary is stored apart from the sourced claims and labelled as model-written.
- Shows the list-price cost before any paid call, enforces a spend cap, and marks a section "pending", "failed" or "skipped" instead of hiding it.
- Exports each card to markdown and to a single HTML page with print styles, ready for "Save as PDF".
- Shows your own strengths on each card under "Where we win", marked as your words, never as fetched data.

## Signals

| Section | looot job | Endpoint | List price per call | What the extractor reads |
| --- | --- | --- | --- | --- |
| Pricing | `web.scrape.markdown` | `jina-reader` on `/pricing` | $0.0002 | plan names, prices, free tier, "contact sales", annual discount |
| Positioning | `web.scrape.markdown` | `jina-reader` on `/` | $0.0002 | page title, first headline, first full sentence |
| Hiring direction | `web.scrape.markdown` | `jina-reader` on `/careers` | $0.0002 | job titles counted by function |
| Recent news | `news.search` | `serper-news` | $0.0010 | five newest items with outlet and date |
| Review themes | `google.serp.organic` | `serper-search` limited to G2, Trustpilot and Capterra | $0.0010 | ratings and praise or complaint themes from the snippets |
| Tech stack | `company.technographics` | `tomba-technology` | $0.0089 | technologies grouped by category |
| Ad angles | `ads.meta.search`, `ads.linkedin.search` | `scrapecreators-facebook-adlibrary-company-ads-get`, `scrapecreators-linkedin-ads-search` | $0.00188 each | ad text, angles by keyword rules |

Prices are list prices read from the free public catalog on 2026-10-10. A real run re-reads them first and refuses to call an endpoint whose live price it cannot read.

Cost of a typical run, all 7 signals at list price: $0.0153 per competitor, so $0.0763 for 5 competitors and $0.153 for 10.

Dropped, because looot has no provider for it: win-loss interviews, CRM and call-recording insights, and a Slack or CRM publishing step. Google Ads are not read: the cheapest provider is $0.0064 a call and the Meta and LinkedIn libraries cover most B2B ad angles. For ongoing alerts when a competitor page changes, use [looot-monitor](https://github.com/loootai/looot-monitor). This repo does not rebuild it.

## Run it

Three ways, one engine.

```bash
npm install
npm run demo          # web UI with sample data on http://localhost:3231, no token, no network
npm run cards -- --demo
```

Headless CLI:

```bash
cp battlecards.example.yaml battlecards.yaml    # or pass --product and --competitors
npm run cards -- --config battlecards.yaml --dry-run          # prints the plan and the list-price cost, no call
LOOOT_TOKEN=... npm run cards -- --config battlecards.yaml --max-spend 0.25
```

Options: `--signals pricing,news`, `--out cards`, `--summary`, `--max-spend <usd>`. Output goes to `cards/<domain>.json`, `.md`, `.html` and `cards/index.md`.

Web UI on live data: `LOOOT_TOKEN=... npm run dev`. The Build page asks for a quote first (free), then builds for up to the quoted amount. Supabase is not used and no sign-in exists. Run the UI behind your own auth if you host it.

## Money rules

- The quote comes first. The CLI prints it with `--dry-run`, the UI shows it before the Build button appears.
- The spend cap is checked against list prices before each call. A call that would pass it is skipped and never sent.
- Each call carries an idempotency key made from the competitor, the call input, the endpoint and the day. Running the same input twice in one day replays the stored run and charges nothing more.
- A run that is still going when waiting stops (60 seconds) is "pending", not "failed". Failed calls are not charged by looot.

## Install for agents

- Read [llms.txt](llms.txt).
- Claude Code skill: copy `skills/battlecards` to `~/.claude/skills/battlecards`. It prices the run, asks for a yes, runs the CLI and reports gaps as they are.
- Requires an agent token from https://looot.ai/settings in `LOOOT_TOKEN`.

## What is not tested

No paid looot run was made. The code and fixtures follow the endpoint descriptions in the looot catalog and the shapes of the sibling repo [looot-monitor](https://github.com/loootai/looot-monitor). Parsing for `jina-reader` pages, `tomba-technology`, and the two ad libraries is built from the docs and hand-written fixtures, not from captured responses, so expect to adjust field names after your first real run. Pricing and careers extraction depends on the page being readable as markdown: pages that load prices with scripts come back empty, and the card says so. Review themes are keyword rules on search snippets, which is a weak signal, and the card quotes the snippet so you can judge it. All demo brands are invented.

## Develop

```bash
npm test && npm run typecheck && npm run lint && npm run build
npm run leak-scan
git config core.hooksPath .githooks
```

## Licence

MIT, copyright looot.
