import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/generated/prisma/", import.meta.url));

async function normalize(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalize(path);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const source = await readFile(path, "utf8");
    const normalized = source.replace(/[ \t]+(?=\r?\n)/g, "");
    if (normalized !== source) await writeFile(path, normalized, "utf8");
  }
}

await normalize(root);
console.log("Normalized Prisma generated TypeScript whitespace");
