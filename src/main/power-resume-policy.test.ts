import { describe, expect, it } from 'vitest';
import { PowerResumePolicy } from './power-resume-policy';

describe('PowerResumePolicy', () => {
  it('restarts replay after unlock when it was running before the lock', () => {
    const policy = new PowerResumePolicy();
    expect(policy.onSuspendOrLock('buffering')).toBe(true);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(true);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(false);
  });

  it('remembers capture across lock followed by sleep and waits for unlock', () => {
    const policy = new PowerResumePolicy();
    policy.onSuspendOrLock('recording');
    expect(policy.onSuspendOrLock('idle')).toBe(false);
    expect(policy.onResumeOrUnlock('resume', true)).toBe(false);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(true);
  });

  it('does not start capture the user had turned off', () => {
    const policy = new PowerResumePolicy();
    policy.onSuspendOrLock('idle');
    expect(policy.onResumeOrUnlock('resume', false)).toBe(false);
    policy.onSuspendOrLock('buffering');
    policy.cancel();
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(false);
  });
});
