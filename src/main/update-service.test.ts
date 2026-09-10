import { afterEach, expect, it, vi } from 'vitest';
import { isNewerVersion, RELEASE_PAGE, UpdateService } from './update-service';

afterEach(() => vi.unstubAllGlobals());
it('compares numeric stable versions without downgrades', () => {
  expect(isNewerVersion('v0.1.10', '0.1.9')).toBe(true);
  expect(isNewerVersion('v0.1.3', '0.1.4')).toBe(false);
  expect(isNewerVersion('v0.1.4-beta', '0.1.3')).toBe(false);
});
it('coalesces network requests and never trusts a release-provided download URL', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v0.2.0', html_url: 'https://untrusted.example', published_at: '2026-09-10' }) });
  vi.stubGlobal('fetch', fetcher);
  const service = new UpdateService();
  const result = await Promise.all([service.check('0.1.4'), service.check('0.1.4')]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result[0]).toMatchObject({ available: true, releaseUrl: RELEASE_PAGE });
  await service.check('0.1.4');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
