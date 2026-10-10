import type { SignalId } from "./types";

export interface SignalDef {
  id: SignalId;
  title: string;
  /** looot job id, kept as the catalog reference. */
  jobId: string;
  /** The pinned looot endpoint this app runs. */
  endpointId: string;
  /** Price per call in micro-dollars, read from the public catalog on PRICES_AS_OF. */
  fallbackMicros: number;
  /** Calls per competitor. */
  calls: number;
  /** false until someone has checked a real response body against the parser. */
  shapeVerified: boolean;
}

export const PRICES_AS_OF = "2026-10-10";

/** Page reader used for the pricing page, the homepage and the careers page. */
export const PAGE_READER = { jobId: "web.scrape.markdown", endpointId: "jina-reader", fallbackMicros: 200 };

export const ENDPOINTS = {
  pageReader: PAGE_READER.endpointId,
  news: "serper-news",
  search: "serper-search",
  tech: "tomba-technology",
  metaAds: "scrapecreators-facebook-adlibrary-company-ads-get",
  linkedinAds: "scrapecreators-linkedin-ads-search",
} as const;

/** Every signal a card can hold. Job ids and prices come from the free looot catalog. */
export const SIGNALS: Record<SignalId, SignalDef> = {
  pricing: { id: "pricing", title: "Pricing", jobId: "web.scrape.markdown", endpointId: ENDPOINTS.pageReader, fallbackMicros: 200, calls: 1, shapeVerified: false },
  positioning: { id: "positioning", title: "Positioning", jobId: "web.scrape.markdown", endpointId: ENDPOINTS.pageReader, fallbackMicros: 200, calls: 1, shapeVerified: false },
  news: { id: "news", title: "Recent news", jobId: "news.search", endpointId: ENDPOINTS.news, fallbackMicros: 1000, calls: 1, shapeVerified: false },
  hiring: { id: "hiring", title: "Hiring direction", jobId: "web.scrape.markdown", endpointId: ENDPOINTS.pageReader, fallbackMicros: 200, calls: 1, shapeVerified: false },
  tech: { id: "tech", title: "Tech stack", jobId: "company.technographics", endpointId: ENDPOINTS.tech, fallbackMicros: 8900, calls: 1, shapeVerified: false },
  reviews: { id: "reviews", title: "Review themes", jobId: "google.serp.organic", endpointId: ENDPOINTS.search, fallbackMicros: 1000, calls: 1, shapeVerified: true },
  ads: { id: "ads", title: "Ad angles", jobId: "ads.meta.search, ads.linkedin.search", endpointId: ENDPOINTS.metaAds, fallbackMicros: 1880, calls: 2, shapeVerified: false },
};

export const ALL_SIGNALS = Object.keys(SIGNALS) as SignalId[];

/** Fallback price per endpoint id, dated PRICES_AS_OF. The ads signal also calls the LinkedIn ad library. */
export const FALLBACK_PRICES: Record<string, number> = {
  [ENDPOINTS.pageReader]: 200,
  [ENDPOINTS.news]: 1000,
  [ENDPOINTS.search]: 1000,
  [ENDPOINTS.tech]: 8900,
  [ENDPOINTS.metaAds]: 1880,
  [ENDPOINTS.linkedinAds]: 1880,
};
