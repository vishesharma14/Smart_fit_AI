import { useId } from 'react';
import './BrandLogo.css';

interface BrandLogoProps {
  className?: string;
}

/** SizerAI mark + wordmark. */
export function BrandLogo({ className }: BrandLogoProps) {
  const gradientId = useId();

  return (
    <span className={['brand-logo', className].filter(Boolean).join(' ')}>
      <svg className="brand-logo__mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-primary)" />
            <stop offset="1" stopColor="var(--color-secondary)" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="var(--color-bg-elevated)" />
        <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" fill="none" stroke="var(--color-border-strong)" />
        <path
          d="M42 22c-2-3-6-5-10-5-6 0-10 3-10 8 0 11 20 6 20 16 0 5-4 8-10 8-5 0-9-2-11-6"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-logo__name">
        Sizer<span className="brand-logo__accent">AI</span>
      </span>
    </span>
  );
}
