import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildConfig, ConfigError, parseConfig } from "@/engine/config";
import { buildCards, quoteOf } from "@/engine/engine";
import { writeOutputs } from "@/engine/output";
import { PRICES_AS_OF, FALLBACK_PRICES } from "@/engine/signals";
import { addSummary, summaryEnabled } from "@/engine/summary";
import type { BattlecardConfig } from "@/engine/types";
import { DEMO_CONFIG, DEMO_NOW, fixtureRunner } from "@/demo/fixtures";
import { LoootError, loootFromEnv } from "@/lib/looot";
import { usdPrecise } from "@/lib/money";
import { fetchPrices } from "@/lib/prices";

const HELP = `Usage: npm run cards -- [options]

Input, one of:
  --config <file>        YAML file: product, competitors, signals, maxSpendUsd.
  --product <name> --competitors a.com,b.com   Inline input (1 to 10 domains).
  --demo                 Sample data. No token, no network, no cost.

Options:
  --max-spend <usd>      Spend cap for the run. Default 1.00 (or maxSpendUsd in the config).
  --signals <list>       Comma list: pricing,positioning,news,hiring,tech,reviews,ads. Default all.
  --out <dir>            Where cards go (.json, .md, .html per competitor). Default: cards
  --summary              Add an LLM summary to each card. Needs ANTHROPIC_API_KEY.
  --dry-run              Print the plan and the list-price cost. Make no call.
  --help

Needs LOOOT_TOKEN in the environment, except with --demo or --dry-run.`;

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function loadConfig(args: ReturnType<typeof parse>): BattlecardConfig {
  if (args.demo) return DEMO_CONFIG;
  if (args.config) {
    const path = resolve(args.config);
    if (!existsSync(path)) fail(`No config at ${args.config}`, 2);
    return parseConfig(readFileSync(path, "utf8"));
  }
  if (args.product && args.competitors) {
    return buildConfig({ product: { name: args.product }, competitors: args.competitors.split(",").map((s) => s.trim()).filter(Boolean) });
  }
  return fail(`Give --config, --product with --competitors, or --demo.\n\n${HELP}`, 2);
}

function parse() {
  return parseArgs({
    options: {
      config: { type: "string" }, product: { type: "string" }, competitors: { type: "string" }, demo: { type: "boolean", default: false },
      "max-spend": { type: "string" }, signals: { type: "string" }, out: { type: "string", default: "cards" },
      summary: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false }, help: { type: "boolean", default: false },
    },
  }).values;
}

async function main(): Promise<void> {
  let raw;
  try {
    raw = parse();
  } catch (e) {
    fail(`${(e as Error).message}\n\n${HELP}`, 2);
  }
  if (raw.help) return console.log(HELP);
  const args = { ...raw, "max-spend": raw["max-spend"], summary: raw.summary };
  let config: BattlecardConfig;
  try {
    config = loadConfig(args);
    if (args.signals) config = buildConfig({ ...config, product: config.product, competitors: config.competitors, signals: args.signals.split(","), maxSpendUsd: config.maxSpendMicros / 1e6 });
    if (args["max-spend"]) config = { ...config, maxSpendMicros: Math.round(Number(args["max-spend"]) * 1e6) };
  } catch (e) {
    if (e instanceof ConfigError) fail(e.message, 2);
    throw e;
  }
  if (!Number.isFinite(config.maxSpendMicros) || config.maxSpendMicros <= 0) fail("--max-spend must be a positive number of dollars.", 2);

  // Prices: the free public catalog for a real run, the dated list for demo and dry runs.
  const live = !args.demo && !args["dry-run"];
  const priced = live ? await fetchPrices(FALLBACK_PRICES) : { prices: FALLBACK_PRICES, source: "fallback" as const, unread: [] as string[] };
  const quote = quoteOf(config, priced.prices);
  console.log(`Plan: ${config.competitors.length} competitor(s), ${quote.calls.length} calls, list price ${usdPrecise(quote.totalMicros)} (${priced.source === "catalog" ? "live catalog prices" : `list prices dated ${PRICES_AS_OF}`}). Cap ${usdPrecise(config.maxSpendMicros)}.`);
  for (const l of quote.lines) console.log(`  ${String(l.calls).padStart(3)} x ${l.endpointId}  ${usdPrecise(l.priceMicros)}`);
  if (quote.overCap) console.log("The plan is over the cap. Calls that do not fit are skipped and marked on the card.");
  if (args["dry-run"]) return console.log("Dry run: no looot call was made and nothing was written.");

  let looot = fixtureRunner;
  if (!args.demo) {
    try {
      looot = loootFromEnv();
    } catch (e) {
      if (e instanceof LoootError) fail("LOOOT_TOKEN is not set. Create an agent token at https://looot.ai/settings, or use --demo or --dry-run.", 2);
      throw e;
    }
  }
  const now = args.demo ? DEMO_NOW : new Date();
  const result = await buildCards(config, { looot, prices: priced.prices, unpriced: new Set(priced.unread), now });
  let cards = result.cards;
  if (args.summary) {
    if (!summaryEnabled()) console.log("--summary needs ANTHROPIC_API_KEY. Cards were built without it.");
    else cards = await Promise.all(cards.map((c) => addSummary(c)));
  }

  const out = resolve(args.out);
  writeOutputs(out, cards, config.product, result.actualMicros);
  for (const c of cards) {
    const bad = c.sections.filter((s) => s.status !== "ok");
    console.log(`${c.competitor.domain}: ${c.sections.length - bad.length}/${c.sections.length} sections${bad.length ? ` (${bad.map((s) => `${s.signal}:${s.status}`).join(", ")})` : ""}`);
  }
  console.log(`Charged by looot: ${usdPrecise(result.actualMicros)}. Cards in ${out}`);
  if (cards.every((c) => c.sections.every((s) => s.status === "failed"))) fail("Every section failed.");
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
