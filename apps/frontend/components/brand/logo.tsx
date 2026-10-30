import React from 'react';

interface BrandLogoProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly withText?: boolean;
  readonly className?: string;
}

export function BrandLogo({ size = 'md', withText = true, className = '' }: BrandLogoProps) {
  const iconSizes = {
    sm: 'h-7 w-7',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const textSizes = {
    sm: 'text-[15px]',
    md: 'text-[17px]',
    lg: 'text-xl',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* CodingTime Emblem Icon */}
      <div className={`relative shrink-0 overflow-hidden rounded-lg shadow-sm ${iconSizes[size]}`}>
        <svg
          className="h-full w-full"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="brandBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0B0F19" />
              <stop offset="100%" stopColor="#0F172A" />
            </linearGradient>
            <linearGradient id="brandTimeArc" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="50%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
            <linearGradient id="brandBracketL" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient id="brandBracketR" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C7D2FE" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
            <linearGradient id="brandSlash" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="50%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
          </defs>

          {/* Background */}
          <rect width="512" height="512" rx="112" fill="url(#brandBgGrad)" />

          {/* Outer Time Arc */}
          <path
            d="M 256 84 A 172 172 0 1 1 118 358"
            stroke="url(#brandTimeArc)"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <circle cx="118" cy="358" r="14" fill="#22D3EE" />
          <circle cx="118" cy="358" r="6" fill="#FFFFFF" />

          {/* Left Bracket */}
          <path
            d="M 192 188 L 132 256 L 192 324"
            stroke="url(#brandBracketL)"
            strokeWidth="36"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Right Bracket */}
          <path
            d="M 320 188 L 380 256 L 320 324"
            stroke="url(#brandBracketR)"
            strokeWidth="36"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Center Slash (Clock Hand) */}
          <path
            d="M 226 338 L 286 174"
            stroke="url(#brandSlash)"
            strokeWidth="34"
            strokeLinecap="round"
          />
          <circle cx="256" cy="256" r="9" fill="#38BDF8" />
          <circle cx="256" cy="256" r="4" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Brand Text */}
      {withText ? (
        <span className={`font-bold tracking-tight text-foreground ${textSizes[size]}`}>
          Coding<span className="text-primary font-black">Time</span>
        </span>
      ) : null}
    </div>
  );
}
