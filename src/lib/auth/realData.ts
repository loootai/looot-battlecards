import type { Env } from "./policy";

/** true when a real looot token is set. The demo shows invented cards and ignores the cards folder, so the token is the only real thing it could sit next to. */
export function hasRealData(env: Env = process.env): boolean {
  return !!(env.LOOOT_TOKEN && env.LOOOT_TOKEN.trim() !== "");
}
