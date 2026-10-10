import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = process.cwd();
const tsx = join(root, "node_modules/.bin/tsx");
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(root, ".tmp-test-"));
  dirs.push(d);
  return d;
};
const run = (args: string[], env: Record<string, string> = {}) => spawnSync(tsx, ["src/cli/index.ts", ...args], { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv });
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("cards CLI", () => {
  it("--dry-run prints the list-price cost, makes no call and writes nothing", () => {
    const out = tmp();
    const r = run(["--product", "Me", "--competitors", "a.com,b.com", "--dry-run", "--out", out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("16 calls, list price $0.03052");
    expect(r.stdout).toContain("no looot call was made");
    expect(existsSync(join(out, "index.md"))).toBe(false);
  });
  it("--demo writes json, markdown and html per competitor", () => {
    const out = tmp();
    const r = run(["--demo", "--out", out]);
    expect(r.status).toBe(0);
    for (const ext of ["json", "md", "html"]) expect(existsSync(join(out, `ledgerly.example.${ext}`))).toBe(true);
    expect(readFileSync(join(out, "index.md"), "utf8")).toContain("Tallyroom");
  });
  it("asks for LOOOT_TOKEN on a real run", () => {
    const r = run(["--product", "Me", "--competitors", "a.com", "--out", tmp()], { LOOOT_API_URL: "http://127.0.0.1:9" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("LOOOT_TOKEN is not set");
  });
  it("rejects 11 competitors", () => {
    const r = run(["--product", "Me", "--competitors", Array.from({ length: 11 }, (_, i) => `a${i}.com`).join(","), "--dry-run"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("At most 10");
  });
  it("--help works", () => {
    expect(execFileSync(tsx, ["src/cli/index.ts", "--help"], { cwd: root, encoding: "utf8" })).toContain("--dry-run");
  });
});
