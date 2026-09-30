
import React from 'react';

export const MergeIcon: React.FC<{ className?: string, size?: number }> = ({ className = "h-5 w-5", size = 20 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m8 6 4-4 4 4" />
    <path d="M12 2v10.3" />
    <path d="m19 11-7.5 7.5-7.5-7.5" />
    <path d="m5 18 7 4 7-4" />
  </svg>
);
