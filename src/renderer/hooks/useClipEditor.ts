import { useRef, useState } from 'react';
import type { Clip } from '../../shared/types';

export function useClipEditor(onSaved: (clip: Clip) => Promise<void>, onError: (error: unknown) => void) {
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<void> | null>(null);
  const start = (clip: Clip, from: number, to: number) => {
    if (controller.current) return;
    const abortController = new AbortController();
    controller.current = abortController;
    setEditing(true);
    setProgress(0);
    task.current = (async () => {
      try {
        const { trimClip } = await import('../capture/trim-clip');
        const saved = await trimClip(clip, from, to, abortController.signal, setProgress);
        await onSaved(saved);
      } catch (error) {
        if (!abortController.signal.aborted) onError(error);
      } finally {
        controller.current = null;
        setEditing(false);
      }
    })();
  };
  const cancel = async () => {
    controller.current?.abort();
    await task.current;
  };
  return { editing, progress, start, cancel };
}
