import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrameCsv, replayRows } from "../src/replay";

export type GoldenFile = {
  fullBlink: number;
  twoFullBlinks: number;
  partialDip: number;
  jitterOnly: number;
  oneEyeOnly: number;
  headTilt: number;
  real: Record<string, number>;
  notes?: string;
};

export function realFixtureDir(fromDir = dirname(fileURLToPath(import.meta.url))): string {
  return join(fromDir, "..", "tests", "fixtures", "real");
}

export function goldenPath(fromDir = dirname(fileURLToPath(import.meta.url))): string {
  return join(fromDir, "..", "tests", "golden.json");
}

export function listRealCsvs(dir = realFixtureDir()): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort();
}

/** Replay each real CSV through the current detector. Does not modify BlinkDetector. */
export function countRealFixtures(dir = realFixtureDir()): Record<string, number> {
  const real: Record<string, number> = {};
  for (const file of listRealCsvs(dir)) {
    const csv = readFileSync(join(dir, file), "utf8");
    real[file] = replayRows(parseFrameCsv(csv)).count;
  }
  return real;
}

export function writeGoldenReal(options?: { dir?: string; golden?: string }): GoldenFile {
  const dir = options?.dir ?? realFixtureDir();
  const path = options?.golden ?? goldenPath();
  const current = JSON.parse(readFileSync(path, "utf8")) as GoldenFile;
  current.real = countRealFixtures(dir);
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
  return current;
}
