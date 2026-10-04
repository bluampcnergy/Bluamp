import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { View } from '../types';
import type { User } from '../types';
import { BuildingIcon } from './icons/BuildingIcon';
import { CubeIcon } from './icons/CubeIcon';
import { SearchIcon } from './icons/SearchIcon';
import { FileTextIcon } from './icons/FileTextIcon';
import { SparklesIcon } from './icons/SparklesIcon';

interface HeaderProps {
  currentView: View;
  setView: (view: View) => void;
  username: string;
  userRole: User['role'];
  onLogout: () => void;
}

interface NavButtonProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const TopNavButton: React.FC<NavButtonProps> = ({ isActive, onClick, children, icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center px-3 lg:px-4 py-2.5 md:py-3 text-xs lg:text-sm font-semibold transition-all duration-150 border-b-4 focus:outline-none whitespace-nowrap shrink-0 ${
      isActive
        ? 'border-[#75c081] text-[#75c081] bg-white/10 font-bold'
        : 'border-transparent text-slate-200 hover:text-white hover:border-[#75c081]/60 hover:bg-white/5'
    }`}
  >
    {icon && <span className={`mr-1.5 transition-colors duration-150 ${isActive ? 'text-[#75c081]' : 'text-slate-300'}`}>{icon}</span>}
    {children}
  </button>
);

const SubNavButton: React.FC<NavButtonProps> = ({ isActive, onClick, children, icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 whitespace-nowrap border focus:outline-none flex items-center gap-1.5 shrink-0 ${
      isActive
        ? 'bg-[#205f64] text-white border-[#205f64] shadow-sm font-extrabold ring-2 ring-[#75c081]/40'
        : 'bg-white text-slate-700 border-slate-200 hover:border-[#498e72] hover:text-[#205f64] hover:bg-slate-50'
    }`}
  >
    {icon}
    {children}
  </button>
);

