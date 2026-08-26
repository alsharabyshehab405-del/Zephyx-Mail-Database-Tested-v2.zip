import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const output = process.env.SBOM_OUTPUT ?? "artifacts/sbom.cdx.json";
const raw = execFileSync("pnpm", ["list", "--json", "--depth=0", "-r"], { encoding: "utf8" });
const trees = JSON.parse(raw);
const components = [];
const seen = new Set();
for (const tree of Array.isArray(trees) ? trees : [trees]) {
  const deps = { ...(tree.dependencies ?? {}), ...(tree.devDependencies ?? {}) };
  for (const [name, value] of Object.entries(deps)) {
    const version = typeof value === "object" && value ? value.version : String(value);
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    components.push({ type: "library", "bom-ref": key, name, version, purl: `pkg:npm/${name}@${version}` });
  }
}
components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));
mkdirSync(new URL(".", `file://${process.cwd()}/${output}`).pathname, { recursive: true });
writeFileSync(output, JSON.stringify({
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: { timestamp: new Date().toISOString(), tools: [{ vendor: "Zephyx Mail", name: "generate-sbom.mjs", version: "6" }] },
  components,
}, null, 2) + "\n");
console.log(`SBOM=${output} components=${components.length}`);
