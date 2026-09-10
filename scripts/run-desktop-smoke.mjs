import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'pulseclip-smoke-'));
try {
  const env = { ...process.env, PULSECLIP_SMOKE_DIRECTORY: temporary };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [path.join(root, 'node_modules/electron/cli.js'), 'scripts/desktop-smoke.cjs', ...process.argv.slice(2)], {
    cwd: root, env, stdio: 'inherit', windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const log = await readFile(path.join(temporary, 'logs', 'pulseclip.log'), 'utf8').catch(() => '');
  await mkdir(path.join(root, 'artifacts/verification'), { recursive: true });
  await writeFile(path.join(root, 'artifacts/verification/desktop-smoke.log'), log.replaceAll(temporary, '<isolated-test-data>'));
  process.exitCode = code === 0 ? 0 : 1;
} finally {
  // This exact directory was created above; never clean arbitrary user-supplied paths.
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
