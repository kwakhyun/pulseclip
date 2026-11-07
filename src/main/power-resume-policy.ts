export type PowerEvent = 'suspend' | 'lock-screen' | 'resume' | 'unlock-screen';
export type CapturePhase = 'idle' | 'starting' | 'recovering' | 'buffering' | 'recording' | 'saving' | 'error';

/**
 * Capture stops while the PC sleeps or the screen is locked, because Windows
 * hides the desktop and may revoke the capture source. This policy remembers
 * whether replay was running and restarts it once the user is back, so F8 keeps
 * working without a trip to the PulseClip window.
 */
export class PowerResumePolicy {
  private resumePending = false;

  /** Returns true when capture should stop for this event. */
  onSuspendOrLock(phase: CapturePhase): boolean {
    const active = phase !== 'idle' && phase !== 'error';
    // Lock and then sleep arrive as two events; the second one sees an idle
    // engine and must not forget that the first one interrupted capture.
    this.resumePending ||= active;
    return active;
  }

  /** Returns true when capture should restart now. */
  onResumeOrUnlock(event: 'resume' | 'unlock-screen', screenLocked: boolean): boolean {
    if (!this.resumePending) return false;
    // Waking from sleep usually lands on the lock screen. Wait for unlock so
    // replay does not restart against the secure desktop.
    if (event === 'resume' && screenLocked) return false;
    this.resumePending = false;
    return true;
  }

  cancel(): void {
    this.resumePending = false;
  }
}
