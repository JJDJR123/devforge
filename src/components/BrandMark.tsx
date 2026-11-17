import { cn } from '../utils';

export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('brand-mark', className)}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="DEVFORGE"
    >
      <defs>
        <linearGradient id="df-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#18241a" />
          <stop offset="1" stopColor="#0c110d" />
        </linearGradient>
        <filter id="df-mark-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="15" fill="url(#df-mark-bg)" stroke="rgba(200,247,106,.24)" />
      <g opacity=".2" stroke="rgba(200,247,106,.5)" strokeWidth=".6">
        <path d="M12 24h40M12 40h40M24 12v40M40 12v40" />
      </g>
      <g fill="var(--accent)" filter="url(#df-mark-glow)">
        <rect x="15" y="15" width="8" height="8" rx="1" />
        <rect x="23" y="15" width="8" height="8" rx="1" />
        <rect x="31" y="15" width="8" height="8" rx="1" />
        <rect x="15" y="23" width="8" height="8" rx="1" />
        <rect x="39" y="23" width="8" height="8" rx="1" />
        <rect x="15" y="31" width="8" height="8" rx="1" />
        <rect x="39" y="31" width="8" height="8" rx="1" />
        <rect x="15" y="39" width="8" height="8" rx="1" />
        <rect x="23" y="39" width="8" height="8" rx="1" />
        <rect x="31" y="39" width="8" height="8" rx="1" />
      </g>
      <rect x="39" y="15" width="8" height="8" rx="1" fill="#5eead4" opacity=".9" />
      <rect x="47" y="47" width="5" height="5" rx="1" fill="#ff9d5c" opacity=".85" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('brand-lockup', compact && 'is-compact')}>
      <BrandMark size={compact ? 36 : 42} />
      <div className="brand-type">
        <span className="brand-name">DEVFORGE</span>
        {!compact ? <span className="brand-sub">独立游戏开发学习舱</span> : null}
      </div>
    </div>
  );
}
