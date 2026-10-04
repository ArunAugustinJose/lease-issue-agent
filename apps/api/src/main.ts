import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
let root = resolve(__dirname);
while (
  !existsSync(resolve(root, 'package.json')) ||
  !(
    JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      workspaces?: string[];
    }
  ).workspaces
) {
  const parent = resolve(root, '..');
  if (parent === root) throw new Error('Workspace root not found.');
  root = parent;
}
config({ path: resolve(root, '.env') });
process.env.PROJECT_ROOT = root;
if (
  process.env.UPLOAD_DIR &&
  !process.env.UPLOAD_DIR.startsWith('/') &&
  !/^[A-Z]:/i.test(process.env.UPLOAD_DIR)
)
  process.env.UPLOAD_DIR = resolve(root, process.env.UPLOAD_DIR);
import { createApp } from './app';
createApp()
  .then((app) => app.listen(Number(process.env.API_PORT ?? 4000), '127.0.0.1'))
  .catch((error) => {
    console.error('API failed to start:', error);
    process.exitCode = 1;
  });
