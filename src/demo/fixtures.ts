import type { LoootRun, LoootRunner } from "@/lib/looot";
import type { BattlecardConfig } from "@/engine/types";
import { buildConfig } from "@/engine/config";

/** The fixed date every demo card is stamped with. */
export const DEMO_NOW = new Date("2026-10-10T09:00:00.000Z");

export const DEMO_CONFIG: BattlecardConfig = buildConfig({
  product: {
    name: "Tallyroom",
    domain: "tallyroom.example",
    strengths: ["Deposit invoices show the client the full project total and what is still to pay.", "Flat price for the whole studio, no per-seat fee."],
  },
  competitors: [
    { domain: "ledgerly.example", name: "Ledgerly" },
    { domain: "paperkite.example", name: "Paperkite" },
  ],
  maxSpendUsd: 0.5,
});

const PAGES: Record<string, string> = {
  "https://ledgerly.example/pricing": `# Pricing

## Starter
Starter $12 / month per user
Invoices, expenses and one bank feed.

## Studio
Studio $29 / month per user
Everything in Starter, deposits and project budgets.

## Enterprise
Custom pricing. Talk to sales for single sign-on and audit logs.

Start for free for 14 days. Save 20% when you pay yearly.`,
  "https://ledgerly.example/": `# Bookkeeping that keeps up with a growing studio

Ledgerly turns invoices, expenses and project budgets into one clear picture of what your studio earns each month.

[Pricing](/pricing)`,
  "https://ledgerly.example/careers": `# Careers

## Open roles
- Senior Backend Engineer
- Staff Frontend Engineer
- Machine Learning Engineer
- Account Executive, Mid-Market
- Customer Success Manager
- Product Designer

We hire across Europe and the US.`,
  "https://paperkite.example/pricing": `# Plans

Pro - $49 per month, whole team.
Business - $99 per month, whole team.`,
  "https://paperkite.example/": `# Invoices clients actually pay

Paperkite sends polished invoices, chases late payers for you and shows your cash flow on one screen.`,
  "https://paperkite.example/careers": `# Join us

- Sales Development Representative
- Account Executive
- Account Executive, Enterprise
- Growth Marketing Manager`,
};

const NEWS: Record<string, unknown> = {
  ledgerly: { news: [
    { title: "Ledgerly raises $18M Series A to build for design studios", link: "https://news.example/ledgerly-series-a", snippet: "The round was led by Northfield.", date: "2026-10-02T08:00:00Z", source: "Studio Weekly" },
    { title: "Ledgerly adds bank feeds in six new countries", link: "https://news.example/ledgerly-bank-feeds", date: "2026-09-24T08:00:00Z", source: "FinTech Daily" },
  ] },
  paperkite: { news: [] },
};

const SERP: Record<string, unknown> = {
  ledgerly: { organic: [
    { title: "Ledgerly Reviews 2026 - G2", link: "https://www.g2.com/products/ledgerly/reviews", snippet: "4.6 out of 5. Easy to use and an intuitive invoice flow, but expensive for large teams and the mobile app is buggy.", position: 1 },
    { title: "Ledgerly | Capterra", link: "https://www.capterra.com/p/ledgerly/", snippet: "Great customer support and it integrates well with Stripe. Wish they had multi-currency reports.", position: 2 },
    { title: "Ledgerly pricing blog", link: "https://ledgerly.example/blog/pricing", snippet: "Our plans explained.", position: 3 },
  ] },
  paperkite: { organic: [
    { title: "Paperkite Reviews - Trustpilot", link: "https://www.trustpilot.com/review/paperkite.example", snippet: "Rated 3.9 stars. Slow support when an invoice sync broke, and confusing settings.", position: 1 },
  ] },
};

const TECH: Record<string, unknown> = {
  ledgerly: { data: { technologies: [
    { name: "Next.js", categories: ["JavaScript frameworks"] }, { name: "React", categories: ["JavaScript frameworks"] },
    { name: "Stripe", categories: ["Payment processors"] }, { name: "Segment", categories: ["Analytics"] }, { name: "HubSpot", categories: ["Marketing automation"] },
  ] } },
};

const META_ADS: Record<string, unknown> = {
  ledgerly: { searchResults: [
    { ad_archive_id: "4410001", snapshot: { body: { text: "Save 6 hours a month on invoicing. Try it free, no credit card." } } },
    { ad_archive_id: "4410002", snapshot: { body: { text: "Trusted by 4,000 studios. Switch from spreadsheets in minutes." } } },
  ] },
};
const LINKEDIN_ADS: Record<string, unknown> = {
  ledgerly: { ads: [{ id: "88123", headline: "AI that reads your receipts", description: "Ledgerly AI sorts expenses for you.", url: "https://www.linkedin.com/ad-library/detail/88123" }] },
};

const done = (result: unknown): LoootRun => ({ runId: "run_demo", status: "completed", result, actualCost: 0 });
const keyOf = (domain: string) => domain.split(".")[0];

/** A LoootRunner that answers from the fixtures above. Used by `npm run demo`, the demo CLI and the tests. No network. */
export const fixtureRunner: LoootRunner = {
  async runAndWait(endpointId, input) {
    const url = typeof input.url === "string" ? input.url : "";
    switch (endpointId) {
      case "jina-reader": {
        const md = PAGES[url];
        return md ? done({ data: { content: md, title: url.endsWith("/") ? `${keyOf(new URL(url).hostname)} home` : null } }) : done({ data: { content: "" } });
      }
      case "serper-news": return done(NEWS[String(input.q).replace(/"/g, "").toLowerCase()] ?? { news: [] });
      case "serper-search": return done(SERP[String(input.q).split(" ")[0].toLowerCase()] ?? { organic: [] });
      case "tomba-technology": {
        const t = TECH[keyOf(String(input.domain))];
        return t ? done(t) : { runId: "run_demo_fail", status: "failed", error: { code: "provider_error", message: "Provider timed out" } };
      }
      case "scrapecreators-facebook-adlibrary-company-ads-get": return done(META_ADS[String(input.companyName).toLowerCase()] ?? { searchResults: [] });
      case "scrapecreators-linkedin-ads-search": return done(LINKEDIN_ADS[String(input.company).toLowerCase()] ?? { ads: [] });
      default: return { runId: "run_demo_unknown", status: "failed", error: { message: `No fixture for ${endpointId}` } };
    }
  },
};
