
import React from 'react';

export const XIcon: React.FC<{ className?: string; size?: number | string }> = ({ className = "h-6 w-6", size }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);