import type { AppSettings } from '../shared/types';

/** Preserve unsaved controls when an immediate setting, such as the folder, changes. */
export function mergeSettingsDraft(draft: AppSettings, previous: AppSettings, next: AppSettings): AppSettings {
  const result = { ...draft };
  for (const key of Object.keys(next) as (keyof AppSettings)[]) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      Object.assign(result, { [key]: next[key] });
    }
  }
  return result;
}
