import { readFile, readdir } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const forbidden = [
  '__PULSECLIP_DEV_CONNECT_SRC__',
  'http://localhost:5173',
  'ws://localhost:5173',
];

for (const value of forbidden) {
  if (html.includes(value)) {
    throw new Error(`Production desktop bundle contains a development CSP value: ${value}`);
  }
}

if (!html.includes("connect-src 'self';")) {
  throw new Error('Production desktop bundle is missing the restricted connect-src policy.');
}

if (!html.includes("script-src 'self'; worker-src 'self' blob:;")) {
  throw new Error('Media workers need blob worker-src while script-src must remain restricted.');
}

const mainFiles = await readdir(new URL('../dist-electron/', import.meta.url), { recursive: true });
if (mainFiles.some(name => /\.test\.js(?:\.map)?$/.test(name))) {
  throw new Error('Desktop build contains stale test output. Rebuild the main process before packaging.');
}
