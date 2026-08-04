import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = process.argv[2];
if (!outputPath) throw new Error("An output path is required");

await build({
  entryPoints: [resolve(repositoryRoot, "addon/content/modules/plugin.mjs")],
  outfile: resolve(outputPath),
  bundle: true,
  format: "iife",
  globalName: "ZoteroContextTranslator",
  platform: "browser",
  target: ["firefox115"],
  charset: "utf8",
  legalComments: "none",
});
