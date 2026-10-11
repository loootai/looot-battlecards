import { beforeAll, describe, expect, it } from "vitest";
import { freshEnv } from "./testHelpers";

/**
 * Every API route handler is found on disk, not listed by hand, so a new route with no gate fails here.
 * With an admin password set and no session cookie, each admin handler must answer 401.
 */
const PUBLIC_API = new Set(["/api/health", "/api/auth/login", "/api/auth/logout"]);

const modules = import.meta.glob("/src/app/api/**/route.ts") as Record<string, () => Promise<Record<string, unknown>>>;

const routeOf = (file: string) => file.replace("/src/app", "").replace(/\/route\.ts$/, "");

beforeAll(() => {
  freshEnv();
});

describe("admin API handlers refuse a request with no session", () => {
  const admin = Object.keys(modules).filter((f) => !PUBLIC_API.has(routeOf(f)));
  it("finds the admin routes", () => expect(admin.length).toBeGreaterThanOrEqual(3));
  for (const file of admin) {
    it(`${routeOf(file)} answers 401 for every method it exports`, async () => {
      const mod = await modules[file]();
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => typeof mod[m] === "function");
      expect(methods.length).toBeGreaterThan(0);
      for (const m of methods) {
        const init: RequestInit = m === "GET" ? { method: m } : { method: m, headers: { "content-type": "application/json", origin: "http://localhost" }, body: "{}" };
        const res = await (mod[m] as (r: Request, c?: unknown) => Promise<Response>)(new Request(`http://localhost${routeOf(file).replace("[domain]", "example.com")}`, init), { params: Promise.resolve({ domain: "example.com" }) });
        expect(res.status, `${m} ${routeOf(file)}`).toBe(401);
      }
    });
  }
});
