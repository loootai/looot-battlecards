import { domainOf, isoDate, list, obj, str } from "@/lib/util";
import type { Claim } from "./types";

/** What an extractor needs to stamp on every claim. */
export interface Stamp {
  sourceUrl: string;
  via: string;
  fetchedAt: string;
}

const claim = (text: string, s: Stamp, sourceUrl = s.sourceUrl): Claim => ({ text, sourceUrl, via: s.via, fetchedAt: s.fetchedAt });
const clip = (t: string, n = 160) => (t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t);
const plain = (t: string) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#]+/g, "").replace(/\s+/g, " ").trim();

/** Page readers. jina-reader: { data: { content, title } }. serper-webpage: { markdown, text, metadata: { title } }. */
export function parsePage(raw: unknown): { content: string; title: string | null } {
  const o = obj(raw);
  const d = obj(o.data);
  const content = str(d.content, o.markdown, o.content, o.text, d.markdown, d.text) ?? (typeof raw === "string" ? raw : "");
  return { content, title: str(d.title, obj(o.metadata).title, o.title) };
}

// ---------- pricing ----------

const PRICE_RE = /(?:US\$|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:\/|per)\s?(?:user|seat|member|month|mo|year|yr|editor|agent)(?:\s?(?:\/|per)\s?(?:month|mo|year|yr))?)?/i;

/** Plan names and prices read from a pricing page, plus free-tier, quote-only and discount hints. */
export function extractPricing(markdown: string, s: Stamp): Claim[] {
  const lines = markdown.split(/\r?\n/);
  const out: Claim[] = [];
  const seen = new Set<string>();
  let heading = "";
  for (const line of lines) {
    const h = /^#{1,4}\s+(.+)$/.exec(line);
    if (h) heading = plain(h[1]);
    const m = PRICE_RE.exec(line);
    if (!m) continue;
    const price = m[0].replace(/\s+/g, " ").trim();
    const before = plain(line.slice(0, m.index)).replace(/[:|\-]+$/, "").trim();
    const plan = before.length > 1 && before.length <= 40 ? before : heading;
    const key = `${plan}|${price}`.toLowerCase();
    if (!plan || seen.has(key) || /^\d/.test(plan)) continue;
    seen.add(key);
    out.push(claim(`${plan}: ${price}`, s));
    if (out.length >= 8) break;
  }
  const text = markdown;
  if (/\b(free (plan|forever|tier)|forever free|start for free|free trial)\b/i.test(text)) out.push(claim("Offers a free plan or free trial (the page says so).", s));
  if (/\b(contact (sales|us)|talk to sales|custom pricing|book a demo)\b/i.test(text) && /enterprise/i.test(text)) out.push(claim("Enterprise pricing is on request.", s));
  const save = /(save|get)\s+(up to\s+)?(\d{1,2})%/i.exec(text) ?? /(\d)\s+months?\s+free/i.exec(text);
  if (save) out.push(claim(`Annual discount mentioned: "${clip(plain(save[0]), 60)}".`, s));
  return out;
}

// ---------- positioning ----------

