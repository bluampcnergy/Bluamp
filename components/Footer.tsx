import React, { useState } from 'react';
import type { ReceivedGood, FinishedGood, View } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import Modal from './Modal';

interface FooterProps {
  receivedGoods: ReceivedGood[];
  finishedGoods: FinishedGood[];
  setView?: (view: View) => void;
}

const Footer: React.FC<FooterProps> = ({ receivedGoods, finishedGoods, setView }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeLegalModal, setActiveLegalModal] = useState<string | null>(null);

  const handleNav = (targetView: View) => {
    if (setView) {
      setView(targetView);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* FLOATING ACTION PILL (Quick Global Master Data Search) */}
      <aside aria-label="Quick Actions" className="fixed bottom-16 md:bottom-6 right-6 z-50 pointer-events-none">
        <div className="pointer-events-auto">
          <button 
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 bg-[#205f64] hover:bg-[#498e72] text-white px-5 py-2.5 rounded-full transition-all font-black uppercase tracking-widest text-xs shadow-2xl border-2 border-[#75c081]/40 active:scale-95 group font-brand"
            title="Search Master Inventory & Traceability Database"
          >
            <SearchIcon className="w-4 h-4 group-hover:scale-110 transition-transform text-[#75c081]" />
            <span>Master Data Search</span>
          </button>
        </div>
      </aside>

      {/* MASTER DATA SEARCH MODAL */}
      <Modal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} title="Master Data Search" size="xl">
        <div className="w-full h-[600px] overflow-hidden rounded-lg border border-[#2ca4c2]/30">
          <iframe 
            src={`${window.location.pathname}?mode=master_search`} 
            width="100%" 
            height="100%" 
            className="w-full h-full border-none"
            title="Master Data Search"
          />
        </div>
      </Modal>

      {/* COMPREHENSIVE BRAND RESKIN FOOTER */}
      <footer className="bg-[#205f64] text-white border-t border-[#2ca4c2]/30 mt-16 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            
            {/* COLUMN 1: BRAND & MISSION */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src="https://bluampenergy.com/wp-content/uploads/2018/07/logo-white-001.png"
                  alt="Bluamp Logo"
                  className="h-10 w-auto object-contain rounded-md p-0.5 bg-white/5 border border-[#2ca4c2]/30"
                />
                <div className="flex flex-col justify-center">
                  <span className="text-xl font-extrabold text-white leading-none tracking-tight font-brand bluamp-logo-text">Bluamp</span>
                  <span className="text-[10px] text-[#75c081] font-black tracking-widest uppercase mt-0.5">Plant OS</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Next-generation Clean Energy & Battery Pack Manufacturing OS. Engineered for high-precision batch tracking, QA cell grading, automated invoice generation, and intelligent supply chain operations.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1b4b4f] border border-[#2ca4c2]/30 text-[11px] text-[#75c081] font-bold">
                <span className="h-2 w-2 rounded-full bg-[#75c081] animate-pulse"></span>
                <span>Plant Node Active: Online</span>
              </div>
            </div>

            {/* COLUMN 2: OPERATIONS & INVENTORY */}
            <div>
              <h3 className="font-brand font-bold text-xs text-[#75c081] uppercase tracking-wider mb-4 border-b border-[#2ca4c2]/20 pb-2">
                Manufacturing & Ops
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li>
                  <button type="button" onClick={() => handleNav('received')} className="hover:text-white hover:underline transition">
                    Raw Materials (Inward QC)
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('testing')} className="hover:text-white hover:underline transition">
                    Cell Testing & Grading
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('wip')} className="hover:text-white hover:underline transition">
                    WIP Battery Assembly
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('dtf')} className="hover:text-white hover:underline transition">
                    Direct-To-Finished (DTF)
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finished')} className="hover:text-white hover:underline transition">
                    Finished Goods Depot
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('storage')} className="hover:text-white hover:underline transition">
                    Storage Rack Locator
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('supplies')} className="hover:text-white hover:underline transition">
                    Procurement & Supplies
                  </button>
                </li>
              </ul>
            </div>

            {/* COLUMN 3: FINANCE & ADMINISTRATION */}
            <div>
              <h3 className="font-brand font-bold text-xs text-[#75c081] uppercase tracking-wider mb-4 border-b border-[#2ca4c2]/20 pb-2">
                Finance & Intelligence
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li>
                  <button type="button" onClick={() => handleNav('finance_maker')} className="hover:text-white hover:underline transition">
                    Tax Invoice Maker & Dispatch
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finance_dashboard')} className="hover:text-white hover:underline transition">
                    Executive Financial Summary
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finance_ledger')} className="hover:text-white hover:underline transition">
                    Accounts & Vendor Ledger
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finance_costing')} className="hover:text-white hover:underline transition">
                    BOM SKU Cost Calculator
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('employee_tasks')} className="hover:text-white hover:underline transition">
                    Employee Task Dispatcher
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('ai_assistant')} className="hover:text-white hover:underline transition">
                    Plant AI Assistant & Analytics
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('master')} className="hover:text-white hover:underline transition">
                    Master Serial Traceability
                  </button>
                </li>
              </ul>
            </div>

            {/* COLUMN 4: CORPORATE & CONTACT */}
            <div>
              <h3 className="font-brand font-bold text-xs text-[#75c081] uppercase tracking-wider mb-4 border-b border-[#2ca4c2]/20 pb-2">
                Corporate & Support
              </h3>
              <div className="space-y-3 text-xs text-slate-300">
                <div>
                  <div className="font-semibold text-white">Bluamp Energies Pvt. Ltd.</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">High Performance Clean Energy & Storage</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[#75c081]">✉️</span>
                    <a href="mailto:support@blueamp.cnergy.co.in" className="hover:text-[#75c081] transition underline">
                      support@blueamp.cnergy.co.in
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#75c081]">🌐</span>
                    <a href="https://bluampenergy.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#75c081] transition underline">
                      bluampenergy.com ↗
                    </a>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleNav('help')}
                    className="w-full text-center px-3 py-2 bg-[#1b4b4f] hover:bg-[#498e72] text-[#75c081] hover:text-white border border-[#2ca4c2]/30 rounded-lg font-bold text-xs transition"
                  >
                    📖 Open User Guide & Manual
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* BOTTOM LEGAL BAR & SOCIALS */}
          <div className="border-t border-[#2ca4c2]/30 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-300">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
              <span>© {new Date().getFullYear()} Bluamp Energies Pvt. Ltd. All rights reserved.</span>
              <span className="hidden sm:inline text-slate-500">•</span>
              <span className="text-[#75c081] font-medium">ISO-Certified Battery Pack Production OS</span>
            </div>

            {/* LEGAL LINKS & SOCIAL ICONS */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('privacy')}
                  className="hover:text-white hover:underline transition"
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('terms')}
                  className="hover:text-white hover:underline transition"
                >
                  Terms of Service
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('security')}
                  className="hover:text-white hover:underline transition"
                >
                  Security
                </button>
              </div>

              {/* SOCIAL ICONS */}
              <div className="flex items-center gap-3 border-l border-[#2ca4c2]/30 pl-4">
                {/* LinkedIn */}
                <a
                  href="https://linkedin.com/company/bluampenergy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-[#498e72] hover:text-white text-slate-300 transition"
                  title="LinkedIn"
                  aria-label="LinkedIn"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.68 1.68 0 1 0-.02-3.36 1.68 1.68 0 0 0 .02 3.36m1.4 9.74v-8.37H5.06v8.37h2.8z" />
                  </svg>
                </a>

                {/* Twitter / X */}
                <a
                  href="https://x.com/bluampenergy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-[#498e72] hover:text-white text-slate-300 transition"
                  title="Twitter / X"
                  aria-label="Twitter / X"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                {/* Website */}
                <a
                  href="https://bluampenergy.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-[#498e72] hover:text-white text-slate-300 transition"
                  title="Bluamp Energy Official Website"
                  aria-label="Bluamp Energy Official Website"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* LEGAL DISCLOSURE MODAL */}
      <Modal 
        isOpen={Boolean(activeLegalModal)} 
        onClose={() => setActiveLegalModal(null)} 
        title={
          activeLegalModal === 'privacy' ? 'Bluamp Privacy Policy' :
          activeLegalModal === 'terms' ? 'Bluamp Terms of Service' : 'Bluamp Security & Compliance'
        }
      >
        <div className="p-4 space-y-3 text-xs text-[#1E293B] leading-relaxed">
          <p className="font-bold text-sm text-[#205f64]">
            {activeLegalModal === 'privacy' && 'Enterprise Data Protection & Privacy'}
            {activeLegalModal === 'terms' && 'Plant Operating Terms & Conditions'}
            {activeLegalModal === 'security' && 'ISO-Compliant Security Protocols'}
          </p>
          <p>
            Bluamp Energies Pvt. Ltd. strictly maintains high-grade operational security and confidentiality across all inward procurement documents, testing metrics, employee task logs, and manufacturing recipes.
          </p>
          <p>
            For compliance queries or audit verification, please contact our engineering governance officer at <a href="mailto:support@blueamp.cnergy.co.in" className="text-[#2ca4c2] font-semibold underline">support@blueamp.cnergy.co.in</a>.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default Footer;