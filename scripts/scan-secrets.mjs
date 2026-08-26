import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|xoxb)-[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-(?:live|proj)-[A-Za-z0-9_-]{20,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
];
const findings = [];
for (const file of files) {
  if (file.endsWith(".lock") || file.includes("/fixtures/") || file.includes("/snapshots/")) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const pattern of patterns) {
    if (pattern.test(text)) findings.push(`${file}: ${pattern}`);
  }
}
if (findings.length) {
  console.error("Potential secret markers detected:");
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log(`Secret scan passed for ${files.length} tracked files`);
