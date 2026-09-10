import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = path.resolve(root, 'dist-electron');
if (path.relative(root, target) !== 'dist-electron') throw new Error('Invalid build output directory');
await rm(target, { recursive: true, force: true });
