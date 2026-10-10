import { hash, dayKey } from "@/lib/util";
import { Spender, type CallResult, type PriceMap } from "@/lib/spender";
import type { LoootRunner } from "@/lib/looot";
import { extractAds, extractHiring, extractNews, extractPositioning, extractPricing, extractReviews, extractTech, parsePage } from "./extract";
import { ENDPOINTS, SIGNALS } from "./signals";
import type { BattlecardConfig, Card, Claim, Competitor, Section, SignalId } from "./types";

/** One paid call the engine would make. */
export interface PlannedCall {
  competitor: string;
  signal: SignalId;
  endpointId: string;
  jobId: string;
  input: Record<string, unknown>;
  /** The page or search the call reads, shown in the plan and used as the source link when there is no better one. */
  target: string;
}

/** Builds the list of calls for a config. Free: no network. */
export function planCalls(config: BattlecardConfig): PlannedCall[] {
  const out: PlannedCall[] = [];
  for (const c of config.competitors) {
    for (const signal of config.signals) {
      out.push(...callsFor(c, signal));
    }
  }
  return out;
}

function callsFor(c: Competitor, signal: SignalId): PlannedCall[] {
  const mk = (endpointId: string, jobId: string, input: Record<string, unknown>, target: string): PlannedCall => ({ competitor: c.domain, signal, endpointId, jobId, input, target });
  switch (signal) {
    case "pricing": {
      const url = c.pricingUrl ?? `https://${c.domain}/pricing`;
      return [mk(ENDPOINTS.pageReader, "web.scrape.markdown", { url }, url)];
    }
    case "positioning": {
      const url = `https://${c.domain}/`;
      return [mk(ENDPOINTS.pageReader, "web.scrape.markdown", { url }, url)];
    }
    case "hiring": {
      const url = c.careersUrl ?? `https://${c.domain}/careers`;
      return [mk(ENDPOINTS.pageReader, "web.scrape.markdown", { url }, url)];
    }
    case "news":
      return [mk(ENDPOINTS.news, "news.search", { q: `"${c.name}"`, num: 10, tbs: "qdr:m" }, `https://www.google.com/search?tbm=nws&q=${encodeURIComponent(`"${c.name}"`)}`)];
    case "reviews": {
      const q = `${c.name} reviews (site:g2.com OR site:trustpilot.com OR site:capterra.com)`;
      return [mk(ENDPOINTS.search, "google.serp.organic", { q, num: 10 }, `https://www.google.com/search?q=${encodeURIComponent(q)}`)];
    }
    case "tech":
      return [mk(ENDPOINTS.tech, "company.technographics", { domain: c.domain }, `https://${c.domain}/`)];
    case "ads":
      return [
        mk(ENDPOINTS.metaAds, "ads.meta.search", { companyName: c.name, country: "ALL", status: "ACTIVE" }, `https://www.facebook.com/ads/library/?q=${encodeURIComponent(c.name)}`),
        mk(ENDPOINTS.linkedinAds, "ads.linkedin.search", { company: c.name }, `https://www.linkedin.com/ad-library/search?companyName=${encodeURIComponent(c.name)}`),
      ];
  }
}

export interface QuoteLine {
  endpointId: string;
  calls: number;
  priceMicros: number;
}

export interface Quote {
  calls: PlannedCall[];
  lines: QuoteLine[];
  totalMicros: number;
  /** true when the plan costs more than the spend cap. The engine then skips the calls that do not fit. */
  overCap: boolean;
}

/** Prices the plan at the given per-call prices. */
export function quoteOf(config: BattlecardConfig, prices: PriceMap): Quote {
  const calls = planCalls(config);
  const byEndpoint = new Map<string, number>();
  for (const c of calls) byEndpoint.set(c.endpointId, (byEndpoint.get(c.endpointId) ?? 0) + 1);
  const lines = [...byEndpoint.entries()].map(([endpointId, n]) => ({ endpointId, calls: n, priceMicros: prices[endpointId] ?? 0 }));
  const totalMicros = lines.reduce((n, l) => n + l.calls * l.priceMicros, 0);
  return { calls, lines, totalMicros, overCap: totalMicros > config.maxSpendMicros };
}

/** Stable per (competitor, call input, endpoint, day): a re-run on the same day replays the stored run and costs nothing. */
export function idempotencyKey(call: PlannedCall, now: Date): string {
  return `bc-${hash(`${call.competitor}|${call.signal}|${call.endpointId}|${JSON.stringify(call.input)}|${dayKey(now)}`)}`;
}

