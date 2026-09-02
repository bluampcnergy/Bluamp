
import React from 'react';
import { XIcon } from './icons/XIcon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  persistent?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md', persistent = false }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 bg-[#0D0D0D]/60 backdrop-blur-sm z-[150] flex justify-center items-end sm:items-center p-0 sm:p-4 transition-all duration-300" onClick={() => !persistent && onClose()}>
      <div
        className={`bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] relative w-full ${sizeClasses[size]} max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-fade-in-scale`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 sm:px-8 sm:py-6 bg-[#F9FAFB] border-b border-slate-100 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-[#0D0D0D] tracking-tight font-brand truncate pr-2">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-[#0D0D0D] hover:bg-slate-200 transition-all rounded-full p-2 shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Close modal"
          >
            <XIcon />
          </button>
        </div>
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 scrollbar-hide">
          {children}
        </div>
      </div>
       <style>{`
        @keyframes fade-in-scale {
          from { opacity: 0; transform: scale(0.97) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fade-in-scale {
          animation: fade-in-scale 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default Modal;
