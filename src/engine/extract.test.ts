import { describe, expect, it } from "vitest";
import { extractAds, extractHiring, extractNews, extractPositioning, extractPricing, extractReviews, extractTech, parsePage } from "./extract";

const S = { sourceUrl: "https://x.example/p", via: "jina-reader", fetchedAt: "2026-10-10T09:00:00.000Z" };

describe("extractPricing", () => {
  it("reads plan names and prices, and the free, quote-only and discount hints", () => {
    const md = "## Starter\nStarter $12 / month per user\n\n## Enterprise\nEnterprise custom pricing, talk to sales\n\nStart for free. Save 20% yearly.";
    const texts = extractPricing(md, S).map((c) => c.text);
    expect(texts).toContain("Starter: $12 / month");
    expect(texts.some((t) => t.includes("free plan"))).toBe(true);
    expect(texts.some((t) => t.includes("on request"))).toBe(true);
    expect(texts.some((t) => t.includes("Save 20%"))).toBe(true);
  });
  it("stamps every claim with source, endpoint and date", () => {
    for (const c of extractPricing("Pro - $49 per month", S)) expect(c).toMatchObject({ sourceUrl: S.sourceUrl, via: "jina-reader", fetchedAt: S.fetchedAt });
  });
  it("returns nothing for a page with no prices", () => {
    expect(extractPricing("# Hello\nWe sell things.", S)).toEqual([]);
  });
});

describe("extractPositioning", () => {
  it("takes the title, the first headline and the first full sentence", () => {
    const c = extractPositioning("# Invoices that get paid\n\n[Menu](/m)\n\nWe send polished invoices and chase late payers for you every week.", "Home", S);
    expect(c.map((x) => x.text.split(":")[0])).toEqual(["Page title", "Headline", "Subhead"]);
  });
});

describe("extractHiring", () => {
  it("counts roles by function and names the biggest", () => {
    const r = extractHiring("- Senior Backend Engineer\n- Staff Frontend Engineer\n- Account Executive\nWe are a friendly team that builds things together every day of the week.", S);
    expect(r.roles).toBe(3);
    expect(r.claims[0].text).toContain("engineering 2");
    expect(r.claims[1].text).toContain("engineering");
  });
  it("finds no roles on a page with none", () => {
    expect(extractHiring("# Careers\nNo openings right now.", S)).toEqual({ claims: [], roles: 0 });
  });
});

describe("extractNews", () => {
  it("keeps five items with the article link as the source", () => {
    const raw = { news: Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, link: `https://n.example/${i}`, source: "Daily", date: "2026-10-01T00:00:00Z" })) };
    const c = extractNews(raw, S);
    expect(c).toHaveLength(5);
    expect(c[0].sourceUrl).toBe("https://n.example/0");
    expect(c[0].text).toContain("Daily, 2026-10-01");
  });
});

describe("extractReviews", () => {
  const raw = { organic: [
    { title: "A - G2", link: "https://www.g2.com/a", snippet: "4.5 out of 5. Easy to use but expensive." },
    { title: "blog", link: "https://acme.example/blog", snippet: "expensive expensive" },
  ] };
  it("only uses review sites and links each theme to its snippet", () => {
    const c = extractReviews(raw, S);
    expect(c.some((x) => x.text.startsWith("Rated 4.5"))).toBe(true);
    const price = c.find((x) => x.text.includes("for price"));
    expect(price?.sourceUrl).toBe("https://www.g2.com/a");
    expect(price?.text).toContain("1 of 1");
  });
});

describe("extractTech", () => {
  it("groups technologies by category", () => {
    const c = extractTech({ data: { technologies: [{ name: "React", categories: ["Frameworks"] }, { name: "Next.js", categories: ["Frameworks"] }] } }, S);
    expect(c[0].text).toBe("Frameworks: React, Next.js");
  });
});

describe("extractAds", () => {
  it("counts angles and links each quoted ad to the library entry", () => {
    const meta = { searchResults: [{ ad_archive_id: "1", snapshot: { body: { text: "Save time. Try it free." } } }] };
    const c = extractAds(meta, { ads: [{ id: "9", headline: "AI for ops" }] }, { ...S, via: "meta-ep" }, "li-ep");
    expect(c[0].text).toContain("2 ads found");
    expect(c[1].text).toContain("price and savings");
    expect(c.find((x) => x.text.startsWith("Meta ad"))?.sourceUrl).toBe("https://www.facebook.com/ads/library/?id=1");
    expect(c.find((x) => x.text.startsWith("LinkedIn ad"))?.via).toBe("li-ep");
  });
});

describe("parsePage", () => {
  it("reads both reader shapes", () => {
    expect(parsePage({ data: { content: "a", title: "t" } })).toEqual({ content: "a", title: "t" });
    expect(parsePage({ markdown: "b", metadata: { title: "u" } })).toEqual({ content: "b", title: "u" });
  });
});
