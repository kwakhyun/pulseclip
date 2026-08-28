import { describe, expect, it } from 'vitest';
import { overallStatus } from './diagnostics';

describe('diagnostic report status', () => {
  it('uses the most severe check status', () => {
    expect(overallStatus([{ status: 'pass' }, { status: 'warning' }])).toBe('warning');
    expect(overallStatus([{ status: 'warning' }, { status: 'fail' }])).toBe('fail');
    expect(overallStatus([{ status: 'pass' }])).toBe('pass');
  });
});
