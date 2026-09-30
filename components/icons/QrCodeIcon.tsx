
import React from 'react';

export const QrCodeIcon: React.FC<{ className?: string; size?: number | string }> = ({ className = "h-6 w-6", size }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6.5 6.5v-1.5m-5 1.5v-1.5m12-9.5V10M12 15v2m-6-1h.01M6 12h.01M6 9h.01M6 6h.01M6 15h.01M9 15h.01M12 15h.01M15 15h.01M18 15h.01M18 12h.01M18 9h.01M18 6h.01M9 6h6v6H9V6z" />
  </svg>
);