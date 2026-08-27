import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'prisma/seed', 'scripts'];
const files = [];

function collect(relativePath) {
  const absolutePath = path.join(backendRoot, relativePath);
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) collect(child);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(child);
  }
}

for (const root of roots) collect(root);

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: backendRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

console.log(`Sintaxe verificada em ${files.length} arquivos JavaScript.`);