/** The page title, the first headline and the first full sentence under it. */
export function extractPositioning(markdown: string, title: string | null, s: Stamp): Claim[] {
  const out: Claim[] = [];
  if (title) out.push(claim(`Page title: "${clip(plain(title), 120)}"`, s));
  const lines = markdown.split(/\r?\n/);
  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (h1 >= 0) {
    out.push(claim(`Headline: "${clip(plain(lines[h1].replace(/^#\s+/, "")), 140)}"`, s));
    for (const l of lines.slice(h1 + 1, h1 + 15)) {
      const t = plain(l);
      if (t.split(" ").length >= 8 && !/^\s*[-*]\s*\[/.test(l)) {
        out.push(claim(`Subhead: "${clip(t, 200)}"`, s));
        break;
      }
    }
  }
  return out;
}

// ---------- hiring ----------

export const FUNCTIONS: [string, RegExp][] = [
  ["engineering", /\b(engineer|developer|software|backend|frontend|full[- ]?stack|sre|devops|platform|security|machine learning|ml\b|data scientist|qa\b)/i],
  ["sales", /\b(account executive|sales|business development|sdr|bdr|account manager|solutions engineer|revenue)/i],
  ["marketing", /\b(marketing|growth|content|seo|brand|communications|demand gen)/i],
  ["customer success and support", /\b(customer success|support|implementation|onboarding|customer experience)/i],
  ["product and design", /\b(product manager|product design|designer|ux|researcher|product owner)/i],
  ["operations and finance", /\b(finance|accountant|legal|people|recruit|talent|operations|hr\b|office)/i],
];

const ROLE_WORD = /\b(engineer|developer|manager|designer|executive|specialist|analyst|director|lead|head of|recruiter|representative|scientist|architect|associate|coordinator|writer|marketer|counsel)\b/i;

/** Open roles found on a careers page, counted by function. Reads link and heading lines that look like job titles. */
export function extractHiring(markdown: string, s: Stamp): { claims: Claim[]; roles: number } {
  const titles: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const t = plain(line.replace(/^\s*[-*+]\s*/, ""));
    if (t.length < 6 || t.length > 90 || !ROLE_WORD.test(t)) continue;
    if (/\.\s+\S/.test(t) || t.split(" ").length > 12) continue; // a sentence, not a title
    if (!titles.includes(t)) titles.push(t);
  }
  if (titles.length === 0) return { claims: [], roles: 0 };
  const counts = new Map<string, number>();
  for (const t of titles) {
    const f = FUNCTIONS.find(([, re]) => re.test(t))?.[0] ?? "other";
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const claims = [
    claim(`${titles.length} open roles read from the careers page: ${ranked.map(([f, n]) => `${f} ${n}`).join(", ")}.`, s),
    claim(`Most roles are in ${ranked[0][0]} (${ranked[0][1]} of ${titles.length}).`, s),
    claim(`Sample roles: ${titles.slice(0, 4).join("; ")}.`, s),
  ];
  return { claims, roles: titles.length };
}

// ---------- news ----------

/** serper-news: { news: [{ title, link, snippet, date, source }] }. The five newest. */
export function extractNews(raw: unknown, s: Stamp): Claim[] {
  return list(raw, ["news", "results"])
    .flatMap((r) => {
      const title = str(r.title);
      const url = str(r.link, r.url);
      if (!title || !url) return [];
      const when = isoDate(r.date)?.slice(0, 10) ?? str(r.date);
      const outlet = str(r.source);
      return [claim(`${title}${outlet || when ? ` (${[outlet, when].filter(Boolean).join(", ")})` : ""}`, s, url)];
    })
    .slice(0, 5);
}

// ---------- reviews ----------

const REVIEW_SITES = ["g2.com", "trustpilot.com", "capterra.com", "softwareadvice.com", "getapp.com", "gartner.com", "producthunt.com", "reddit.com"];

export const REVIEW_THEMES: { theme: string; tone: "praise" | "complaint"; re: RegExp }[] = [
  { theme: "ease of use", tone: "praise", re: /\b(easy to use|ease of use|intuitive|simple to|user[- ]friendly)\b/i },
  { theme: "good support", tone: "praise", re: /\b(great|excellent|responsive|helpful) (customer )?(support|service|team)\b/i },
  { theme: "value for money", tone: "praise", re: /\b(good value|worth the (price|money)|affordable|great price)\b/i },
  { theme: "integrations", tone: "praise", re: /\b(integrat(es|ions?) (well|with)|great integrations)\b/i },
  { theme: "price", tone: "complaint", re: /\b(expensive|overpriced|price (hike|increase)|pricey|too costly)\b/i },
  { theme: "bugs and reliability", tone: "complaint", re: /\b(buggy|bugs?|crash(es|ed)?|downtime|unreliable|glitch(y|es)?)\b/i },
  { theme: "missing features", tone: "complaint", re: /\b(lacks?|missing|no way to|limited (features|functionality|reporting)|wish (it|they) had)\b/i },
  { theme: "slow support", tone: "complaint", re: /\b(slow|poor|terrible|no) (customer )?(support|response)\b/i },
  { theme: "learning curve", tone: "complaint", re: /\b(steep learning curve|hard to learn|complicated|confusing)\b/i },
];

/** serper-search results from review sites, grouped into themes by plain keyword rules. Each theme links to one snippet. */
export function extractReviews(raw: unknown, s: Stamp): Claim[] {
  const hits = list(raw, ["organic", "results"]).flatMap((r) => {
    const url = str(r.link, r.url);
    const dom = domainOf(url);
    const text = str(r.snippet);
    if (!url || !dom || !text || !REVIEW_SITES.some((d) => dom === d || dom.endsWith(`.${d}`))) return [];
    return [{ url, dom, text, title: str(r.title) ?? "" }];
  });
  if (hits.length === 0) return [];
  const out: Claim[] = [];
  for (const h of hits) {
    const rating = /(\d(?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?)/i.exec(`${h.title} ${h.text}`);
    if (rating) out.push(claim(`Rated ${rating[1]} out of 5 on ${h.dom}.`, s, h.url));
  }
  for (const t of REVIEW_THEMES) {
    const matching = hits.filter((h) => t.re.test(h.text));
    if (matching.length === 0) continue;
    out.push(claim(`${t.tone === "praise" ? "Praised" : "Criticised"} for ${t.theme} (${matching.length} of ${hits.length} review snippets): "${clip(matching[0].text, 140)}"`, s, matching[0].url));
  }
  return out.slice(0, 10);
}

// ---------- tech ----------

/** tomba-technology: technologies with name and categories, in some list under data or technologies. */
export function extractTech(raw: unknown, s: Stamp): Claim[] {
  const d = obj(obj(raw).data);
  const arr = list(raw, ["technologies", "tech", "results"]).length > 0 ? list(raw, ["technologies", "tech", "results"]) : list(d, ["technologies", "tech", "results"]);
  const byCategory = new Map<string, string[]>();
  for (const t of arr) {
    const name = str(t.name, t.technology);
    if (!name) continue;
    const cats = Array.isArray(t.categories) ? t.categories : Array.isArray(t.category) ? t.category : [t.category];
    const cat = str(...cats.map((c) => (typeof c === "string" ? c : obj(c).name))) ?? "other";
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), name]);
  }
  const out: Claim[] = [];
  for (const [cat, names] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
    out.push(claim(`${cat}: ${[...new Set(names)].slice(0, 6).join(", ")}`, s));
  }
  return out;
}

