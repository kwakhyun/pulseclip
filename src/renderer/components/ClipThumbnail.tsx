import { useEffect, useRef, useState } from 'react';

/**
 * Attach media only while its card is visible; keep large libraries cheap to open.
 * A media fragment seeks past the first frame, which is often black or a fade.
 */
export function ClipThumbnail({ url, durationMs = 0 }: { url: string; durationMs?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { rootMargin: '150px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <video ref={ref} src={visible ? thumbnailSource(url, durationMs) : undefined} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
}

export function thumbnailSource(url: string, durationMs: number): string {
  const seconds = durationMs > 0 ? Math.min(1.5, (durationMs / 1000) * 0.25) : 0;
  return seconds >= 0.1 ? `${url}#t=${seconds.toFixed(1)}` : url;
}
