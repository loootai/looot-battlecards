import { parse } from "yaml";
import { ALL_SIGNALS } from "./signals";
import type { BattlecardConfig, Competitor, SignalId } from "./types";

export class ConfigError extends Error {}

const DEFAULT_MAX_USD = 1;

/** "https://www.Acme.com/pricing" or "acme.com" to "acme.com". Throws on anything that is not a host. */
export function normalizeDomain(input: string): string {
  const host = input.trim().replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) throw new ConfigError(`"${input}" is not a domain.`);
  return host;
}

/** "get-acme.co.uk" to "Get Acme". A readable guess, overridden by `name` in the config. */
export function nameFromDomain(domain: string): string {
  const label = domain.split(".")[0];
  return label.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function competitorOf(v: unknown): Competitor {
  if (typeof v === "string") {
    const domain = normalizeDomain(v);
    return { domain, name: nameFromDomain(domain) };
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.domain !== "string") throw new ConfigError("Each competitor needs a domain.");
    const domain = normalizeDomain(o.domain);
    return {
      domain,
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : nameFromDomain(domain),
      ...(typeof o.pricingUrl === "string" ? { pricingUrl: o.pricingUrl } : {}),
      ...(typeof o.careersUrl === "string" ? { careersUrl: o.careersUrl } : {}),
    };
  }
  throw new ConfigError("A competitor is a domain or an object with a domain.");
}

/** Validates a parsed config object. 1 to 10 competitors, known signals, a positive spend cap. */
export function buildConfig(raw: unknown): BattlecardConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (o.product && typeof o.product === "object" ? o.product : {}) as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim()) throw new ConfigError("product.name is required.");
  if (!Array.isArray(o.competitors) || o.competitors.length < 1) throw new ConfigError("Give 1 to 10 competitors.");
  if (o.competitors.length > 10) throw new ConfigError("At most 10 competitors per run.");
  const competitors = o.competitors.map(competitorOf);
  const seen = new Set<string>();
  for (const c of competitors) {
    if (seen.has(c.domain)) throw new ConfigError(`${c.domain} is listed twice.`);
    seen.add(c.domain);
  }
  const signals = (Array.isArray(o.signals) && o.signals.length > 0 ? o.signals : ALL_SIGNALS) as string[];
  for (const s of signals) if (!ALL_SIGNALS.includes(s as SignalId)) throw new ConfigError(`Unknown signal "${s}". Known: ${ALL_SIGNALS.join(", ")}.`);
  const maxUsd = o.maxSpendUsd === undefined ? DEFAULT_MAX_USD : Number(o.maxSpendUsd);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new ConfigError("maxSpendUsd must be a positive number.");
  return {
    product: {
      name: p.name.trim(),
      ...(typeof p.domain === "string" ? { domain: normalizeDomain(p.domain) } : {}),
      strengths: Array.isArray(p.strengths) ? p.strengths.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [],
    },
    competitors,
    signals: signals as SignalId[],
    maxSpendMicros: Math.round(maxUsd * 1_000_000),
  };
}

/** Parses the YAML text of a battlecards config file. */
export function parseConfig(text: string): BattlecardConfig {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new ConfigError(`The config is not valid YAML: ${(e as Error).message}`);
  }
  return buildConfig(raw);
}
