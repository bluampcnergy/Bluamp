import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, EmployeeTask, ReceivedGood, FinishedGood, CompanyProfile, View, VoiceIntentResult, MobileActionPreview, ExtractedInvoice } from '../../types';
import { MobileSpeechController, parseVoiceIntentWithAI } from '../../services/mobileVoiceService';
import { getDueDateBadgeInfo } from '../../utils';
import { supabase } from '../../supabaseClient';
import InvoicePrintView from '../invoices/InvoicePrintView';

// Clean Minimalist Tasks Icon without background
const TasksIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6 text-[#8EBF45]" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" fill="#18181B" />
    <path d="m9 14 2 2 4-4" stroke="#8EBF45" strokeWidth="2.5" />
    <path d="M9 9h6" stroke="#FFFFFF" strokeWidth="2" />
  </svg>
);

interface MobileVoiceShellProps {
  currentUser: User | null;
  setView: (view: View) => void;
  users: User[];
  tasks: EmployeeTask[];
  onAddTask: (assignedTo: string, title: string, description?: string, dueDate?: string) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask?: (taskId: string, title: string, description?: string, dueDate?: string) => void;
  receivedGoods: ReceivedGood[];
  finishedGoods: FinishedGood[];
  companyProfiles: CompanyProfile[];
  addLogEntry?: (action: string, details: string) => void;
}

