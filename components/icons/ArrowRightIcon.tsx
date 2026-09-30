import React from 'react';

export const ArrowRightIcon: React.FC<{ className?: string; size?: number | string }> = ({ className = "h-4 w-4 ml-1", size }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={className} 
    width={size} 
    height={size} 
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor" 
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
  </svg>
);