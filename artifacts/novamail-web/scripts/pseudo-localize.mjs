import fs from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve(new URL("..", import.meta.url).pathname, "src/locales/en");
const outputDir = path.resolve(new URL("..", import.meta.url).pathname, ".generated/pseudo-locale");
const accentMap = new Map(Object.entries({
  a: "ȧ", b: "ƀ", c: "ƈ", d: "ḓ", e: "ḗ", f: "ƒ", g: "ɠ", h: "ħ", i: "ī", j: "ĵ", k: "ķ", l: "ḽ", m: "m", n: "ƞ", o: "ȯ", p: "ƥ", q: "ɋ", r: "ř", s: "ş", t: "ŧ", u: "ū", v: "ṽ", w: "ŵ", x: "ẋ", y: "ẏ", z: "ž",
}));
const transform = (value) => {
  const text = String(value);
  const expanded = [...text].map((char) => accentMap.get(char.toLowerCase()) ?? char).join("");
  return `［${expanded} ${expanded.slice(0, Math.min(12, expanded.length))}］`;
};
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
for (const file of (await fs.readdir(sourceDir)).filter((name) => name.endsWith(".json"))) {
  const source = JSON.parse(await fs.readFile(path.join(sourceDir, file), "utf8"));
  const pseudo = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, transform(value)]));
  await fs.writeFile(path.join(outputDir, file), `${JSON.stringify(pseudo, null, 2)}\n`);
}
console.log(`Pseudo-localization generated at ${outputDir}`);
