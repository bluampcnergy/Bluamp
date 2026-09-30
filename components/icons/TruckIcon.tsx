
import React from 'react';

export const TruckIcon: React.FC<{ className?: string; size?: number | string }> = ({ className = "h-5 w-5", size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0a2 2 0 110-4 2 2 0 010 4zm0 0h13.28a1 1 0 00.966-.741l2.352-8.317a1 1 0 00-.966-1.242H4.28a1 1 0 00-.966 1.242l2.352 8.317A1 1 0 006.647 13H9m9-4h.01" />
    </svg>
);