import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("build creates a single classic-script runtime for Zotero", async () => {
  const buildScript = await readFile(
    new URL("../scripts/build-xpi.ps1", import.meta.url),
    "utf8",
  );
  const bundler = await readFile(
    new URL("../scripts/build-bundle.mjs", import.meta.url),
    "utf8",
  );

  assert.match(buildScript, /build-bundle\.mjs/);
  assert.doesNotMatch(buildScript, /Compress-Archive/);
  assert.match(buildScript, /CreateEntryFromFile/);
  assert.match(bundler, /globalName:\s*["']ZoteroContextTranslator["']/);
  assert.match(bundler, /format:\s*["']iife["']/);
});