// ---------- ads ----------

export const AD_ANGLES: [string, RegExp][] = [
  ["price and savings", /\b(save|cheaper|free|no (hidden )?fees?|\$\d|\d+% off|discount|pricing)\b/i],
  ["speed and time saved", /\b(faster|in minutes|minutes|instantly|save (hours|time)|quick(ly)?|automat)/i],
  ["AI", /\b(ai|artificial intelligence|copilot|agent)\b/i],
  ["social proof", /\b(trusted by|\d[\d,]*\+? (customers|teams|companies|users)|rated|reviews?|award)/i],
  ["switching from a rival", /\b(switch|alternative to|vs\.?|instead of|replace)\b/i],
  ["low risk offer", /\b(free trial|try (it )?free|no credit card|money[- ]back|demo)\b/i],
];

/** Ad text from the Meta ad library (snapshot.body.text) or the LinkedIn ad library (description, headline). */
export function adTexts(raw: unknown, network: "meta" | "linkedin"): { text: string; url: string | null }[] {
  const items = list(raw, ["searchResults", "results", "ads", "data"]);
  return items.flatMap((r) => {
    const snap = obj(r.snapshot);
    const text = str(obj(snap.body).text, snap.title, r.ad_creative_body, r.description, r.headline, r.text);
    if (!text) return [];
    const id = str(r.ad_archive_id, r.id);
    const url = network === "meta" ? (id ? `https://www.facebook.com/ads/library/?id=${id}` : null) : str(r.url, r.adUrl, id ? `https://www.linkedin.com/ad-library/detail/${id}` : null);
    return [{ text, url }];
  });
}

/** Counts the angles across both networks and quotes up to three ads, each linked to the library entry. */
export function extractAds(meta: unknown, linkedin: unknown, s: Stamp, linkedinVia = s.via): Claim[] {
  const ads = [...adTexts(meta, "meta").map((a) => ({ ...a, net: "Meta" })), ...adTexts(linkedin, "linkedin").map((a) => ({ ...a, net: "LinkedIn" }))];
  if (ads.length === 0) return [];
  const out: Claim[] = [claim(`${ads.length} ads found (${ads.filter((a) => a.net === "Meta").length} Meta, ${ads.filter((a) => a.net === "LinkedIn").length} LinkedIn).`, s)];
  const counts = AD_ANGLES.map(([angle, re]) => [angle, ads.filter((a) => re.test(a.text)).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (counts.length > 0) out.push(claim(`Angles used: ${counts.map(([a, n]) => `${a} (${n})`).join(", ")}.`, s));
  for (const a of ads.filter((x) => x.url).slice(0, 3)) out.push({ ...claim(`${a.net} ad: "${clip(plain(a.text), 150)}"`, s, a.url ?? s.sourceUrl), via: a.net === "Meta" ? s.via : linkedinVia });
  return out;
}

