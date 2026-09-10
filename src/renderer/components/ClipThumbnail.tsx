import { useEffect, useRef, useState } from 'react';

/** Attach media only while its card is visible; keep large libraries cheap to open. */
export function ClipThumbnail({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { rootMargin: '150px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <video ref={ref} src={visible ? url : undefined} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
}
