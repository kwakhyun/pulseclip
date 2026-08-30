import path from 'node:path';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';

const executablePaths = (
  process.argv.length > 2
    ? process.argv.slice(2)
    : [path.join('release', 'win-unpacked', 'PulseClip.exe')]
).map((executablePath) => path.resolve(executablePath));

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

const enabledState = '1'.charCodeAt(0);
const disabledState = '0'.charCodeAt(0);

for (const executablePath of executablePaths) {
  const fuseWire = await getCurrentFuseWire(executablePath);
  const mismatches = [];
  const actualFuseCount = Object.keys(fuseWire).filter((key) => /^\d+$/.test(key)).length;

  if (actualFuseCount !== expectedFuses.size) {
    mismatches.push(
      `fuse count: expected ${expectedFuses.size}, got ${actualFuseCount}; review new or removed Electron fuses`,
    );
  }

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
    throw new Error(
      `Electron fuse verification failed for ${executablePath}:\n${mismatches.join('\n')}`,
    );
  }

  console.log(
    `Verified ${expectedFuses.size} Electron security fuses in ${executablePath}`,
  );
}
