import { expect, it } from 'vitest';
import { createDefaultSettings } from '../shared/settings';
import { mergeSettingsDraft } from './settings-draft';

it('preserves unsaved video settings when a folder is selected immediately', () => {
  const previous = createDefaultSettings('C:/Clips');
  const draft = { ...previous, fps: 30 as const, videoBitrateMbps: 20 };
  expect(mergeSettingsDraft(draft, previous, { ...previous, outputFolder: 'D:/Clips' })).toMatchObject({ fps: 30, videoBitrateMbps: 20, outputFolder: 'D:/Clips' });
});
