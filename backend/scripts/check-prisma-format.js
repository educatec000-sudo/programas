import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');
const prismaCli = path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');
const original = fs.readFileSync(schemaPath, 'utf8');

const result = spawnSync(process.execPath, [prismaCli, 'format', '--schema', schemaPath], {
  cwd: backendRoot,
  encoding: 'utf8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status || 1);

const formatted = fs.readFileSync(schemaPath, 'utf8');
if (formatted !== original) {
  // O comando do Prisma escreve o arquivo; restaure-o para que uma verificação
  // nunca altere silenciosamente o workspace/CI.
  fs.writeFileSync(schemaPath, original);
  console.error('prisma/schema.prisma não está formatado. Execute: npx prisma format');
  process.exit(1);
}

console.log('Formato do schema Prisma verificado.');
