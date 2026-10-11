import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { POST as login } from "@/app/api/auth/login/route";
import { csrfToken, verifySession } from "./session";

export const PW = "test-password-123456";
export const HOST = "localhost:3000";
const BASE = `http://${HOST}`;
const H = { host: HOST, origin: BASE, "content-type": "application/json", "x-forwarded-for": "198.51.100.7" };

/** A same-origin JSON POST. */
export const post = (url: string, body: unknown, headers: Record<string, string> = {}) => new Request(`${BASE}${url}`, { method: "POST", headers: { ...H, ...headers }, body: JSON.stringify(body) });

export const cookieOf = (res: Response) => /battlecards_session=[^;]+/.exec(res.headers.get("set-cookie") ?? "")?.[0] ?? "";

/** Signs in with the test password and returns the cookie and the CSRF token that belongs to it. */
export async function signIn(): Promise<{ cookie: string; token: string; headers: Record<string, string> }> {
  const res = await login(post("/api/auth/login", { password: PW }));
  const cookie = cookieOf(res);
  const s = (await verifySession(process.env, cookie.split("=")[1]))!;
  const token = await csrfToken(process.env, s.sid);
  return { cookie, token, headers: { cookie, "x-battlecards-csrf": token } };
}

/** Points the cards folder at a fresh temp folder and sets the test password. Call from beforeEach. */
export function freshEnv(): void {
  mkdirSync(join(process.cwd(), ".vitest"), { recursive: true });
  process.env.CARDS_DIR = mkdtempSync(join(process.cwd(), ".vitest", "cards-"));
  process.env.BATTLECARDS_ADMIN_PASSWORD = PW;
  delete process.env.NEXT_PUBLIC_DEMO;
  delete process.env.LOOOT_TOKEN;
  delete process.env.BATTLECARDS_MAX_SPEND_USD;
}
