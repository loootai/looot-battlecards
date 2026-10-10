import { describe, expect, it } from "vitest";
import { buildConfig, ConfigError, normalizeDomain, parseConfig } from "./config";

describe("config", () => {
  it("normalises domains and names", () => {
    expect(normalizeDomain("https://www.Acme-Co.com/pricing?x=1")).toBe("acme-co.com");
    const c = buildConfig({ product: { name: "Me" }, competitors: ["https://www.get-acme.com/"] });
    expect(c.competitors[0]).toEqual({ domain: "get-acme.com", name: "Get Acme" });
    expect(c.maxSpendMicros).toBe(1_000_000);
  });
  it("rejects 0 or 11 competitors, duplicates, unknown signals and a bad cap", () => {
    const p = { name: "Me" };
    expect(() => buildConfig({ product: p, competitors: [] })).toThrow(ConfigError);
    expect(() => buildConfig({ product: p, competitors: Array.from({ length: 11 }, (_, i) => `a${i}.com`) })).toThrow(/At most 10/);
    expect(() => buildConfig({ product: p, competitors: ["a.com", "www.a.com"] })).toThrow(/twice/);
    expect(() => buildConfig({ product: p, competitors: ["a.com"], signals: ["gossip"] })).toThrow(/Unknown signal/);
    expect(() => buildConfig({ product: p, competitors: ["a.com"], maxSpendUsd: -1 })).toThrow(/positive/);
    expect(() => normalizeDomain("not a domain")).toThrow(ConfigError);
  });
  it("parses YAML with per-competitor page overrides", () => {
    const c = parseConfig("product:\n  name: Me\n  strengths: [Fast]\ncompetitors:\n  - domain: a.com\n    pricingUrl: https://a.com/plans\nsignals: [pricing]\nmaxSpendUsd: 0.25\n");
    expect(c.competitors[0].pricingUrl).toBe("https://a.com/plans");
    expect(c.signals).toEqual(["pricing"]);
    expect(c.maxSpendMicros).toBe(250_000);
  });
});
