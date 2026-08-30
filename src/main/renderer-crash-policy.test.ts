import { describe, expect, it } from 'vitest';
import { RendererCrashPolicy } from './renderer-crash-policy';

describe('RendererCrashPolicy', () => {
  it('reloads a limited number of times and then stops a crash loop', () => {
    const policy = new RendererCrashPolicy(3, 60_000);

    expect(policy.register(1_000)).toBe('reload');
    expect(policy.register(2_000)).toBe('reload');
    expect(policy.register(3_000)).toBe('reload');
    expect(policy.register(4_000)).toBe('stop');
  });

  it('allows recovery again after the crash window has elapsed', () => {
    const policy = new RendererCrashPolicy(1, 60_000);

    expect(policy.register(1_000)).toBe('reload');
    expect(policy.register(2_000)).toBe('stop');
    expect(policy.register(62_000)).toBe('reload');
  });
});
