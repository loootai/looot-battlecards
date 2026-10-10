export type SignalId = "pricing" | "positioning" | "news" | "hiring" | "tech" | "reviews" | "ads";

export interface Claim {
  text: string;
  /** Page or post the claim comes from. */
  sourceUrl: string;
  /** looot endpoint that supplied it. */
  via: string;
  /** ISO time the data was fetched. */
  fetchedAt: string;
}

export type SectionStatus = "ok" | "empty" | "pending" | "failed" | "skipped" | "not_run";

export interface Section {
  signal: SignalId;
  title: string;
  status: SectionStatus;
  claims: Claim[];
  /** Why the section is not "ok", in plain words. */
  note?: string;
  costMicros: number;
}

export interface Competitor {
  domain: string;
  name: string;
  pricingUrl?: string;
  careersUrl?: string;
}

export interface Card {
  competitor: Competitor;
  generatedAt: string;
  sections: Section[];
  costMicros: number;
  /** Optional model-written summary. Kept apart from the sourced claims. */
  summary?: { text: string; model: string; generatedAt: string };
}

export interface Product {
  name: string;
  domain?: string;
  /** Written by the user. Shown as "Where we win" and marked as the user's own words. */
  strengths: string[];
}

export interface BattlecardConfig {
  product: Product;
  competitors: Competitor[];
  signals: SignalId[];
  maxSpendMicros: number;
}
