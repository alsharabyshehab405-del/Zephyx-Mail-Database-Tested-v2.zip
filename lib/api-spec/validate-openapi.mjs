import fs from "node:fs";
import YAML from "yaml";

const file = new URL("./openapi.yaml", import.meta.url);
const source = fs.readFileSync(file, "utf8");
const document = YAML.parseDocument(source, { uniqueKeys: true });
if (document.errors.length > 0) {
  for (const error of document.errors) console.error(error.message);
  process.exit(1);
}
const spec = document.toJS();
if (!new Set(["3.0.3", "3.1.0"]).has(spec.openapi)) throw new Error(`Unsupported OpenAPI version ${spec.openapi}`);
if (!spec.info?.title || !spec.info?.version) throw new Error("OpenAPI info.title and info.version are required");
if (!spec.paths || typeof spec.paths !== "object") throw new Error("OpenAPI paths are required");
for (const path of ["/health/live", "/health/ready", "/health/worker/ready", "/metrics", "/notifications/devices", "/notifications/preferences", "/realtime/events", "/gmail/accounts"]) {
  if (!spec.paths[path]) throw new Error(`Missing required path ${path}`);
}
if (!spec.components?.securitySchemes?.bearerAuth) throw new Error("bearerAuth security scheme is required");
const localeEnum = spec.components?.schemas?.User?.properties?.locale?.enum ?? spec.components?.schemas?.UserUpdate?.properties?.locale?.enum ?? [];
const expectedLocales = ["en", "ar", "es", "fr", "de", "pt", "it", "tr", "ru", "zh-CN", "ja", "ko", "hi", "id", "ur"];
if (JSON.stringify(localeEnum) !== JSON.stringify(expectedLocales)) throw new Error(`Locale enum drift: ${JSON.stringify(localeEnum)}`);
console.log(`OpenAPI valid: ${Object.keys(spec.paths).length} paths, ${Object.keys(spec.components.schemas ?? {}).length} schemas`);
