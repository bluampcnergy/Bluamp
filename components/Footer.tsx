import React, { useState } from 'react';
import type { ReceivedGood, FinishedGood, View } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import Modal from './Modal';
import { getActiveBrand } from '../config/brandConfig';

interface FooterProps {
  receivedGoods: ReceivedGood[];
  finishedGoods: FinishedGood[];
  setView?: (view: View) => void;
}

const Footer: React.FC<FooterProps> = ({ receivedGoods, finishedGoods, setView }) => {
  const brand = getActiveBrand();
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
            style={{ backgroundColor: brand.theme.headerBg }}
            className="flex items-center gap-2 text-white px-5 py-2.5 rounded-full transition-all font-black uppercase tracking-widest text-xs shadow-2xl border-2 border-white/20 active:scale-95 group font-brand hover:opacity-90"
            title="Search Master Inventory & Traceability Database"
          >
            <SearchIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span>Master Data Search</span>
          </button>
        </div>
      </aside>

      {/* MASTER DATA SEARCH MODAL */}
      <Modal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} title="Master Data Search" size="xl">
        <div className="w-full h-[600px] overflow-hidden rounded-lg border border-slate-300">
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
      <footer style={{ backgroundColor: brand.theme.footerBg }} className="text-white border-t border-white/10 mt-16 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            
            {/* COLUMN 1: BRAND & MISSION */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src={brand.logoNavbarUrl}
                  alt={`${brand.companyName} Logo`}
                  className="h-10 w-auto object-contain rounded-md p-0.5 bg-white/5 border border-white/20"
                />
                <div className="flex flex-col justify-center">
                  <span className="text-xl font-extrabold text-white leading-none tracking-tight font-brand">{brand.companyName}</span>
                  <span style={{ color: brand.theme.secondary }} className="text-[10px] font-black tracking-widest uppercase mt-0.5">{brand.tagline}</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Next-generation Clean Energy & Battery Pack Manufacturing OS. Engineered for high-precision batch tracking, QA cell grading, automated invoice generation, and intelligent supply chain operations.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[11px] font-bold">
                <span style={{ backgroundColor: brand.theme.secondary }} className="h-2 w-2 rounded-full animate-pulse"></span>
                <span style={{ color: brand.theme.secondary }}>Plant Node Active: Online</span>
              </div>
            </div>

            {/* COLUMN 2: OPERATIONS & INVENTORY */}
            <div>
              <h3 style={{ color: brand.theme.secondary }} className="font-brand font-bold text-xs uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
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
                    Direct-To-Finished Goods
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finished')} className="hover:text-white hover:underline transition">
                    Finished Goods & Stock
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('storage')} className="hover:text-white hover:underline transition">
                    Warehouse Rack Map
                  </button>
                </li>
              </ul>
            </div>

            {/* COLUMN 3: FINANCIAL SUITE & CRM */}
            <div>
              <h3 style={{ color: brand.theme.secondary }} className="font-brand font-bold text-xs uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
                Finance & Intelligence
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li>
                  <button type="button" onClick={() => handleNav('finance_maker')} className="hover:text-white hover:underline transition">
                    GST Invoice & Quotation Maker
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finance_crm')} className="hover:text-white hover:underline transition">
                    Customer Pipeline (Sales CRM)
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finance_costing')} className="hover:text-white hover:underline transition">
                    BOM Pricing & Pack Costing
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleNav('finance_expenses')} className="hover:text-white hover:underline transition">
                    Expense Journal & Approvals
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
              <h3 style={{ color: brand.theme.secondary }} className="font-brand font-bold text-xs uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
                Corporate & Support
              </h3>
              <div className="space-y-3 text-xs text-slate-300">
                <div>
                  <div className="font-semibold text-white">{brand.legalName}</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">{brand.tagline}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: brand.theme.secondary }}>✉️</span>
                    <a href={`mailto:${brand.supportEmail}`} className="hover:underline transition">
                      {brand.supportEmail}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: brand.theme.secondary }}>🌐</span>
                    <a href={brand.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline transition">
                      {brand.websiteUrl.replace(/^https?:\/\//, '')} ↗
                    </a>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleNav('help')}
                    className="w-full text-center px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg font-bold text-xs transition"
                  >
                    📖 Open User Guide & Manual
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* BOTTOM LEGAL BAR */}
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-300">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
              <span>© {new Date().getFullYear()} {brand.legalName}. All rights reserved.</span>
              <span className="hidden sm:inline text-slate-500">•</span>
              <span style={{ color: brand.theme.secondary }} className="font-medium">ISO-Certified Battery Pack Production OS</span>
            </div>

            {/* LEGAL LINKS */}
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
            </div>
          </div>
        </div>
      </footer>

      {/* LEGAL DISCLOSURE MODAL */}
      <Modal 
        isOpen={Boolean(activeLegalModal)} 
        onClose={() => setActiveLegalModal(null)} 
        title={
          activeLegalModal === 'privacy' ? `${brand.companyName} Privacy Policy` :
          activeLegalModal === 'terms' ? `${brand.companyName} Terms of Service` : `${brand.companyName} Security & Compliance`
        }
      >
        <div className="p-4 space-y-3 text-xs text-slate-700 leading-relaxed">
          <p className="font-bold text-sm text-slate-900">
            {activeLegalModal === 'privacy' && 'Enterprise Data Protection & Privacy'}
            {activeLegalModal === 'terms' && 'Plant Operating Terms & Conditions'}
            {activeLegalModal === 'security' && 'ISO-Compliant Security Protocols'}
          </p>
          <p>
            {brand.legalName} strictly maintains high-grade operational security and confidentiality across all inward procurement documents, testing metrics, employee task logs, and manufacturing recipes.
          </p>
          <p>
            For compliance queries or audit verification, please contact our engineering governance officer at <a href={`mailto:${brand.supportEmail}`} className="font-semibold underline">{brand.supportEmail}</a>.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default Footer;