const Header: React.FC<HeaderProps> = ({ currentView, setView, username, userRole, onLogout }) => {
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [suppliesTab, setSuppliesTab] = useState<'procurement' | 'tracking' | 'find_suppliers'>('procurement');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOtherOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOtherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Sync supplies tab from custom event
  useEffect(() => {
    const handleSuppliesTabChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && ['procurement', 'tracking', 'find_suppliers'].includes(customEvent.detail)) {
        setSuppliesTab(customEvent.detail);
      }
    };
    window.addEventListener('supplies-tab-changed', handleSuppliesTabChanged);
    return () => window.removeEventListener('supplies-tab-changed', handleSuppliesTabChanged);
  }, []);

  const handleSuppliesSubTabClick = (tab: 'procurement' | 'tracking' | 'find_suppliers') => {
    setSuppliesTab(tab);
    if (currentView !== 'supplies') {
      setView('supplies');
    }
    // Allow state to switch
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('switch-supplies-tab', { detail: tab }));
    }, 50);
  };

  const categories = useMemo(() => ({
    home: ['home'] as View[],
    supplies: ['supplies'] as View[],
    operations: ['received', 'testing', 'wip', 'dtf', 'finished', 'storage'] as View[],
    finance: ['finance_upload', 'finance_dashboard', 'finance_gst', 'finance_expenses', 'finance_prices', 'finance_costing', 'finance_maker', 'finance_ledger'] as View[],
    admin: ['companies', 'users', 'employee_tasks', 'ai_assistant', 'reports', 'master', 'log'] as View[],
    help: ['help'] as View[],
    webmail: ['webmail'] as View[],
  }), []);

  const currentCategory = useMemo(() => {
    if (currentView === 'home') return 'home';
    if (currentView === 'supplies') return 'supplies';
    if (categories.operations.includes(currentView)) return 'operations';
    if (categories.finance.includes(currentView)) return 'finance';
    if (categories.admin.includes(currentView)) return 'admin';
    if (currentView === 'help') return 'help';
    if (currentView === 'webmail') return 'webmail';
    return 'operations';
  }, [currentView, categories]);

  const isOtherActive = currentCategory === 'help' || currentCategory === 'webmail';

  return (
    <>
    <header className="bg-[#205f64] sticky top-0 z-[100] shadow-xl border-b border-[#2ca4c2]/30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between h-auto md:h-16 py-2 md:py-0 gap-2 md:gap-0">
          
          {/* LOGO & BRANDING */}
          <div className="flex items-center justify-between shrink-0 mr-4 lg:mr-8">
            <div className="flex items-center cursor-pointer gap-2.5" onClick={() => setView('home')}>
              <img
                src="https://bluampenergy.com/wp-content/uploads/2018/07/logo-white-001.png"
                alt="Bluamp Logo"
                className="h-9 w-auto object-contain rounded-md p-0.5"
              />
              <div className="flex flex-col justify-center">
                <h1 className="text-lg font-extrabold text-white leading-none tracking-tight font-brand bluamp-logo-text">Bluamp</h1>
                <p className="text-[10px] text-[#75c081] font-black tracking-widest uppercase mt-0.5">Plant OS</p>
              </div>
            </div>

            {/* Mobile Header Quick Actions */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => setView('mobile')}
                className="p-1.5 bg-[#1b4b4f] text-[#75c081] rounded-lg border border-[#2ca4c2]/30 text-xs font-bold"
                title="Mobile Voice"
              >
                🎙️
              </button>
              {username && (
                <div className="w-7 h-7 rounded-full bg-[#498e72] text-white font-extrabold flex items-center justify-center text-xs uppercase shadow-sm">
                  {username.charAt(0)}
                </div>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 text-slate-300 hover:text-red-300 rounded-lg"
                  title="Logout"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* MAIN TOP NAVIGATION */}
          <nav className="flex items-center space-x-1 overflow-x-auto scrollbar-hide py-1 md:py-0 md:flex-grow md:justify-center">
            <div className="flex items-center space-x-1 shrink-0">
              {/* 1. HOME */}
              <TopNavButton
                isActive={currentCategory === 'home'}
                onClick={() => setView('home')}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                }
              >
                Home
              </TopNavButton>

              {/* 2. SUPPLIES */}
              <TopNavButton
                isActive={currentCategory === 'supplies'}
                onClick={() => setView('supplies')}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                }
              >
                Supplies
              </TopNavButton>

              {/* 3. OPERATIONS */}
              <TopNavButton
                isActive={currentCategory === 'operations'}
                onClick={() => setView('received')}
                icon={<CubeIcon className="h-4 w-4" />}
              >
                Operations
              </TopNavButton>

              {/* 4. FINANCE */}
              <TopNavButton
                isActive={currentCategory === 'finance'}
                onClick={() => setView((userRole === 'admin' || userRole === 'billing') ? 'finance_dashboard' : 'finance_maker')}
                icon={<FileTextIcon className="h-4 w-4" />}
              >
                Finance
              </TopNavButton>

              {/* 5. ADMIN */}
              <TopNavButton
                isActive={currentCategory === 'admin'}
                onClick={() => setView('companies')}
                icon={<BuildingIcon className="h-4 w-4" />}
              >
                Admin
              </TopNavButton>

              {/* DIVIDER */}
              <div className="w-px h-5 bg-[#2ca4c2]/40 mx-1.5 self-center shrink-0"></div>

              {/* 6. OTHER LINKS DROPDOWN */}
              <div className="relative shrink-0" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsOtherOpen(!isOtherOpen)}
                  className={`flex items-center px-3 lg:px-4 py-2.5 md:py-3 text-xs lg:text-sm font-semibold transition-all duration-150 border-b-4 focus:outline-none whitespace-nowrap ${
                    isOtherOpen || isOtherActive
                      ? 'border-[#75c081] text-[#75c081] bg-white/10 font-bold'
                      : 'border-transparent text-slate-200 hover:text-white hover:border-[#75c081]/60 hover:bg-white/5'
                  }`}
                >
                  <span className={`mr-1.5 transition-colors duration-150 ${isOtherOpen || isOtherActive ? 'text-[#75c081]' : 'text-slate-300'}`}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </span>
                  Other Links
                  <svg className={`w-3.5 h-3.5 ml-1 transition-transform duration-200 ${isOtherOpen ? 'rotate-180 text-[#75c081]' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* RELATIVE ATTACHED DROPDOWN MENU */}
                {isOtherOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-[199] bg-black/20" 
                      onClick={() => setIsOtherOpen(false)} 
                    />
                    <div className="absolute top-full right-0 mt-1 w-64 bg-[#1b4b4f] border border-[#2ca4c2]/40 rounded-xl shadow-2xl py-2 z-[200] animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="px-3.5 py-1.5 text-[10px] font-black uppercase text-[#75c081] tracking-widest border-b border-[#2ca4c2]/20 flex justify-between items-center">
                        <span>Resources & Portals</span>
                        <span className="text-slate-400 font-normal">Esc to close</span>
                      </div>

                      {/* 1. Help Guide */}
                      <button
                        type="button"
                        onClick={() => {
                          setView('help');
                          setIsOtherOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-[#205f64] transition-colors ${
                          currentView === 'help' ? 'text-[#75c081] bg-[#205f64] font-black' : 'text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">📖</span>
                          <div>
                            <div className="leading-tight">Help & User Guide</div>
                            <div className="text-[10px] text-slate-300 font-normal">Component & App Manual</div>
                          </div>
                        </div>
                        <span className="text-[10px] bg-[#75c081]/20 text-[#75c081] px-1.5 py-0.5 rounded font-black">GUIDE</span>
                      </button>

                      {/* 2. Webmail Client */}
                      <button
                        type="button"
                        onClick={() => {
                          setView('webmail');
                          setIsOtherOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-[#205f64] transition-colors ${
                          currentView === 'webmail' ? 'text-[#75c081] bg-[#205f64] font-black' : 'text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">✉️</span>
                          <div>
                            <div className="leading-tight">Bluamp Webmail</div>
                            <div className="text-[10px] text-slate-300 font-normal">IMAP/SMTP Mail Client</div>
                          </div>
                        </div>
                      </button>

                      {/* 3. Mobile Voice Shell */}
                      <button
                        type="button"
                        onClick={() => {
                          setView('mobile');
                          setIsOtherOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-xs font-bold flex items-center justify-between hover:bg-[#205f64] transition-colors text-white border-t border-[#2ca4c2]/20"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">🎙️</span>
                          <div>
                            <div className="leading-tight">Mobile Voice Assistant</div>
                            <div className="text-[10px] text-slate-300 font-normal">Hands-free Floor Voice UI</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </nav>

          {/* DESKTOP USER PROFILE / LOGOUT */}
          <div className="hidden md:flex items-center space-x-2.5 shrink-0 justify-end">
            <button
              type="button"
              onClick={() => setView('mobile')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#498e72] to-[#75c081] text-white font-bold text-xs rounded-full shadow-md hover:scale-105 active:scale-95 transition"
              title="Open Mobile Voice Assistant"
            >
              <span>🎙️</span>
              <span>Voice</span>
            </button>

            {username && (
              <div className="flex items-center space-x-2 bg-[#1b4b4f] px-3 py-1 rounded-full border border-[#2ca4c2]/30 shadow-inner">
                <div className="w-6 h-6 rounded-full bg-[#498e72] text-white font-extrabold flex items-center justify-center text-xs uppercase shadow-sm">
                  {username.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">{username}</span>
                  <span className="text-[9px] text-[#75c081] font-black uppercase tracking-wider mt-0.5">
                    {userRole === 'admin' ? 'Director Admin' : userRole === 'billing' ? 'Billing & Ops' : 'Employee'}
                  </span>
                </div>
              </div>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-2 text-slate-300 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* SUB-NAVIGATION BAR */}
      <div className="bg-slate-50 border-t border-[#2ca4c2]/30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-2 py-2 overflow-x-auto scrollbar-hide scroll-smooth">
            
            {/* 1. HOME SUB-NAV */}
            {currentCategory === 'home' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#205f64]/70 uppercase tracking-widest mr-1.5 shrink-0">Overview:</div>
                <SubNavButton isActive={currentView === 'home'} onClick={() => setView('home')}>
                  📊 Plant Dashboard Summary
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('employee_tasks')}>
                  📋 My Tasks
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('ai_assistant')}>
                  ✨ AI Assistant
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('help')} icon={<span className="text-xs">📖</span>}>
                  Help Guide
                </SubNavButton>
              </>
            )}

            {/* 2. SUPPLIES SUB-NAV */}
            {currentCategory === 'supplies' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#205f64]/70 uppercase tracking-widest mr-1.5 shrink-0">Procurement:</div>
                <SubNavButton 
                  isActive={currentView === 'supplies' && suppliesTab === 'procurement'} 
                  onClick={() => handleSuppliesSubTabClick('procurement')}
                >
                  📦 Procurement & Requisitions
                </SubNavButton>
                <SubNavButton 
                  isActive={currentView === 'supplies' && suppliesTab === 'tracking'} 
                  onClick={() => handleSuppliesSubTabClick('tracking')}
                >
                  🚚 Factory Inbound Tracking
                </SubNavButton>
                <SubNavButton 
                  isActive={currentView === 'supplies' && suppliesTab === 'find_suppliers'} 
                  onClick={() => handleSuppliesSubTabClick('find_suppliers')}
                >
                  🔍 Find New Suppliers (AI & Maps)
                </SubNavButton>
                <div className="w-px h-5 bg-slate-300 mx-1 shrink-0 self-center"></div>
                <SubNavButton isActive={false} onClick={() => setView('received')}>
                  📥 Raw Materials Intake
                </SubNavButton>
              </>
            )}

            {/* 3. OPERATIONS SUB-NAV */}
            {currentCategory === 'operations' && (
              <>
                <SubNavButton isActive={currentView === 'received'} onClick={() => setView('received')}>Raw Materials</SubNavButton>
                <SubNavButton isActive={currentView === 'testing'} onClick={() => setView('testing')}>Testing</SubNavButton>
                <SubNavButton isActive={currentView === 'wip'} onClick={() => setView('wip')}>WIP (Assembly)</SubNavButton>
                <SubNavButton isActive={currentView === 'dtf'} onClick={() => setView('dtf')}>Direct-To-Finished</SubNavButton>
                <SubNavButton isActive={currentView === 'finished'} onClick={() => setView('finished')}>Finished Goods</SubNavButton>
                <SubNavButton isActive={currentView === 'storage'} onClick={() => setView('storage')}>Storage Rack Map</SubNavButton>
                <div className="w-px h-5 bg-slate-300 mx-1 shrink-0 self-center"></div>
                <SubNavButton isActive={false} onClick={() => setView('supplies')}>
                  📦 Supplies & Procurement
                </SubNavButton>
              </>
            )}

            {/* 4. FINANCE SUB-NAV */}
            {currentCategory === 'finance' && (
              <>
                {(userRole === 'admin' || userRole === 'billing') && (
                  <>
                    <SubNavButton isActive={currentView === 'finance_upload'} onClick={() => setView('finance_upload')}>Scan & Import</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_dashboard'} onClick={() => setView('finance_dashboard')}>Summary</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_ledger'} onClick={() => setView('finance_ledger')}>Accounts Ledger</SubNavButton>
                  </>
                )}
                <SubNavButton isActive={currentView === 'finance_maker'} onClick={() => setView('finance_maker')}>Invoice Maker</SubNavButton>
                {(userRole === 'admin' || userRole === 'billing') && (
                  <>
                    <SubNavButton isActive={currentView === 'finance_gst'} onClick={() => setView('finance_gst')}>GST Returns</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_prices'} onClick={() => setView('finance_prices')}>Prices</SubNavButton>
                  </>
                )}
                {userRole === 'admin' && (
                  <SubNavButton isActive={currentView === 'finance_costing'} onClick={() => setView('finance_costing')} icon={<span className="text-xs">🧮</span>}>BOM Costing</SubNavButton>
                )}
                <SubNavButton isActive={currentView === 'finance_expenses'} onClick={() => setView('finance_expenses')}>Expenses</SubNavButton>
              </>
            )}

            {/* 5. ADMIN SUB-NAV */}
            {currentCategory === 'admin' && (
              <>
                <SubNavButton isActive={currentView === 'companies'} onClick={() => setView('companies')}>🏢 Companies</SubNavButton>
                {userRole === 'admin' && (
                  <SubNavButton isActive={currentView === 'users'} onClick={() => setView('users')}>👥 Users</SubNavButton>
                )}
                <SubNavButton isActive={currentView === 'employee_tasks'} onClick={() => setView('employee_tasks')}>📋 Employee Tasks</SubNavButton>
                <div className="w-px h-5 bg-slate-300 mx-1 shrink-0 self-center"></div>
                <SubNavButton isActive={currentView === 'ai_assistant'} onClick={() => setView('ai_assistant')} icon={<SparklesIcon className="h-3 w-3" />}>AI Assistant</SubNavButton>
                <SubNavButton isActive={currentView === 'reports'} onClick={() => setView('reports')}>📊 Exports</SubNavButton>
                <SubNavButton isActive={currentView === 'master'} onClick={() => setView('master')}>🔍 Traceability</SubNavButton>
                <SubNavButton isActive={currentView === 'log'} onClick={() => setView('log')}>📜 Logs</SubNavButton>
              </>
            )}

            {/* 6. WEBMAIL SUB-NAV */}
            {currentCategory === 'webmail' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#205f64]/70 uppercase tracking-widest mr-1.5 shrink-0">Mailbox:</div>
                <SubNavButton isActive={currentView === 'webmail'} onClick={() => setView('webmail')}>
                  ✉️ IMAP/SMTP Webmail Client
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('employee_tasks')}>
                  📋 Back to Tasks
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('home')}>
                  ← Home
                </SubNavButton>
              </>
            )}

            {/* 7. HELP GUIDE SUB-NAV */}
            {currentCategory === 'help' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#205f64]/70 uppercase tracking-widest mr-1.5 shrink-0">Documentation:</div>
                <SubNavButton isActive={currentView === 'help'} onClick={() => setView('help')}>
                  📖 User Guide & Component Manual
                </SubNavButton>
                <SubNavButton isActive={false} onClick={() => setView('home')}>
                  ← Return to Dashboard
                </SubNavButton>
              </>
            )}

          </div>
        </div>
      </div>
    </header>

    {/* FIXED MOBILE BOTTOM NAVIGATION BAR (Screens < 768px) */}
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[120] bg-[#205f64]/95 backdrop-blur-md border-t border-[#2ca4c2]/30 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-inset-bottom">
      {/* 1. Home */}
      <button
        type="button"
        onClick={() => setView('home')}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all ${
          currentCategory === 'home' ? 'text-[#75c081] bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={currentCategory === 'home' ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span className="text-[10px] tracking-tight">Home</span>
      </button>

      {/* 2. Supplies */}
      <button
        type="button"
        onClick={() => setView('supplies')}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all ${
          currentCategory === 'supplies' ? 'text-[#75c081] bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <svg className="h-5 w-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={currentCategory === 'supplies' ? 2.5 : 2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <span className="text-[10px] tracking-tight">Supplies</span>
      </button>

      {/* 3. Operations */}
      <button
        type="button"
        onClick={() => setView('received')}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all ${
          currentCategory === 'operations' ? 'text-[#75c081] bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <CubeIcon className="h-5 w-5 mb-0.5" />
        <span className="text-[10px] tracking-tight">Operations</span>
      </button>

      {/* 4. Finance */}
      <button
        type="button"
        onClick={() => setView((userRole === 'admin' || userRole === 'billing') ? 'finance_dashboard' : 'finance_maker')}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all ${
          currentCategory === 'finance' ? 'text-[#75c081] bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <FileTextIcon className="h-5 w-5 mb-0.5" />
        <span className="text-[10px] tracking-tight">Finance</span>
      </button>

      {/* 5. Admin / Tasks */}
      <button
        type="button"
        onClick={() => setView('companies')}
        className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-1.5 rounded-xl transition-all ${
          currentCategory === 'admin' ? 'text-[#75c081] bg-white/10 font-bold' : 'text-slate-300 hover:text-white'
        }`}
      >
        <BuildingIcon className="h-5 w-5 mb-0.5" />
        <span className="text-[10px] tracking-tight">Admin</span>
      </button>
    </nav>
    </>
  );
};

export default Header;