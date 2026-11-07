import { describe, expect, it } from 'vitest';
import { PowerResumePolicy } from './power-resume-policy';

describe('PowerResumePolicy', () => {
  it('restarts replay after unlock when it was running before the lock', () => {
    const policy = new PowerResumePolicy();
    expect(policy.onSuspendOrLock('buffering')).toBe(true);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(true);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(false);
    expect(policy.onSettled(false)).toBe(true);
    expect(policy.onSettled(false)).toBe(false);
  });

  it('keeps the restart owed when the PC is locked again during the settle delay', () => {
    const policy = new PowerResumePolicy();
    policy.onSuspendOrLock('buffering');
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(true);
    // Win+L within two seconds: the engine is still idle, so nothing stops.
    expect(policy.onSuspendOrLock('idle')).toBe(false);
    expect(policy.onSettled(false)).toBe(false);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(true);
    expect(policy.onSettled(false)).toBe(true);
  });

  it('waits for unlock when the screen locked before the delay ended without an event', () => {
    const policy = new PowerResumePolicy();
    policy.onSuspendOrLock('buffering');
    policy.onResumeOrUnlock('resume', false);
    expect(policy.onSettled(true)).toBe(false);
    expect(policy.onResumeOrUnlock('unlock-screen', false)).toBe(true);
    expect(policy.onSettled(false)).toBe(true);
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
