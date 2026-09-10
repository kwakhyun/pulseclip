import type { UpdateInfo } from '../shared/types';

export const RELEASE_PAGE = 'https://github.com/kwakhyun/pulseclip/releases/latest';
const RELEASE_API = 'https://api.github.com/repos/kwakhyun/pulseclip/releases/latest';

export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const next = parse(candidate);
  const installed = parse(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

export class UpdateService {
  private pending: Promise<UpdateInfo> | null = null;
  private cached: { time: number; result: UpdateInfo } | null = null;

  check(currentVersion: string): Promise<UpdateInfo> {
    if (this.cached && Date.now() - this.cached.time < 300_000) return Promise.resolve(this.cached.result);
    if (this.pending) return this.pending;
    this.pending = this.fetchRelease(currentVersion).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async fetchRelease(currentVersion: string): Promise<UpdateInfo> {
    const response = await fetch(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PulseClip' },
      signal: AbortSignal.timeout(8_000), redirect: 'error',
    });
    if (!response.ok) throw new Error('업데이트 정보를 가져오지 못했습니다. 잠시 후 다시 확인해 주세요.');
    const release = await response.json() as Record<string, unknown>;
    if (typeof release.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name) ||
        release.draft === true || release.prerelease === true) {
      throw new Error('공식 안정 버전 정보를 확인할 수 없습니다.');
    }
    const result: UpdateInfo = {
      currentVersion,
      latestVersion: release.tag_name.replace(/^v/, ''),
      available: isNewerVersion(release.tag_name, currentVersion),
      publishedAt: typeof release.published_at === 'string' ? release.published_at : '',
      releaseUrl: RELEASE_PAGE,
    };
    this.cached = { time: Date.now(), result };
    return result;
  }
}
