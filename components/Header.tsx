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
    onClick={onClick}
    className={`flex items-center px-4 py-3 text-sm font-semibold transition-all duration-200 border-b-4 focus:outline-none ${isActive
      ? 'border-[#8EBF45] text-[#8EBF45] bg-white/5'
      : 'border-transparent text-slate-400 hover:text-white hover:border-white/20'
      }`}
  >
    {icon && <span className={`mr-2 transition-colors duration-200 ${isActive ? 'text-[#8EBF45]' : 'text-slate-500'}`}>{icon}</span>}
    {children}
  </button>
);

const SubNavButton: React.FC<NavButtonProps> = ({ isActive, onClick, children, icon }) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all duration-200 whitespace-nowrap border focus:outline-none flex items-center gap-2 ${isActive
      ? 'bg-[#8EBF45] text-[#0D0D0D] border-[#8EBF45] shadow-lg scale-105'
      : 'bg-white text-[#404040] border-[#A8BF75]/30 hover:border-[#8EBF45] hover:text-[#658C3E]'
      }`}
  >
    {icon}
    {children}
  </button>
);

const Header: React.FC<HeaderProps> = ({ currentView, setView, username, userRole, onLogout }) => {
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOtherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categories = useMemo(() => ({
    home: ['home'] as View[],
    supplies: ['supplies'] as View[],
    operations: ['received', 'testing', 'wip', 'dtf', 'finished', 'storage'] as View[],
    finance: ['finance_upload', 'finance_dashboard', 'finance_gst', 'finance_expenses', 'finance_prices', 'finance_maker'] as View[],
    admin: ['companies', 'users', 'employee_tasks', 'webmail', 'ai_assistant', 'reports', 'master', 'log'] as View[],
    help: ['help'] as View[],
  }), []);

  const currentCategory = useMemo(() => {
    if (currentView === 'home') return 'home';
    if (currentView === 'supplies') return 'supplies';
    if (categories.operations.includes(currentView)) return 'operations';
    if (categories.finance.includes(currentView)) return 'finance';
    if (categories.admin.includes(currentView)) return 'admin';
    if (currentView === 'help') return 'help';
    return 'operations';
  }, [currentView, categories]);

  return (
    <header className="bg-[#0D0D0D] sticky top-0 z-[100] shadow-xl border-b border-[#404040] overflow-visible">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-visible">
        <div className="flex flex-col md:flex-row md:items-center justify-between h-auto md:h-16 overflow-visible">
          
          {/* LOGO & BRANDING */}
          <div className="flex items-center justify-between py-3 md:py-0 mr-8">
            <div className="flex items-center cursor-pointer gap-3" onClick={() => setView('home')}>
              <img
                src="https://bfkxdpripwjxenfvwpfu.supabase.co/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png"
                alt="Datlion Cnergy Logo"
                className="h-10 w-auto object-contain"
              />
              <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold text-white leading-none tracking-tight font-brand">Datlion Cnergy</h1>
                <p className="text-[10px] text-[#8EBF45] font-black tracking-widest uppercase mt-0.5">Plant Management OS</p>
              </div>
            </div>
          </div>

          {/* MAIN TOP NAVIGATION */}
          <nav className="flex items-center space-x-1 md:flex-grow md:justify-center pt-1 md:pt-0 overflow-visible">
            {/* Top Navigation Items */}
            <div className="flex items-center space-x-1 overflow-visible">
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

              {/* 2. SUPPLIES / PROCUREMENT */}
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
                onClick={() => setView(userRole === 'admin' ? 'finance_dashboard' : 'finance_maker')}
                icon={<FileTextIcon className="h-4 w-4" />}
              >
                Finance
              </TopNavButton>

              {/* 5. ADMIN (Combines Analytics: AI Assistant, Exports, Traceability, Logs) */}
              <TopNavButton
                isActive={currentCategory === 'admin'}
                onClick={() => setView('companies')}
                icon={<BuildingIcon className="h-4 w-4" />}
              >
                Admin
              </TopNavButton>
            </div>

            {/* DIVIDER */}
            <div className="w-px h-6 bg-slate-700 mx-2 self-center hidden sm:block"></div>

            {/* 5. OTHER LINKS DROPDOWN (Help, Reports, Prismatic Data) */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setIsOtherOpen(!isOtherOpen)}
                className={`flex items-center px-4 py-3 text-sm font-semibold transition-all duration-200 border-b-4 focus:outline-none ${
                  isOtherOpen || currentCategory === 'help'
                    ? 'border-[#8EBF45] text-[#8EBF45] bg-white/5'
                    : 'border-transparent text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                <span className={`mr-2 transition-colors duration-200 ${isOtherOpen || currentCategory === 'help' ? 'text-[#8EBF45]' : 'text-slate-500'}`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </span>
                Other Links
                <svg className={`w-3.5 h-3.5 ml-1.5 transition-transform duration-200 ${isOtherOpen ? 'rotate-180 text-[#8EBF45]' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* FIXED OVERLAY DROPDOWN MENU - Floats over main page */}
              {isOtherOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[1px]" 
                    onClick={() => setIsOtherOpen(false)} 
                  />
                  <div className="fixed top-16 right-4 sm:right-20 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl py-3 z-[9999] animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2 text-[10px] font-black uppercase text-[#8EBF45] tracking-widest border-b border-slate-800 flex justify-between items-center">
                      <span>Resources & Portals</span>
                      <span className="text-slate-500 font-normal">Press Esc to close</span>
                    </div>

                    {/* 1. Help Guide */}
                    <button
                      onClick={() => {
                        setView('help');
                        setIsOtherOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between hover:bg-slate-800 transition-colors ${
                        currentView === 'help' ? 'text-[#8EBF45] bg-slate-800/80 font-black' : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📖</span>
                        <div>
                          <div className="leading-tight">Help & User Guide</div>
                          <div className="text-[10px] text-slate-400 font-normal">Component & App Manual</div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-[#8EBF45]/20 text-[#8EBF45] px-1.5 py-0.5 rounded font-black">NEW</span>
                    </button>

                    {/* Webmail */}
                    <button
                      onClick={() => {
                        setView('webmail');
                        setIsOtherOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between hover:bg-slate-800 transition-colors ${
                        currentView === 'webmail' ? 'text-[#8EBF45] bg-slate-800/80 font-black' : 'text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📧</span>
                        <div>
                          <div className="leading-tight">Cnergy Webmail</div>
                          <div className="text-[10px] text-slate-400 font-normal">@cnergy.co.in Team Mailbox</div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-[#8EBF45]/20 text-[#8EBF45] px-1.5 py-0.5 rounded font-black">NEW</span>
                    </button>

                    <div className="h-px bg-slate-800 my-1"></div>

                    {/* 2. Reports */}
                    <a
                      href="https://support.cnergy.co.in/report"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsOtherOpen(false)}
                      className="w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between hover:bg-slate-800 text-slate-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📊</span>
                        <div>
                          <div className="leading-tight">Reports Portal</div>
                          <div className="text-[10px] text-slate-400 font-normal">External Support Reports</div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">↗</span>
                    </a>

                    {/* 3. Prismatic Data */}
                    <a
                      href="https://support.cnergy.co.in/data"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsOtherOpen(false)}
                      className="w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between hover:bg-slate-800 text-slate-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">💎</span>
                        <div>
                          <div className="leading-tight">Prismatic Data</div>
                          <div className="text-[10px] text-slate-400 font-normal">Analytics Engine</div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">↗</span>
                    </a>
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* USER PROFILE / LOGOUT */}
          <div className="flex items-center space-x-3 py-2 md:py-0 justify-end border-t md:border-t-0 border-slate-800">
            {username && (
              <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                <div className="w-6 h-6 rounded-full bg-[#8EBF45] text-[#0D0D0D] font-extrabold flex items-center justify-center text-xs uppercase">
                  {username.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">{username}</span>
                  <span className="text-[9px] text-[#8EBF45] font-black uppercase tracking-wider mt-0.5">
                    {userRole === 'admin' ? 'Director Admin' : userRole === 'billing' ? 'Billing & Ops' : 'Employee'}
                  </span>
                </div>
              </div>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
      <div className="bg-white border-t border-[#A8BF75]/30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3 py-2.5 overflow-x-auto scrollbar-hide">
            
            {/* HOME SUB-NAV */}
            {currentCategory === 'home' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#404040]/50 uppercase tracking-widest mr-2">Overview:</div>
                <SubNavButton isActive={currentView === 'home'} onClick={() => setView('home')}>Plant Dashboard Summary</SubNavButton>
              </>
            )}

            {/* SUPPLIES SUB-NAV */}
            {currentCategory === 'supplies' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#404040]/50 uppercase tracking-widest mr-2">Procurement:</div>
                <SubNavButton isActive={currentView === 'supplies'} onClick={() => setView('supplies')}>Procurement & Supplies Dashboard</SubNavButton>
              </>
            )}

            {/* OPERATIONS SUB-NAV */}
            {currentCategory === 'operations' && (
              <>
                <SubNavButton isActive={currentView === 'received'} onClick={() => setView('received')}>Raw Materials</SubNavButton>
                <SubNavButton isActive={currentView === 'testing'} onClick={() => setView('testing')}>Testing</SubNavButton>
                <SubNavButton isActive={currentView === 'wip'} onClick={() => setView('wip')}>WIP (Assembly)</SubNavButton>
                <SubNavButton isActive={currentView === 'dtf'} onClick={() => setView('dtf')}>Direct-To-Finished</SubNavButton>
                <SubNavButton isActive={currentView === 'finished'} onClick={() => setView('finished')}>Finished Goods</SubNavButton>
                <SubNavButton isActive={currentView === 'storage'} onClick={() => setView('storage')}>Storage Rack Map</SubNavButton>
              </>
            )}

            {/* FINANCE SUB-NAV */}
            {currentCategory === 'finance' && (
              <>
                {userRole === 'admin' && (
                  <>
                    <SubNavButton isActive={currentView === 'finance_upload'} onClick={() => setView('finance_upload')}>Scan & Import</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_dashboard'} onClick={() => setView('finance_dashboard')}>Summary</SubNavButton>
                  </>
                )}
                <SubNavButton isActive={currentView === 'finance_maker'} onClick={() => setView('finance_maker')}>Invoice Maker</SubNavButton>
                {userRole === 'admin' && (
                  <>
                    <SubNavButton isActive={currentView === 'finance_gst'} onClick={() => setView('finance_gst')}>GST Returns</SubNavButton>
                    <SubNavButton isActive={currentView === 'finance_prices'} onClick={() => setView('finance_prices')}>Prices</SubNavButton>
                  </>
                )}
                <SubNavButton isActive={currentView === 'finance_expenses'} onClick={() => setView('finance_expenses')}>Expenses</SubNavButton>
              </>
            )}

            {/* ADMIN SUB-NAV (Combines Analytics) */}
            {currentCategory === 'admin' && (
              <>
                <SubNavButton isActive={currentView === 'companies'} onClick={() => setView('companies')}>Companies</SubNavButton>
                {userRole === 'admin' && (
                  <SubNavButton isActive={currentView === 'users'} onClick={() => setView('users')}>Users</SubNavButton>
                )}
                <SubNavButton isActive={currentView === 'employee_tasks'} onClick={() => setView('employee_tasks')}>
                  📋 Employee Tasks
                </SubNavButton>
                <SubNavButton isActive={currentView === 'webmail'} onClick={() => setView('webmail')}>
                  📧 Webmail
                </SubNavButton>
                <div className="w-px h-6 bg-[#A8BF75]/40 mx-2"></div>
                <SubNavButton isActive={currentView === 'ai_assistant'} onClick={() => setView('ai_assistant')} icon={<SparklesIcon className="h-3 w-3" />}>AI Assistant</SubNavButton>
                <SubNavButton isActive={currentView === 'reports'} onClick={() => setView('reports')}>Exports</SubNavButton>
                <SubNavButton isActive={currentView === 'master'} onClick={() => setView('master')}>Traceability</SubNavButton>
                <SubNavButton isActive={currentView === 'log'} onClick={() => setView('log')}>Logs</SubNavButton>
              </>
            )}

            {/* HELP SUB-NAV */}
            {currentCategory === 'help' && (
              <>
                <div className="flex items-center gap-1 text-[10px] font-black text-[#404040]/50 uppercase tracking-widest mr-2">Guide:</div>
                <SubNavButton isActive={currentView === 'help'} onClick={() => setView('help')}>Help & User Guide</SubNavButton>
              </>
            )}

          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;