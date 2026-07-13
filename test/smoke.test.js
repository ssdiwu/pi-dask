import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package exposes the root Pi entrypoint and generated declarations", () => {
  assert.equal(packageJson.main, "index.ts");
  assert.equal(packageJson.types, "dist/index.d.ts");
  assert.deepEqual(packageJson.pi.extensions, ["./index.ts"]);
});
