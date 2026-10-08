import { describe, expect, it } from "vitest";
import { countRealFixtures } from "../scripts/snapshotReal";
import golden from "./golden.json";

describe("real fixture snapshot helper", () => {
  it("does not change detector counts for files in tests/fixtures/real", () => {
    const counted = countRealFixtures();
    expect(counted).toEqual(golden.real ?? {});
  });
});
