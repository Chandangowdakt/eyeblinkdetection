import { it } from "vitest";
import { writeGoldenReal } from "./snapshotReal";

it("writes tests/golden.json real counts from tests/fixtures/real/*.csv", () => {
  const result = writeGoldenReal();
  const names = Object.keys(result.real);
  // eslint-disable-next-line no-console
  console.log(
    names.length === 0
      ? "No CSVs in tests/fixtures/real; golden.real is {}."
      : `Snapshot ${names.length} file(s): ${JSON.stringify(result.real)}`,
  );
});
