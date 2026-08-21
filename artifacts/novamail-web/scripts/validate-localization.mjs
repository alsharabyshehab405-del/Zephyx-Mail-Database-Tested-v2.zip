import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname, "src/locales");
const locales = ["en", "ar", "es", "fr", "de", "pt", "it", "tr", "ru", "zh-CN", "ja", "ko", "hi", "id", "ur"];
const rtlLocales = new Set(["ar", "ur"]);
const files = (await fs.readdir(path.join(root, "en"))).filter((file) => file.endsWith(".json")).sort();
if (files.length === 0) throw new Error("English locale has no namespace files");

const readLocale = async (locale) => {
  const dir = path.join(root, locale);
  const actualFiles = (await fs.readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const missingFiles = files.filter((file) => !actualFiles.includes(file));
  const extraFiles = actualFiles.filter((file) => !files.includes(file));
  if (missingFiles.length || extraFiles.length) {
    throw new Error(`${locale}: namespace files mismatch; missing=${missingFiles.join(",")} extra=${extraFiles.join(",")}`);
  }
  const namespaces = {};
  for (const file of files) {
    const value = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${locale}/${file}: not an object`);
    namespaces[file] = value;
  }
  return namespaces;
};

const source = await readLocale("en");
const tokenSet = (text) => [...String(text).matchAll(/\{([A-Za-z0-9_.-]+)(?:,\s*(?:plural|selectordinal|select)\b)?/g)].map((match) => match[1]).sort().join("|");
const balanced = (text) => {
  let depth = 0;
  for (const char of String(text)) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

for (const locale of locales) {
  const messages = await readLocale(locale);
  for (const file of files) {
    const sourceKeys = Object.keys(source[file]).sort();
    const keys = Object.keys(messages[file]).sort();
    const missing = sourceKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !sourceKeys.includes(key));
    if (missing.length || extra.length) throw new Error(`${locale}/${file}: key mismatch; missing=${missing.join(",")} extra=${extra.join(",")}`);
    for (const key of sourceKeys) {
      const value = messages[file][key];
      if (typeof value !== "string" || !value.trim()) throw new Error(`${locale}/${file}/${key}: empty or non-string value`);
      if (tokenSet(value) !== tokenSet(source[file][key])) throw new Error(`${locale}/${file}/${key}: ICU placeholder mismatch`);
      if (!balanced(value)) throw new Error(`${locale}/${file}/${key}: unbalanced ICU braces or quotes`);
    }
  }
  const direction = rtlLocales.has(locale) ? "rtl" : "ltr";
  if (!direction) throw new Error(`${locale}: missing direction`);
}

console.log(`Localization validation passed: ${locales.length} locales, ${files.length} namespaces, ${Object.values(source).reduce((sum, value) => sum + Object.keys(value).length, 0)} English keys.`);
console.log(`RTL locales: ${[...rtlLocales].join(", ")}`);
