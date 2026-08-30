export type WindowCloseAction = 'allow' | 'hide' | 'quit';

export function decideWindowCloseAction(
  isQuitting: boolean,
  minimizeToTray: boolean,
): WindowCloseAction {
  if (isQuitting) return 'allow';
  return minimizeToTray ? 'hide' : 'quit';
}