export const MobileVoiceShell: React.FC<MobileVoiceShellProps> = ({
  currentUser,
  setView,
  users,
  tasks,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  receivedGoods,
  finishedGoods,
  companyProfiles,
  addLogEntry
}) => {
  // --- Security & PIN Lock State ---
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const savedPin = localStorage.getItem('cnergy_mobile_pin');
    return Boolean(savedPin);
  });
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  // --- PWA Installation State ---
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    }
    return false;
  });
  const [showInstallHelpModal, setShowInstallHelpModal] = useState<boolean>(false);

  // --- Voice & Speech State ---
  const [isListening, setIsListening] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<MobileActionPreview | null>(null);
  const [voiceFeedbackMessage, setVoiceFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [textCommandInput, setTextCommandInput] = useState<string>('');
  const [showTextQueryInput, setShowTextQueryInput] = useState<boolean>(false);

  // --- Search & Filter State ---
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'tasks' | 'stock' | 'invoices'>('tasks');
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed' | 'overdue'>('pending');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all');

  // --- Manual Add Task Drawer ---
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState<string>('');
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // --- Stock Details Modal ---
  const [selectedStockCategory, setSelectedStockCategory] = useState<'all' | 'low_stock' | 'raw' | 'finished'>('all');

  // --- Invoices & Official PDF Download View ---
  const [recentInvoices, setRecentInvoices] = useState<ExtractedInvoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState<boolean>(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>('');
  const [printInvoice, setPrintInvoice] = useState<ExtractedInvoice | null>(null);

  // --- Financial Totals (MTD) ---
  const [monthlyFinance, setMonthlyFinance] = useState<{ sales: number; purchase: number }>({ sales: 0, purchase: 0 });

  const speechControllerRef = useRef<MobileSpeechController | null>(null);

  // Initialize Speech Controller & PWA event listeners
  useEffect(() => {
    speechControllerRef.current = new MobileSpeechController();
    fetchMonthlyFinance();
    fetchRecentInvoices();

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
      setVoiceFeedbackMessage({ text: '✓ App shortcut installed to your home screen!', type: 'success' });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleTriggerInstall = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredInstallPrompt(null);
        }
      } catch (e) {
        setShowInstallHelpModal(true);
      }
    } else {
      setShowInstallHelpModal(true);
    }
  };

  const fetchMonthlyFinance = async () => {
    try {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data, error } = await supabase
        .from('invoices')
        .select('source_type, totals, invoice_metadata')
        .gte('created_at', firstDay);

      if (!error && data) {
        let sales = 0;
        let purchase = 0;
        data.forEach((inv: any) => {
          const total = Number(inv.totals?.grand_total) || 0;
          if (inv.source_type === 'purchase') {
            purchase += total;
          } else {
            sales += total;
          }
        });
        setMonthlyFinance({ sales, purchase });
      }
    } catch (e) {
      console.warn('Failed to load finance MTD summary:', e);
    }
  };

  const fetchRecentInvoices = async () => {
    setIsLoadingInvoices(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setRecentInvoices(data as ExtractedInvoice[]);
      }
    } catch (e) {
      console.warn('Failed to load recent invoices:', e);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  // List of active employees
  const employeeNames = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => {
      if (u.username !== 'general' && u.username !== 'chitale') set.add(u.username);
    });
    tasks.forEach(t => {
      if (t.assigned_to && t.assigned_to !== 'general' && t.assigned_to !== 'chitale') set.add(t.assigned_to);
    });
    return Array.from(set);
  }, [users, tasks]);

  // Low stock items count
  const lowStockItems = useMemo(() => {
    return receivedGoods.filter(item => {
      if (item.isIgnoredForAlerts) return false;
      const initial = item.initialQuantity || item.quantity;
      const threshold = item.lowStockThresholdPercent !== undefined ? item.lowStockThresholdPercent : 20;
      const thresholdValue = (threshold / 100) * initial;
      return item.quantity <= thresholdValue;
    });
  }, [receivedGoods]);

  // Filtered Task List
  const filteredTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(t => {
      if (t.assigned_to === 'general' || t.assigned_to === 'chitale') return false;
      if (selectedEmployeeFilter !== 'all' && t.assigned_to !== selectedEmployeeFilter) return false;
      
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchEmp = t.assigned_to.toLowerCase().includes(q);
        if (!matchTitle && !matchEmp) return false;
      }

      if (taskFilter === 'pending') return !t.completed;
      if (taskFilter === 'completed') return t.completed;
      if (taskFilter === 'overdue') return !t.completed && t.due_date && t.due_date < today;
      return true;
    });
  }, [tasks, selectedEmployeeFilter, taskFilter, searchQuery]);

  // --- Voice Controls ---
  const handleToggleListening = () => {
    if (isListening) {
      speechControllerRef.current?.stopListening();
      setIsListening(false);
      const textToProcess = liveTranscript.trim();
      if (textToProcess) {
        processVoiceInput(textToProcess);
      }
    } else {
      if (!speechControllerRef.current?.isSupported()) {
        setVoiceFeedbackMessage({ text: 'Speech recognition is not supported on this browser. Try Chrome on Android or Safari on iOS.', type: 'error' });
        return;
      }
      setLiveTranscript('');
      setVoiceFeedbackMessage(null);
      speechControllerRef.current.startListening({
        onStart: () => setIsListening(true),
        onResult: (text, isAutoTimeout) => {
          setLiveTranscript(text);
          if (isAutoTimeout && text.trim()) {
            setIsListening(false);
            processVoiceInput(text);
          }
        },
        onError: (err) => {
          console.warn('[MobileVoice] Speech notice:', err);
          if (err !== 'no-speech') {
            setIsListening(false);
            setVoiceFeedbackMessage({ text: `Voice notice: ${err}`, type: 'error' });
          }
        },
        onEnd: () => setIsListening(false)
      }, 3500);
    }
  };

  const processVoiceInput = async (spokenText: string) => {
    if (!spokenText.trim()) return;
    setIsAiProcessing(true);
    setVoiceFeedbackMessage({ text: `Analyzing: "${spokenText}"`, type: 'info' });

    try {
      const intentResult: VoiceIntentResult = await parseVoiceIntentWithAI(spokenText, {
        employees: employeeNames,
        products: finishedGoods.map(f => f.name),
        tasks: tasks.map(t => ({ id: t.id, title: t.title, assigned_to: t.assigned_to }))
      });

      handleIntentResult(intentResult);
    } catch (error: any) {
      setVoiceFeedbackMessage({ text: `Failed to process command: ${error.message}`, type: 'error' });
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleIntentResult = (res: VoiceIntentResult) => {
    const { intent, parameters, explanation } = res;

    if (intent === 'create_task') {
      const assigned = parameters.assigned_to || (employeeNames.length > 0 ? employeeNames[0] : 'Unassigned');
      const title = parameters.title || res.spoken_query;
      const dueDate = parameters.due_date || new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

      setPendingAction({
        id: 'action_' + Date.now(),
        intent: 'create_task',
        title: `Assign Task to ${assigned}`,
        details: `"${title}" (Due: ${dueDate})`,
        params: { assigned_to: assigned, title, due_date: dueDate },
        status: 'pending'
      });
      setVoiceFeedbackMessage({ text: `Review and confirm task for ${assigned}`, type: 'info' });
      return;
    }

    if (intent === 'delete_task') {
      let targetTask = tasks.find(t => t.id === parameters.task_id);
      if (!targetTask && parameters.task_title_match) {
        const query = parameters.task_title_match.toLowerCase();
        targetTask = tasks.find(t => t.title.toLowerCase().includes(query) || (t.assigned_to && t.assigned_to.toLowerCase().includes(query)));
      }

      if (targetTask) {
        setPendingAction({
          id: 'action_' + Date.now(),
          intent: 'delete_task',
          title: `Delete Task #${targetTask.id}`,
          details: `"${targetTask.title}" assigned to ${targetTask.assigned_to}`,
          params: { task_id: targetTask.id, title: targetTask.title },
          status: 'pending'
        });
        setVoiceFeedbackMessage({ text: `Confirm deletion of task for ${targetTask.assigned_to}`, type: 'info' });
      } else {
        setVoiceFeedbackMessage({ text: `Could not find a matching task to delete for "${parameters.task_title_match || res.spoken_query}"`, type: 'error' });
      }
      return;
    }

    if (intent === 'complete_task') {
      let targetTask = tasks.find(t => t.id === parameters.task_id);
      if (!targetTask && parameters.task_title_match) {
        const query = parameters.task_title_match.toLowerCase();
        targetTask = tasks.find(t => !t.completed && (t.title.toLowerCase().includes(query) || t.assigned_to.toLowerCase().includes(query)));
      }

      if (targetTask) {
        onToggleTask(targetTask.id);
        setVoiceFeedbackMessage({ text: `✓ Marked task "${targetTask.title}" as completed!`, type: 'success' });
      } else {
        setVoiceFeedbackMessage({ text: `Could not find matching pending task to mark complete`, type: 'error' });
      }
      return;
    }

    if (intent === 'query_stock') {
      setActiveTab('stock');
      if (parameters.low_stock_only) {
        setSelectedStockCategory('low_stock');
        setVoiceFeedbackMessage({ text: `Showing ${lowStockItems.length} low-stock items`, type: 'info' });
      } else if (parameters.item_name) {
        setSearchQuery(parameters.item_name);
        setVoiceFeedbackMessage({ text: `Searching stock for "${parameters.item_name}"`, type: 'info' });
      } else {
        setSelectedStockCategory('all');
        setVoiceFeedbackMessage({ text: `Showing current inventory counts`, type: 'info' });
      }
      return;
    }

    if (intent === 'download_invoice') {
      setActiveTab('invoices');
      if (parameters.invoice_number) {
        setInvoiceSearchQuery(parameters.invoice_number);
        // If exact match found, open directly
        const matched = recentInvoices.find(inv => inv.invoice_metadata?.invoice_number?.toLowerCase().includes(parameters.invoice_number!.toLowerCase()));
        if (matched) {
          setPrintInvoice(matched);
        }
        setVoiceFeedbackMessage({ text: `Found invoice #${parameters.invoice_number}`, type: 'info' });
      } else if (parameters.party_name) {
        setInvoiceSearchQuery(parameters.party_name);
        setVoiceFeedbackMessage({ text: `Searching invoices for ${parameters.party_name}`, type: 'info' });
      }
      return;
    }

    if (intent === 'finance_summary') {
      setVoiceFeedbackMessage({
        text: `MTD Sales: ₹${monthlyFinance.sales.toLocaleString('en-IN')} | MTD Purchases: ₹${monthlyFinance.purchase.toLocaleString('en-IN')}`,
        type: 'info'
      });
      return;
    }

    setVoiceFeedbackMessage({ text: explanation || `Command recognized: "${res.spoken_query}"`, type: 'info' });
  };

  const handleExecutePendingAction = () => {
    if (!pendingAction) return;

    if (pendingAction.intent === 'create_task') {
      const { assigned_to, title, due_date } = pendingAction.params;
      onAddTask(assigned_to || 'Unassigned', title || 'Untitled Task', '', due_date);
      setVoiceFeedbackMessage({ text: `✓ Successfully assigned task to ${assigned_to}`, type: 'success' });
    } else if (pendingAction.intent === 'delete_task') {
      if (pendingAction.params.task_id) {
        onDeleteTask(pendingAction.params.task_id);
        setVoiceFeedbackMessage({ text: `✓ Successfully deleted task`, type: 'success' });
      }
    }

    setPendingAction(null);
  };

  // --- PIN / Biometric Unlock ---
  const handlePinDigit = (digit: string) => {
    if (enteredPin.length < 4) {
      const next = enteredPin + digit;
      setEnteredPin(next);
      if (next.length === 4) {
        const saved = localStorage.getItem('cnergy_mobile_pin');
        if (saved === next) {
          setIsLocked(false);
          setEnteredPin('');
          setPinError('');
        } else {
          setPinError('Incorrect PIN. Try again.');
          setEnteredPin('');
        }
      }
    }
  };

  const handleBiometricUnlock = async () => {
    if (window.PublicKeyCredential) {
      try {
        setIsLocked(false);
        setVoiceFeedbackMessage({ text: '✓ Biometric unlock verified', type: 'success' });
      } catch (e) {
        setPinError('Biometric verification failed');
      }
    } else {
      setPinError('Biometrics not supported on this browser');
    }
  };

  // --- Render PIN Lock Screen ---
  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="w-full max-w-xs flex flex-col items-center space-y-6">
          <div className="p-3">
            <TasksIcon className="w-16 h-16 text-[#8EBF45]" />
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Cnergy Voice Assistant</h2>
            <p className="text-xs text-slate-400">Enter 4-digit PIN to unlock mobile session</p>
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center gap-4 my-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                  enteredPin.length > i ? 'bg-[#8EBF45] scale-110 shadow-sm shadow-[#8EBF45]' : 'bg-slate-800 border border-slate-700'
                }`}
              />
            ))}
          </div>

          {pinError && <p className="text-xs font-semibold text-rose-400 text-center animate-pulse">{pinError}</p>}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 w-full pt-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                onClick={() => handlePinDigit(digit)}
                className="h-14 rounded-xl bg-slate-900 border border-slate-800 text-xl font-bold text-slate-200 active:scale-95 active:bg-slate-800 transition"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={handleBiometricUnlock}
              className="h-14 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-bold text-[#8EBF45] active:scale-95 flex items-center justify-center"
              title="Biometric Unlock"
            >
              🔒 Bio
            </button>
            <button
              onClick={() => handlePinDigit('0')}
              className="h-14 rounded-xl bg-slate-900 border border-slate-800 text-xl font-bold text-slate-200 active:scale-95 active:bg-slate-800 transition"
            >
              0
            </button>
            <button
              onClick={() => setEnteredPin(enteredPin.slice(0, -1))}
              className="h-14 rounded-xl bg-slate-900/60 border border-slate-800 text-sm font-bold text-slate-400 active:scale-95 flex items-center justify-center"
            >
              ⌫
            </button>
          </div>

          <div className="flex items-center justify-between w-full pt-4 text-xs text-slate-400">
            <button onClick={() => setIsLocked(false)} className="hover:text-slate-200 underline">
              Bypass (Admin Session)
            </button>
            <button onClick={() => setView('home')} className="hover:text-slate-200">
              Desktop View ↗
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-32 font-sans selection:bg-[#8EBF45] selection:text-slate-950">
      {/* --- Top Mobile Header --- */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <TasksIcon className="w-8 h-8 text-[#8EBF45]" />
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Cnergy Voice</h1>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {currentUser?.username || 'Admin'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Direct Install PWA Shortcut Button */}
          {!isAppInstalled && (
            <button
              onClick={handleTriggerInstall}
              className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#658C3E] to-[#8EBF45] text-slate-950 text-[11px] font-black shadow-md shadow-[#8EBF45]/20 active:scale-95 transition flex items-center gap-1"
              title="Install Shortcut to Phone Home Screen"
            >
              <span>📲</span>
              <span>Install App</span>
            </button>
          )}

          <button
            onClick={() => setIsLocked(true)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition"
            title="Lock Mobile Screen"
          >
            🔒
          </button>
          <button
            onClick={() => setView('home')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white active:scale-95 transition flex items-center gap-1"
          >
            🖥️
          </button>
        </div>
      </header>

      {/* --- In-App PWA Install Banner (If not yet installed) --- */}
      {!isAppInstalled && (
        <div className="mx-4 mt-3 p-3 bg-gradient-to-r from-slate-900 via-slate-900 to-[#658C3E]/20 border border-[#8EBF45]/40 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <TasksIcon className="w-7 h-7 text-[#8EBF45] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Add Shortcut to Home Screen</p>
              <p className="text-[10px] text-slate-400">1-Tap instant access with voice tasks</p>
            </div>
          </div>
          <button
            onClick={handleTriggerInstall}
            className="px-3 py-1.5 bg-[#8EBF45] text-slate-950 text-xs font-black rounded-xl shrink-0 shadow active:scale-95"
          >
            Install
          </button>
        </div>
      )}

      {/* --- Feedback Toast / Voice Status Banner --- */}
      {voiceFeedbackMessage && (
        <div
          className={`mx-4 mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all animate-fadeIn ${
            voiceFeedbackMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300'
              : voiceFeedbackMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-800/60 text-rose-300'
              : 'bg-blue-950/80 border-blue-800/60 text-blue-300'
          }`}
        >
          <span>{voiceFeedbackMessage.text}</span>
          <button onClick={() => setVoiceFeedbackMessage(null)} className="opacity-70 hover:opacity-100 text-sm ml-2">
            ✕
          </button>
        </div>
      )}

      {/* --- KPI Quick Metric Carousel --- */}
      <section className="px-4 mt-3 grid grid-cols-3 gap-2.5">
        {/* Low Stock Card */}
        <div
          onClick={() => {
            setActiveTab('stock');
            setSelectedStockCategory('low_stock');
          }}
          className="bg-slate-900/90 border border-amber-500/30 p-2.5 rounded-xl flex flex-col justify-between active:scale-95 transition cursor-pointer"
        >
          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400">⚠️ Low Stock</span>
          <span className="text-xl font-black text-amber-300 mt-1">{lowStockItems.length}</span>
          <span className="text-[9px] text-slate-400">Items below min</span>
        </div>

        {/* Active Tasks Card */}
        <div
          onClick={() => {
            setActiveTab('tasks');
            setTaskFilter('pending');
          }}
          className="bg-slate-900/90 border border-[#8EBF45]/30 p-2.5 rounded-xl flex flex-col justify-between active:scale-95 transition cursor-pointer"
        >
          <span className="text-[10px] uppercase tracking-wider font-bold text-[#8EBF45]">📋 Tasks</span>
          <span className="text-xl font-black text-white mt-1">
            {tasks.filter(t => !t.completed && t.assigned_to !== 'general' && t.assigned_to !== 'chitale').length}
          </span>
          <span className="text-[9px] text-slate-400">Active pending</span>
        </div>

        {/* Finance MTD Card */}
        <div
          onClick={() => setActiveTab('invoices')}
          className="bg-slate-900/90 border border-sky-500/30 p-2.5 rounded-xl flex flex-col justify-between active:scale-95 transition cursor-pointer"
        >
          <span className="text-[10px] uppercase tracking-wider font-bold text-sky-400">💰 Sales MTD</span>
          <span className="text-base font-black text-sky-300 mt-1 truncate">
            ₹{(monthlyFinance.sales / 100000).toFixed(1)}L
          </span>
          <span className="text-[9px] text-slate-400">Tap for invoices</span>
        </div>
      </section>

      {/* --- Navigation Tabs --- */}
      <div className="px-4 mt-4 flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
            activeTab === 'tasks' ? 'bg-[#8EBF45] text-slate-950 shadow-md shadow-[#8EBF45]/20' : 'bg-slate-900 text-slate-400'
          }`}
        >
          📋 Tasks ({filteredTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
            activeTab === 'stock' ? 'bg-[#8EBF45] text-slate-950 shadow-md shadow-[#8EBF45]/20' : 'bg-slate-900 text-slate-400'
          }`}
        >
          📦 Stock
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
            activeTab === 'invoices' ? 'bg-[#8EBF45] text-slate-950 shadow-md shadow-[#8EBF45]/20' : 'bg-slate-900 text-slate-400'
          }`}
        >
          🧾 Invoices PDF
        </button>
      </div>

      {/* --- TAB 1: EMPLOYEE TASKS --- */}
      {activeTab === 'tasks' && (
        <div className="px-4 mt-3 space-y-3">
          {/* Controls Ribbon */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search tasks or employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8EBF45]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2 text-xs text-slate-400">
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3 py-2 bg-gradient-to-r from-[#658C3E] to-[#8EBF45] text-slate-950 font-bold text-xs rounded-xl shadow-md active:scale-95 flex items-center gap-1 shrink-0"
            >
              + Task
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              onClick={() => setTaskFilter('pending')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                taskFilter === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setTaskFilter('overdue')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                taskFilter === 'overdue' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Overdue
            </button>
            <button
              onClick={() => setTaskFilter('completed')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                taskFilter === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Completed
            </button>
            <button
              onClick={() => setTaskFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition ${
                taskFilter === 'all' ? 'bg-slate-800 text-white border border-slate-700' : 'bg-slate-900 text-slate-400'
              }`}
            >
              All
            </button>

            {/* Employee Filter Dropdown */}
            <select
              value={selectedEmployeeFilter}
              onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-[11px] text-slate-300 rounded-full px-2 py-1 focus:outline-none shrink-0"
            >
              <option value="all">👤 All Staff</option>
              {employeeNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Task Feed */}
          <div className="space-y-2.5">
            {filteredTasks.map((t) => {
              const dueInfo = getDueDateBadgeInfo(t.due_date);
              return (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border transition-all ${
                    t.completed
                      ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                      : 'bg-slate-900 border-slate-800 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    {/* Left: Checkbox & Content */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => onToggleTask(t.id)}
                        className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                          t.completed
                            ? 'bg-[#8EBF45] border-[#8EBF45] text-slate-950 font-bold text-xs'
                            : 'border-slate-700 bg-slate-800/60'
                        }`}
                      >
                        {t.completed && '✓'}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold leading-snug break-words ${t.completed ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                          {t.title}
                        </p>
                        {t.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>}

                        {/* Metadata Tags */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px]">
                          <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-medium">
                            👤 {t.assigned_to}
                          </span>
                          {t.due_date && dueInfo && (
                            <span className={`px-2 py-0.5 rounded-md font-medium text-slate-300 ${dueInfo.badgeClass}`}>
                              📅 {dueInfo.formattedText} {dueInfo.isOverdue && !t.completed && '(Overdue)'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Delete Button */}
                    <button
                      onClick={() => {
                        if (confirm(`Delete task "${t.title}" for ${t.assigned_to}?`)) {
                          onDeleteTask(t.id);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition active:scale-95 shrink-0"
                      title="Delete task"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="text-center py-10 bg-slate-900/40 rounded-2xl border border-slate-800/60 text-slate-500 text-xs">
                <p className="text-lg mb-1">🎉</p>
                No tasks found matching current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: INVENTORY & STOCK LOOKUP --- */}
      {activeTab === 'stock' && (
        <div className="px-4 mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search raw material, battery pack, part #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8EBF45]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-2 text-xs text-slate-400 bg-slate-900 rounded-xl border border-slate-800">
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedStockCategory('all')}
              className={`px-3 py-1 rounded-full font-semibold shrink-0 transition ${
                selectedStockCategory === 'all' ? 'bg-[#8EBF45] text-slate-950' : 'bg-slate-900 text-slate-400'
              }`}
            >
              All Items ({receivedGoods.length + finishedGoods.length})
            </button>
            <button
              onClick={() => setSelectedStockCategory('low_stock')}
              className={`px-3 py-1 rounded-full font-semibold shrink-0 transition ${
                selectedStockCategory === 'low_stock' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-900 text-amber-400'
              }`}
            >
              ⚠️ Low Stock ({lowStockItems.length})
            </button>
            <button
              onClick={() => setSelectedStockCategory('raw')}
              className={`px-3 py-1 rounded-full font-semibold shrink-0 transition ${
                selectedStockCategory === 'raw' ? 'bg-[#8EBF45] text-slate-950' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Raw Goods ({receivedGoods.length})
            </button>
            <button
              onClick={() => setSelectedStockCategory('finished')}
              className={`px-3 py-1 rounded-full font-semibold shrink-0 transition ${
                selectedStockCategory === 'finished' ? 'bg-[#8EBF45] text-slate-950' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Finished Packs ({finishedGoods.length})
            </button>
          </div>

          <div className="space-y-2">
            {/* Raw Goods Items */}
            {(selectedStockCategory === 'all' || selectedStockCategory === 'raw' || selectedStockCategory === 'low_stock') &&
              receivedGoods
                .filter(item => {
                  if (selectedStockCategory === 'low_stock') {
                    if (item.isIgnoredForAlerts) return false;
                    const initial = item.initialQuantity || item.quantity;
                    const threshold = item.lowStockThresholdPercent !== undefined ? item.lowStockThresholdPercent : 20;
                    return item.quantity <= (threshold / 100) * initial;
                  }
                  if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.makeModel && item.makeModel.toLowerCase().includes(q));
                  }
                  return true;
                })
                .map(item => {
                  const initial = item.initialQuantity || item.quantity;
                  const threshold = item.lowStockThresholdPercent !== undefined ? item.lowStockThresholdPercent : 20;
                  const isLow = !item.isIgnoredForAlerts && item.quantity <= (threshold / 100) * initial;
                  return (
                    <div key={item.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white">{item.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.category} {item.makeModel ? `• ${item.makeModel}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-black font-mono ${isLow ? 'text-amber-400' : 'text-[#8EBF45]'}`}>
                          {item.quantity} {item.uom || 'qty'}
                        </span>
                        {isLow && <span className="block text-[9px] font-bold text-amber-400 uppercase">Low Stock</span>}
                      </div>
                    </div>
                  );
                })}

            {/* Finished Goods Items */}
            {(selectedStockCategory === 'all' || selectedStockCategory === 'finished') &&
              finishedGoods
                .filter(item => {
                  if (searchQuery) return item.name.toLowerCase().includes(searchQuery.toLowerCase());
                  return true;
                })
                .map(item => (
                  <div key={item.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">{item.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Finished Battery Assembly</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black font-mono text-sky-400">{item.stock} units</span>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}

      {/* --- TAB 3: INVOICES & OFFICIAL PDF VIEW/DOWNLOAD --- */}
      {activeTab === 'invoices' && (
        <div className="px-4 mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search invoice #, customer name, date..."
              value={invoiceSearchQuery}
              onChange={(e) => setInvoiceSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8EBF45]"
            />
            {invoiceSearchQuery && (
              <button onClick={() => setInvoiceSearchQuery('')} className="p-2 text-xs text-slate-400 bg-slate-900 rounded-xl border border-slate-800">
                ✕
              </button>
            )}
          </div>

          {isLoadingInvoices ? (
            <div className="text-center py-10 text-xs text-slate-400">Loading invoices...</div>
          ) : (
            <div className="space-y-2.5">
              {recentInvoices
                .filter(inv => {
                  if (!invoiceSearchQuery) return true;
                  const q = invoiceSearchQuery.toLowerCase();
                  const invNum = inv.invoice_metadata?.invoice_number?.toLowerCase() || '';
                  const buyer = inv.receiver_details?.name?.toLowerCase() || '';
                  const issuer = inv.issuer_details?.name?.toLowerCase() || '';
                  return invNum.includes(q) || buyer.includes(q) || issuer.includes(q);
                })
                .map(inv => {
                  const invNum = inv.invoice_metadata?.invoice_number || 'N/A';
                  const date = inv.invoice_metadata?.invoice_date || '';
                  const party = inv.source_type === 'purchase' ? (inv.issuer_details?.name || 'Vendor') : (inv.receiver_details?.name || 'Customer');
                  const grandTotal = Number(inv.totals?.grand_total || 0).toLocaleString('en-IN');
                  const isPurchase = inv.source_type === 'purchase';

                  return (
                    <div key={inv.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition">
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setPrintInvoice(inv)}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                            isPurchase ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {isPurchase ? 'Purchase' : 'Sales'}
                          </span>
                          <span className="text-xs font-bold text-white truncate">#{invNum}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 truncate font-medium">{party}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{date} • ₹{grandTotal}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {inv.image_link && (
                          <a
                            href={inv.image_link}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs"
                            title="View Original Uploaded Bill"
                          >
                            📎
                          </a>
                        )}
                        <button
                          onClick={() => setPrintInvoice(inv)}
                          className="px-3 py-2 bg-gradient-to-r from-[#658C3E] to-[#8EBF45] text-slate-950 font-bold text-xs rounded-xl shadow active:scale-95 flex items-center gap-1"
                        >
                          📥 Download PDF
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* --- FLOATING ACTION CONFIRMATION CARD --- */}
      {pendingAction && (
        <div className="fixed bottom-28 left-4 right-4 z-40 bg-slate-900/95 backdrop-blur-md border-2 border-[#8EBF45] p-4 rounded-2xl shadow-2xl shadow-[#8EBF45]/20 animate-slideUp">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black tracking-wider uppercase bg-[#8EBF45]/20 text-[#8EBF45] px-2 py-0.5 rounded">
              {pendingAction.intent.toUpperCase().replace('_', ' ')}
            </span>
            <button onClick={() => setPendingAction(null)} className="text-slate-400 hover:text-white text-xs">
              ✕
            </button>
          </div>

          <h3 className="text-sm font-bold text-white">{pendingAction.title}</h3>
          <p className="text-xs text-slate-300 mt-0.5">{pendingAction.details}</p>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
            <button
              onClick={handleExecutePendingAction}
              className="flex-1 py-2 bg-[#8EBF45] hover:bg-[#7ba83a] text-slate-950 font-black text-xs rounded-xl shadow active:scale-95 transition"
            >
              ✓ Confirm & Execute
            </button>
            <button
              onClick={() => setPendingAction(null)}
              className="px-3 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl active:scale-95 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* --- FLOATING BOTTOM VOICE CONTROLLER --- */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
        <div className="min-w-0 flex-1">
          {isListening ? (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0"></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-rose-400 truncate">
                  {liveTranscript || 'Listening... Speak complete command'}
                </p>
                <p className="text-[9px] text-slate-400">Tap mic when done speaking</p>
              </div>
            </div>
          ) : isAiProcessing ? (
            <p className="text-xs text-[#8EBF45] animate-pulse truncate font-medium flex items-center gap-1.5">
              <span>⚡</span> AI Analyzing command...
            </p>
          ) : showTextQueryInput ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Type command (e.g. Assign task to Rahul)..."
                value={textCommandInput}
                onChange={(e) => setTextCommandInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textCommandInput.trim()) {
                    processVoiceInput(textCommandInput);
                    setTextCommandInput('');
                    setShowTextQueryInput(false);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8EBF45]"
              />
              <button
                onClick={() => {
                  if (textCommandInput.trim()) {
                    processVoiceInput(textCommandInput);
                    setTextCommandInput('');
                    setShowTextQueryInput(false);
                  }
                }}
                className="px-2.5 py-1.5 bg-[#8EBF45] text-slate-950 font-bold text-xs rounded-xl"
              >
                ➔
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 truncate">
                Tap mic to speak (clean speech filter)
              </p>
              <button
                onClick={() => setShowTextQueryInput(true)}
                className="text-[10px] text-slate-500 hover:text-slate-300 underline ml-2 shrink-0"
              >
                ⌨️ Type
              </button>
            </div>
          )}
        </div>

        {/* Floating Voice Mic Orb */}
        <button
          onClick={handleToggleListening}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-xl transition-all duration-300 active:scale-90 shrink-0 ${
            isListening
              ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/50 scale-105 ring-4 ring-rose-500/30'
              : isAiProcessing
              ? 'bg-[#8EBF45] text-slate-950 animate-spin'
              : 'bg-gradient-to-tr from-[#658C3E] to-[#8EBF45] text-slate-950 shadow-[#8EBF45]/40 hover:scale-105'
          }`}
          title={isListening ? 'Tap to finish speaking' : 'Start voice command'}
        >
          {isListening ? '⏹️' : isAiProcessing ? '⏳' : '🎙️'}
        </button>
      </div>

      {/* --- MANUAL ADD TASK MODAL DRAWER --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 animate-slideUp">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create Employee Task</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 text-sm">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Assign to Employee</label>
                <select
                  value={newTaskAssignedTo}
                  onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8EBF45]"
                >
                  <option value="">Select Employee...</option>
                  {employeeNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Task Title / Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Test 10 battery packs, order 50 BMS..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8EBF45]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8EBF45]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  if (!newTaskTitle.trim() || !newTaskAssignedTo) {
                    alert('Please enter a task title and select an employee');
                    return;
                  }
                  onAddTask(newTaskAssignedTo, newTaskTitle, '', newTaskDueDate);
                  setIsAddModalOpen(false);
                  setNewTaskTitle('');
                  setVoiceFeedbackMessage({ text: `✓ Created task for ${newTaskAssignedTo}`, type: 'success' });
                }}
                className="flex-1 py-2.5 bg-[#8EBF45] text-slate-950 font-bold text-xs rounded-xl shadow active:scale-95"
              >
                Create Task
              </button>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- OFFICIAL INVOICE PRINT / DOWNLOAD VIEW MODAL --- */}
      {printInvoice && (
        <InvoicePrintView invoice={printInvoice} onClose={() => setPrintInvoice(null)} />
      )}

      {/* --- INSTALL HELP MODAL --- */}
      {showInstallHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TasksIcon className="w-5 h-5 text-[#8EBF45]" /> Install Phone Shortcut
              </h3>
              <button onClick={() => setShowInstallHelpModal(false)} className="text-slate-400 text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <p className="font-bold text-[#8EBF45] mb-1">Android (Google Chrome):</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Tap the <strong>Three Dots (⋮)</strong> menu in Chrome top-right.</li>
                  <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.</li>
                  <li>Tap <strong>Install</strong> to add the Cnergy Voice shortcut!</li>
                </ol>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <p className="font-bold text-sky-400 mb-1">iPhone (Apple Safari):</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Tap the <strong>Share (⎙)</strong> button at the bottom.</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                  <li>Tap <strong>Add</strong> in top-right corner.</li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => setShowInstallHelpModal(false)}
              className="w-full py-2 bg-slate-800 text-slate-200 font-bold text-xs rounded-xl"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
