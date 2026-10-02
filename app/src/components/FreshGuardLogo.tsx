import React, { useId } from 'react';

interface FreshGuardLogoProps {
  size?: number | string;
  className?: string;
  showText?: boolean;
  tagline?: string;
  variant?: 'squircle' | 'plain';
}

export const FreshGuardLogo: React.FC<FreshGuardLogoProps> = ({
  size = 40,
  className = '',
  showText = false,
  tagline = 'Botanical Precision Storage',
  variant = 'squircle',
}) => {
  const uid = useId().replace(/:/g, '');
  const bgGradId = `fg-bg-${uid}`;
  const rimGradId = `fg-rim-${uid}`;
  const leafGradId = `fg-leaf-${uid}`;
  const amberGradId = `fg-amber-${uid}`;
  const coreGradId = `fg-core-${uid}`;
  const shadowId = `fg-sh-${uid}`;

  const iconSvg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 ${className}`}
      aria-label="FreshGuard Logo"
    >
      <defs>
        {/* Background Dark Forest Squircle Gradient */}
        <linearGradient id={bgGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#183f27" />
          <stop offset="60%" stopColor="#0f291a" />
          <stop offset="100%" stopColor="#08180f" />
        </linearGradient>

        {/* Ambient Rim Highlight */}
        <linearGradient id={rimGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#22c55e" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.55" />
        </linearGradient>

        {/* Emerald Botanical Freshness Leaf Gradient */}
        <linearGradient id={leafGradId} x1="20%" y1="15%" x2="50%" y2="85%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="35%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>

        {/* Terracotta / Amber Ethylene Absorption Wing */}
        <linearGradient id={amberGradId} x1="40%" y1="20%" x2="80%" y2="80%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="30%" stopColor="#fb923c" />
          <stop offset="80%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#c2410c" />
        </linearGradient>

        {/* Central Pure Sparkle Sprout */}
        <linearGradient id={coreGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d1fae5" />
        </linearGradient>

        {/* Drop shadow */}
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      {variant === 'squircle' && (
        <>
          {/* Squircle base */}
          <rect width="100" height="100" rx="26" fill={`url(#${bgGradId})`} />
          {/* Outer glowing rim */}
          <rect
            x="1"
            y="1"
            width="98"
            height="98"
            rx="25"
            stroke={`url(#${rimGradId})`}
            strokeWidth="2"
            fill="none"
          />
          {/* Subtle shield watermark glow */}
          <path
            d="M50 16L74 25V46C74 62 63.5 73.5 50 80C36.5 73.5 26 62 26 46V25L50 16Z"
            fill="rgba(16, 185, 129, 0.08)"
            stroke="rgba(74, 222, 128, 0.2)"
            strokeWidth="1.5"
          />
        </>
      )}

      {/* Left Botanical Leaf Wing */}
      <path
        d="M50 20C32 26 27 38 27 50C27 63 38 72 50 77C38 69 35 58 36 47C37 36 43 27 50 20Z"
        fill={`url(#${leafGradId})`}
        filter={`url(#${shadowId})`}
      />

      {/* Right Ethylene Trap Arc (Amber Wing) */}
      <path
        d="M50 20C65 26 71 37 71 50C71 63 60 72 50 77C60 69 63 58 62 47C61 36 56 27 50 20Z"
        fill={`url(#${amberGradId})`}
        filter={`url(#${shadowId})`}
      />

      {/* Central Sprout Core */}
      <path
        d="M50 31C44 40 44 48 50 56C56 48 56 40 50 31Z"
        fill={`url(#${coreGradId})`}
        filter={`url(#${shadowId})`}
      />

      {/* Precision Telemetry Pulse Dots */}
      <circle cx="50" cy="44" r="3.2" fill="#10b981" />
      <circle cx="50" cy="27" r="2.2" fill="#ffffff" />
    </svg>
  );

  if (!showText) {
    return iconSvg;
  }

  return (
    <div className="flex items-center gap-3">
      {iconSvg}
      <div>
        <p className="font-extrabold text-base leading-tight text-[#1e241c] tracking-tight">
          FreshGuard
        </p>
        {tagline && (
          <p className="text-[11px] text-[#596155] font-medium leading-tight">{tagline}</p>
        )}
      </div>
    </div>
  );
};

export default FreshGuardLogo;