export interface BuildDeps {
  looot: LoootRunner;
  prices: PriceMap;
  unpriced?: ReadonlySet<string>;
  now: Date;
}

export interface BuildResult {
  cards: Card[];
  committedMicros: number;
  actualMicros: number;
}

function sectionFrom(signal: SignalId, results: CallResult[], claims: Claim[], emptyNote: string): Section {
  const title = SIGNALS[signal].title;
  const costMicros = results.reduce((n, r) => n + r.costMicros, 0);
  const ok = results.filter((r) => r.status === "ok");
  if (claims.length > 0) {
    const bad = results.find((r) => r.status !== "ok");
    return { signal, title, status: "ok", claims, costMicros, ...(bad ? { note: `Partial: ${bad.error ?? bad.status}` } : {}) };
  }
  const pending = results.find((r) => r.status === "pending");
  if (pending) return { signal, title, status: "pending", claims: [], note: pending.error, costMicros };
  const skipped = results.find((r) => r.status === "skipped_cap" || r.status === "skipped_price");
  if (skipped && ok.length === 0) return { signal, title, status: "skipped", claims: [], note: skipped.error, costMicros };
  const failed = results.find((r) => r.status === "failed");
  if (failed && ok.length === 0) return { signal, title, status: "failed", claims: [], note: failed.error, costMicros };
  return { signal, title, status: "empty", claims: [], note: emptyNote, costMicros };
}

/** Runs the plan and assembles one card per competitor. No LLM involved. A failed or capped call leaves its section marked, never invented. */
export async function buildCards(config: BattlecardConfig, deps: BuildDeps): Promise<BuildResult> {
  const spender = new Spender({ looot: deps.looot, capMicros: config.maxSpendMicros, prices: deps.prices, unpriced: deps.unpriced });
  const fetchedAt = deps.now.toISOString();
  const cards: Card[] = [];
  for (const c of config.competitors) {
    const planned = planCalls({ ...config, competitors: [c] });
    const results = await Promise.all(planned.map((p) => spender.call(p.endpointId, p.input, idempotencyKey(p, deps.now))));
    const sections: Section[] = [];
    for (const signal of config.signals) {
      const idx = planned.map((p, i) => (p.signal === signal ? i : -1)).filter((i) => i >= 0);
      const rs = idx.map((i) => results[i]);
      const stamp = (i: number) => ({ sourceUrl: planned[i].target, via: planned[i].endpointId, fetchedAt });
      let claims: Claim[] = [];
      let emptyNote = "The call worked but nothing readable came back.";
      if (signal === "pricing" && rs[0].status === "ok") {
        const page = parsePage(rs[0].raw);
        claims = extractPricing(page.content, stamp(idx[0]));
        emptyNote = "No prices found on the page. It may load prices with scripts or sit at another URL. Set pricingUrl for this competitor.";
      } else if (signal === "positioning" && rs[0].status === "ok") {
        const page = parsePage(rs[0].raw);
        claims = extractPositioning(page.content, page.title, stamp(idx[0]));
      } else if (signal === "hiring" && rs[0].status === "ok") {
        claims = extractHiring(parsePage(rs[0].raw).content, stamp(idx[0])).claims;
        emptyNote = "No job titles recognised on the careers page. Set careersUrl for this competitor.";
      } else if (signal === "news" && rs[0].status === "ok") {
        claims = extractNews(rs[0].raw, stamp(idx[0]));
        emptyNote = "No news in the last month.";
      } else if (signal === "reviews" && rs[0].status === "ok") {
        claims = extractReviews(rs[0].raw, stamp(idx[0]));
        emptyNote = "No review-site snippets in the results.";
      } else if (signal === "tech" && rs[0].status === "ok") {
        claims = extractTech(rs[0].raw, stamp(idx[0]));
      } else if (signal === "ads") {
        claims = extractAds(rs[0].status === "ok" ? rs[0].raw : null, rs[1]?.status === "ok" ? rs[1].raw : null, stamp(idx[0]), planned[idx[1]]?.endpointId);
        emptyNote = "No active ads found on Meta or LinkedIn.";
      }
      sections.push(sectionFrom(signal, rs, claims, emptyNote));
    }
    cards.push({ competitor: c, generatedAt: fetchedAt, sections, costMicros: sections.reduce((n, s) => n + s.costMicros, 0) });
  }
  return { cards, committedMicros: spender.committedMicros, actualMicros: spender.actualMicros };
}
