import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");

describe("index.html encoding", () => {
  it("has exactly one <title> with &mdash; and meta charset UTF-8", () => {
    const titles = html.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi) ?? [];
    expect(titles).toHaveLength(1);
    expect(titles[0]).toBe("<title>BlinkSense &mdash; Real-time Blink Detection</title>");
    expect(html).toMatch(/<meta charset="UTF-8"\s*\/>/i);
    expect(html).not.toContain("\uFFFD");
    expect((html.match(/<title\b/gi) ?? []).length).toBe(1);
    expect(html).toContain('option value="60">60 (experimental)</option>');
    expect(html).toContain('option value="30" selected>30</option>');
  });
});
