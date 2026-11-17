import React from 'react';

interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  title?: string;
}

const SIZE_MAP = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
};

/**
 * Authentic Meta (Instagram & Facebook) Verified Badge
 * Iconic 16-point scalloped rosette with crisp white checkmark
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 'sm',
  className = '',
  title = 'Verified Profile',
}) => {
  return (
    <span title={title} className={`inline-flex items-center justify-center shrink-0 ${SIZE_MAP[size]} ${className}`}>
      <svg
        viewBox="0 0 24 24"
        aria-label={title}
        className="w-full h-full select-none transition-transform hover:scale-110"
      >
        {/* Meta Blue 16-lobed Scalloped Rosette */}
        <path
          fill="#0095F6"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M19.965 8.521C19.988 8.347 20 8.173 20 8c0-2.379-2.143-4.288-4.521-3.965C14.786 2.802 13.466 2 12 2s-2.786.802-3.479 2.035C6.143 3.712 4 5.621 4 8c0 .173.012.347.035.521C2.802 9.214 2 10.534 2 12s.802 2.786 2.035 3.479C4.012 15.653 4 15.827 4 16c0 2.379 2.143 4.288 4.521 3.965C9.214 21.198 10.534 22 12 22s2.786-.802 3.479-2.035C17.857 20.288 20 18.379 20 16c0-.173-.012-.347-.035-.521C21.198 14.786 22 13.466 22 12s-.802-2.786-2.035-3.479z"
        />
        {/* Center White Tick */}
        <path
          d="M10.15 16.2L6.15 12.2L7.56 10.79L10.15 13.38L16.44 7.09L17.85 8.5L10.15 16.2Z"
          fill="#FFFFFF"
        />
      </svg>
    </span>
  );
};
