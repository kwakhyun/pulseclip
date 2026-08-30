import path from 'node:path';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';

const executablePath = path.resolve(
  process.argv[2] ?? path.join('release', 'win-unpacked', 'PulseClip.exe'),
);

const expectedFuses = new Map([
  [FuseV1Options.RunAsNode, false],
  [FuseV1Options.EnableCookieEncryption, true],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [FuseV1Options.EnableNodeCliInspectArguments, false],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
  [FuseV1Options.OnlyLoadAppFromAsar, true],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, false],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, false],
]);

const fuseWire = await getCurrentFuseWire(executablePath);
const enabledState = '1'.charCodeAt(0);
const disabledState = '0'.charCodeAt(0);
const mismatches = [];

for (const [option, expectedEnabled] of expectedFuses) {
  const expectedState = expectedEnabled ? enabledState : disabledState;
  const actualState = fuseWire[option];
  if (actualState !== expectedState) {
    mismatches.push(
      `${FuseV1Options[option]}: expected ${expectedEnabled ? 'enabled' : 'disabled'}, got ${actualState}`,
    );
  }
}

if (mismatches.length > 0) {
  throw new Error(`Electron fuse verification failed:\n${mismatches.join('\n')}`);
}

console.log(`Verified ${expectedFuses.size} Electron security fuses in ${executablePath}`);
