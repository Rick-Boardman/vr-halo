import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "src");
const importPattern = /["'](\.{1,2}\/[^"']+\.(?:js|mjs)(?:\?[^"']*)?)["']/g;

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const missing = [];
for (const filePath of walk(srcRoot)) {
  const text = fs.readFileSync(filePath, "utf8");
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1];
    const [pathPart] = specifier.split("?");
    const resolvedPath = path.resolve(path.dirname(filePath), pathPart);
    if (!fs.existsSync(resolvedPath)) {
      missing.push({
        file: path.relative(repoRoot, filePath).replaceAll("\\", "/"),
        specifier,
      });
    }
  }
}

if (missing.length > 0) {
  for (const entry of missing) {
    console.error(`${entry.file}: ${entry.specifier}`);
  }
  process.exit(1);
}

console.log("Halo relative imports are valid.");
