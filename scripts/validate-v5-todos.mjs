import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['artifacts/api-server', 'artifacts/novamail-web', 'mobile/novamail-flutter', 'lib'];
const ignored = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const marker = /\bTODO\b|\bFIXME\b|\bnot implemented\b/gi;
const allowed = new Set([
  'artifacts/api-server/.replit-artifact/artifact.toml:2',
  'artifacts/api-server/src/modules/gmail/provider-adapter.ts:18',
]);
const hits = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(ts|tsx|dart|js|mjs|json|yaml|yml|toml|md)$/.test(entry.name)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!marker.test(line)) return;
        marker.lastIndex = 0;
        const relative = path.relative(root, file).replaceAll(path.sep, '/');
        hits.push(`${relative}:${index + 1}`);
      });
    }
  }
}

for (const scanRoot of scanRoots) walk(path.join(root, scanRoot));
const unknown = hits.filter((hit) => !allowed.has(hit));
if (unknown.length > 0) {
  console.error(`Untracked v5 markers found:\n${unknown.join('\n')}`);
  process.exit(1);
}
console.log(`v5 marker validation passed: ${hits.length} documented markers.`);
