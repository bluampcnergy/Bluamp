
import React from 'react';

export const PlusIcon: React.FC<{ className?: string; size?: number | string }> = ({ className = "h-5 w-5", size }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);