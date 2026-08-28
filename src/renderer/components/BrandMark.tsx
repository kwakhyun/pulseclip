import pulseClipIcon from '../assets/pulseclip-icon.png';

interface BrandMarkProps {
  className: 'brand-mark' | 'splash-mark' | 'onboarding-logo';
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={className} aria-hidden="true">
      <img src={pulseClipIcon} alt="" draggable={false} />
    </span>
  );
}
