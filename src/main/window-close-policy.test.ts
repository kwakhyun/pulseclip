import { describe, expect, it } from 'vitest';
import { decideWindowCloseAction } from './window-close-policy';

describe('decideWindowCloseAction', () => {
  it('hides an active app when minimize-to-tray is enabled', () => {
    expect(decideWindowCloseAction(false, true)).toBe('hide');
  });

  it('starts graceful shutdown instead of orphaning the tray when disabled', () => {
    expect(decideWindowCloseAction(false, false)).toBe('quit');
  });

  it('allows the window to close after shutdown has started', () => {
    expect(decideWindowCloseAction(true, true)).toBe('allow');
    expect(decideWindowCloseAction(true, false)).toBe('allow');
  });
});
