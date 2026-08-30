import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const releaseDirectory = path.join(projectRoot, 'release');
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
);
const version = packageJson.version;
const installerNames = [
  `PulseClip-${version}-Setup.exe`,
  `PulseClip-${version}-x64-Setup.exe`,
  `PulseClip-${version}-arm64-Setup.exe`,
];

for (const fileName of installerNames) {
  const details = await stat(path.join(releaseDirectory, fileName));
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Release installer is missing or empty: ${fileName}`);
  }
}

const checksumLines = [];
for (const fileName of installerNames) {
  const bytes = await readFile(path.join(releaseDirectory, fileName));
  const checksum = createHash('sha256').update(bytes).digest('hex');
  checksumLines.push(`${checksum}  ${fileName}`);
}
await writeFile(
  path.join(releaseDirectory, 'SHA256SUMS.txt'),
  `${checksumLines.join('\n')}\n`,
  'utf8',
);

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('npm_execpath is unavailable; run this script through npm.');
}
const sbom = execFileSync(
  process.execPath,
  [npmCli, 'sbom', '--omit=dev', '--sbom-format=cyclonedx'],
  { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);
const parsed = JSON.parse(sbom);
if (parsed.bomFormat !== 'CycloneDX') {
  throw new Error('npm produced an unexpected SBOM format.');
}
parsed.metadata.component.name = 'PulseClip';
parsed.metadata.component.type = 'application';
parsed.metadata.component.version = version;
await writeFile(
  path.join(releaseDirectory, `pulseclip-v${version}-sbom.cdx.json`),
  `${JSON.stringify(parsed, null, 2)}\n`,
  'utf8',
);

console.log(`Prepared checksums and CycloneDX SBOM for PulseClip v${version}.`);
