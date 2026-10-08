import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function idsInHtml(source: string): string[] {
  return [...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
}

function idsQueriedInTs(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/querySelector(?:All)?<[^>]*>\(\s*["'`]#([A-Za-z][\w-]*)["'`]/g)) {
    found.add(match[1]!);
  }
  for (const match of source.matchAll(/querySelector(?:All)?\(\s*["'`]#([A-Za-z][\w-]*)["'`]/g)) {
    found.add(match[1]!);
  }
  for (const match of source.matchAll(/getElementById\(\s*["'`]([A-Za-z][\w-]*)["'`]/g)) {
    found.add(match[1]!);
  }
  return [...found];
}

describe("DOM ids", () => {
  it("every #id queried in src/**/*.ts exists exactly once in index.html", () => {
    const htmlIds = idsInHtml(html);
    const counts = new Map<string, number>();
    for (const id of htmlIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) {
      expect(count, `duplicate id ${id}`).toBe(1);
    }
    const queried = new Set<string>();
    for (const file of walkTs(join(root, "src"))) {
      for (const id of idsQueriedInTs(readFileSync(file, "utf8"))) queried.add(id);
    }
    for (const id of queried) {
      expect(counts.get(id) ?? 0, `missing id #${id}`).toBe(1);
    }
  });
});
