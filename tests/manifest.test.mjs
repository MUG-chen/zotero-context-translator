import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest targets Zotero 9.0.*", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../addon/manifest.json", import.meta.url)),
  );
  const packageMetadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url)),
  );
  const app = manifest.applications.zotero;

  assert.equal(app.id, "zotero-context-translator@local");
  assert.equal(app.strict_min_version, "9.0");
  assert.equal(app.strict_max_version, "9.0.*");
  assert.match(app.update_url, /^https:\/\//);
  assert.equal(manifest.version, "0.1.6");
  assert.equal(packageMetadata.version, "0.1.6");
});
