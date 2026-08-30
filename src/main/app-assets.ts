import path from 'node:path';

export function resolveAppAssetPath(
  assetRoot: string,
  requestPath: string,
): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0')) return null;

  const normalizedRequest = decodedPath.replace(/\\/g, '/');
  const segments = normalizedRequest.split('/').filter(Boolean);
  if (
    segments.some(
      (segment) =>
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    )
  ) {
    return null;
  }

  const root = path.resolve(assetRoot);
  const relativeRequest = segments.length === 0 ? 'index.html' : segments.join('/');
  const candidate = path.resolve(root, relativeRequest);
  const relativeCandidate = path.relative(root, candidate);

  if (
    relativeCandidate === '..' ||
    relativeCandidate.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCandidate)
  ) {
    return null;
  }

  return candidate;
}
