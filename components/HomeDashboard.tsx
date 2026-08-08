import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { ReceivedGood, WIPItem, FinishedGood, Recipe, SupplyRecord, LogEntry, View, ExtractedInvoice, Expense, EmployeeTask } from '../types';
import { getDueDateBadgeInfo } from '../utils';
import { getLowStockAlerts } from '../utils/stockAlerts';

interface HomeDashboardProps {
    receivedGoods: ReceivedGood[];
    wipItems: WIPItem[];
    finishedGoods: FinishedGood[];
    recipes: Recipe[];
    suppliesRecords: SupplyRecord[];
    logs: LogEntry[];
    currentUser: { username: string; role: 'admin' | 'user' | 'billing' | 'dashboard_user' } | null;
    setView: (view: View) => void;
    employeeTasks?: EmployeeTask[];
    onToggleTask?: (taskId: string) => void;
}

// Utility: human readable time ago
const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
};

const isToday = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const HomeDashboard: React.FC<HomeDashboardProps> = ({
    receivedGoods, wipItems, finishedGoods, recipes, suppliesRecords, logs, currentUser, setView, employeeTasks = [], onToggleTask
}) => {
    // Fetch invoice & expense counts from Supabase (they aren't passed as props)
    const [invoiceStats, setInvoiceStats] = useState({ total: 0, today: 0, thisWeek: 0, totalValue: 0, todayValue: 0 });
    const [expenseStats, setExpenseStats] = useState({ total: 0, today: 0, todayAmount: 0 });
    const [recentInvoices, setRecentInvoices] = useState<ExtractedInvoice[]>([]);
    const [isPostingSlack, setIsPostingSlack] = useState(false);
    const [slackToast, setSlackToast] = useState<string | null>(null);

    const handleSendSlackTasks = async () => {
        setIsPostingSlack(true);
        setSlackToast(null);
        try {
            const res = await fetch('/api/slack-daily-tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: 'all' })
            });
            const data = await res.json();
            if (data.success && !data.warning) {
                setSlackToast('✅ Posted to Slack!');
            } else if (data.warning) {
                setSlackToast(`⚠️ ${data.warning}`);
            } else {
                setSlackToast(`❌ ${data.error || 'Failed'}`);
            }
        } catch (err: any) {
            setSlackToast(`❌ Error: ${err.message}`);
        } finally {
            setIsPostingSlack(false);
            setTimeout(() => setSlackToast(null), 5000);
        }
    };

    useEffect(() => {
        const fetch = async () => {
            const todayStr = new Date().toISOString().split('T')[0];
            const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

            // Invoices: Get total count via head query, fetch recent 50 for stats & recent list
            const { count: totalInvCount } = await supabase.from('invoices').select('id', { count: 'exact', head: true });
            const { data: recentInv } = await supabase.from('invoices')
                .select('id, created_at, totals, document_type, invoice_metadata, receiver_details, issuer_details')
                .order('created_at', { ascending: false })
                .limit(50);

            if (recentInv) {
                const today = recentInv.filter((i: any) => i.created_at?.startsWith(todayStr));
                const week = recentInv.filter((i: any) => i.created_at && i.created_at >= weekAgoStr);
                const totalVal = recentInv.reduce((s: number, i: any) => s + (i.totals?.grand_total || 0), 0);
                const todayVal = today.reduce((s: number, i: any) => s + (i.totals?.grand_total || 0), 0);
                setInvoiceStats({ total: totalInvCount || recentInv.length, today: today.length, thisWeek: week.length, totalValue: totalVal, todayValue: todayVal });
                setRecentInvoices(recentInv.slice(0, 5) as ExtractedInvoice[]);
            }

            // Expenses: Get total count via head query, fetch recent 50
            const { count: totalExpCount } = await supabase.from('expenses').select('id', { count: 'exact', head: true });
            const { data: recentExp } = await supabase.from('expenses')
                .select('id, date, amount, type')
                .order('date', { ascending: false })
                .limit(50);

            if (recentExp) {
                const todayExp = recentExp.filter((e: any) => e.date === todayStr);
                const todayAmt = todayExp.reduce((s: number, e: any) => s + (e.type === 'debit' ? (e.amount || 0) : 0), 0);
                setExpenseStats({ total: totalExpCount || recentExp.length, today: todayExp.length, todayAmount: todayAmt });
            }
        };
        fetch();
    }, []);

    // Filter out dummy test accounts (general, chitale)
    const validEmployeeTasks = useMemo(() => {
        return employeeTasks.filter(t => t.assigned_to !== 'chitale' && t.assigned_to !== 'general');
    }, [employeeTasks]);

    // Low stock alerts memoization
    const lowStockAlerts = useMemo(() => getLowStockAlerts(receivedGoods), [receivedGoods]);

    // Operations KPIs
    const ops = useMemo(() => {
        const rmTotal = receivedGoods.length;
        const rmTotalQty = receivedGoods.reduce((s, r) => s + r.quantity, 0);
        const rmToday = receivedGoods.filter(r => isToday(r.timestamp)).length;

        const wipTotal = wipItems.length;
        const wipTotalQty = wipItems.reduce((s, w) => s + w.quantity, 0);
        const wipToday = wipItems.filter(w => isToday(w.timestamp)).length;

        const fgTotal = finishedGoods.length;
        const fgTotalQty = finishedGoods.reduce((s, f) => s + f.quantity, 0);
        const fgToday = finishedGoods.filter(f => isToday(f.timestamp)).length;
        const fgDelivered = finishedGoods.filter(f => f.unitDeliveries && Object.keys(f.unitDeliveries).length > 0).length;

        const supInward = suppliesRecords.filter(s => s.direction === 'inward').length;
        const supOutward = suppliesRecords.filter(s => s.direction === 'outward').length;
        const supToday = suppliesRecords.filter(s => isToday(s.timestamp)).length;

        return { rmTotal, rmTotalQty, rmToday, wipTotal, wipTotalQty, wipToday, fgTotal, fgTotalQty, fgToday, fgDelivered, supInward, supOutward, supToday };
    }, [receivedGoods, wipItems, finishedGoods, suppliesRecords]);

    // Recent activity timeline
    const recentLogs = useMemo(() => {
        return [...logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
    }, [logs]);

    const greeting = useMemo(() => {
        const h = new Date().getHours();
        if (h < 12) return 'Good Morning';
        if (h < 17) return 'Good Afternoon';
        return 'Good Evening';
    }, []);

    const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const quickLinks: { label: string; view: View; icon: string; color: string }[] = [
        { label: 'Raw Materials', view: 'received', icon: '📦', color: 'from-amber-500/20 to-orange-500/20 border-amber-400/40' },
        { label: 'Work in Progress', view: 'wip', icon: '⚙️', color: 'from-blue-500/20 to-cyan-500/20 border-blue-400/40' },
        { label: 'Finished Goods', view: 'finished', icon: '✅', color: 'from-green-500/20 to-emerald-500/20 border-green-400/40' },
        { label: 'Invoice Maker', view: 'finance_maker' as View, icon: '🧾', color: 'from-purple-500/20 to-violet-500/20 border-purple-400/40' },
        { label: 'Help Guide', view: 'help', icon: '📖', color: 'from-teal-500/20 to-emerald-500/20 border-teal-400/40' },
        { label: 'AI Assistant', view: 'ai_assistant', icon: '✨', color: 'from-indigo-500/20 to-blue-500/20 border-indigo-400/40' },
    ];

    const formatCurrency = (val: number) => '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 0 });

    const actionIcon = (action: string) => {
        if (action.includes('Added') || action.includes('Created') || action.includes('Received')) return '➕';
        if (action.includes('Delivered') || action.includes('Shipped')) return '🚚';
        if (action.includes('Started') || action.includes('Production')) return '⚙️';
        if (action.includes('Tested') || action.includes('Test')) return '🧪';
        if (action.includes('Deleted') || action.includes('Removed')) return '🗑️';
        if (action.includes('Invoice') || action.includes('Saved')) return '📄';
        return '📝';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header greeting */}
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                    {greeting}, <span className="text-[#658C3E]">{currentUser?.username?.split('@')[0] || 'User'}</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1 font-medium">{todayStr}</p>
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {quickLinks.map(link => (
                    <button
                        key={link.view}
                        onClick={() => setView(link.view)}
                        className={`bg-gradient-to-br ${link.color} border rounded-xl p-3 text-center hover:scale-105 transition-all duration-200 hover:shadow-lg group`}
                    >
                        <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">{link.icon}</div>
                        <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider leading-tight">{link.label}</div>
                    </button>
                ))}
            </div>

            {/* EMPLOYEE TO-DO & TASKS SECTION (MOVED TO TOP) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-[#8EBF45] rounded-full"></span>
                            {currentUser?.role === 'admin' ? 'All Employee To-Do Tasks' : 'My Assigned To-Do List'}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            {currentUser?.role === 'admin'
                                ? 'Consolidated operational tasks assigned to active team members.'
                                : 'Your assigned operational action items.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {slackToast && (
                            <span className="text-[11px] font-bold px-2 py-1 bg-slate-100 rounded border border-slate-200 text-slate-800">
                                {slackToast}
                            </span>
                        )}
                        <button
                            onClick={handleSendSlackTasks}
                            disabled={isPostingSlack}
                            className="px-3 py-1.5 bg-[#4A154B] hover:bg-[#3F0E40] text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                            title="Post pending employee tasks to Slack channel"
                        >
                            <span>📢 Post to Slack</span>
                        </button>
                        <button
                            onClick={() => setView('employee_tasks')}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                            <span>Manage Tasks</span>
                            <span>→</span>
                        </button>
                    </div>
                </div>

                {/* NON-ADMIN EMPLOYEE VIEW: PERSONAL TASK LIST */}
                {currentUser?.role !== 'admin' ? (
                    (() => {
                        let myTasks = validEmployeeTasks.filter(t => 
                            t.assigned_to === currentUser?.username || 
                            t.assigned_to === 'all'
                        );
                        if (myTasks.length === 0 && validEmployeeTasks.length > 0) {
                            myTasks = validEmployeeTasks;
                        }
                        const completedCount = myTasks.filter(t => t.completed).length;
                        const progress = myTasks.length > 0 ? Math.round((completedCount / myTasks.length) * 100) : 0;

                        return (
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-bold text-slate-700">Task Completion Status</div>
                                        <div className="text-xs text-slate-500">{completedCount} of {myTasks.length} tasks completed</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#8EBF45] rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                        </div>
                                        <span className="text-xs font-black text-slate-800">{progress}%</span>
                                    </div>
                                </div>

                                {myTasks.length === 0 ? (
                                    <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-xs text-slate-400 font-medium">✨ You have no pending tasks assigned!</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {myTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={`p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                                                    task.completed
                                                        ? 'bg-slate-50/70 border-slate-200 opacity-70'
                                                        : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={task.completed}
                                                    onChange={() => onToggleTask && onToggleTask(task.id)}
                                                    className="mt-0.5 w-4 h-4 text-[#8EBF45] rounded border-slate-300 focus:ring-[#8EBF45] cursor-pointer"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-bold ${task.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                                        {task.title}
                                                    </p>
                                                    {task.description && (
                                                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-2 text-[10px]">
                                                        {(() => {
                                                            const badge = getDueDateBadgeInfo(task.due_date);
                                                            if (!badge) return null;
                                                            return (
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                                                                    task.completed ? 'bg-slate-100 text-slate-400 border border-slate-200' : badge.badgeClass
                                                                }`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${task.completed ? 'bg-slate-300' : badge.dotColor}`}></span>
                                                                    <span>📅 {badge.dayOfWeek}, {badge.ddmmyy}</span>
                                                                </span>
                                                            );
                                                        })()}
                                                        <span className="text-slate-400">By: {task.created_by}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })()
                ) : (
                    /* ADMIN VIEW: CONSOLIDATED ALL EMPLOYEE TASKS */
                    (() => {
                        const totalCount = validEmployeeTasks.length;
                        const totalDone = validEmployeeTasks.filter(t => t.completed).length;

                        // Group tasks by employee username
                        const empNames = Array.from(new Set(validEmployeeTasks.map(t => t.assigned_to)));

                        return (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Total Tasks</div>
                                        <div className="text-lg font-black text-slate-900">{totalCount}</div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Completed</div>
                                        <div className="text-lg font-black text-[#658C3E]">{totalDone}</div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Active Employees</div>
                                        <div className="text-lg font-black text-blue-600">{empNames.length}</div>
                                    </div>
                                </div>

                                {validEmployeeTasks.length === 0 ? (
                                    <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-xs text-slate-400 font-medium">No tasks assigned yet across employees.</p>
                                        <button
                                            onClick={() => setView('employee_tasks')}
                                            className="mt-2 text-xs font-bold text-[#658C3E] hover:underline"
                                        >
                                            + Go to Employee Tasks to assign tasks
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {empNames.map(emp => {
                                            const tasksForEmp = validEmployeeTasks.filter(t => t.assigned_to === emp);
                                            const doneForEmp = tasksForEmp.filter(t => t.completed).length;
                                            return (
                                                <div key={emp} className="bg-slate-50/70 rounded-xl border border-slate-200 p-3.5 space-y-2">
                                                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                                        <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                                            <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                                                                {String(emp).charAt(0).toUpperCase()}
                                                            </span>
                                                            {emp}
                                                        </span>
                                                        <span className="text-[11px] font-bold text-slate-500">
                                                            {doneForEmp}/{tasksForEmp.length} Done
                                                        </span>
                                                    </div>
                                                    <ul className="space-y-1.5 pt-1">
                                                        {tasksForEmp.map(t => (
                                                            <li key={t.id} className="flex items-center justify-between text-xs gap-2">
                                                                <label className="flex items-center gap-2 cursor-pointer truncate flex-1 min-w-0">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={t.completed}
                                                                        onChange={() => onToggleTask && onToggleTask(t.id)}
                                                                        className="w-3.5 h-3.5 text-[#8EBF45] rounded border-slate-300 focus:ring-[#8EBF45]"
                                                                    />
                                                                    <span className={`truncate ${t.completed ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                                                                        {t.title}
                                                                    </span>
                                                                </label>
                                                                {(() => {
                                                                    const badge = getDueDateBadgeInfo(t.due_date);
                                                                    if (!badge) return null;
                                                                    return (
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium ${
                                                                            t.completed ? 'bg-slate-100 text-slate-400' : badge.badgeClass
                                                                        }`}>
                                                                            {badge.dayOfWeek}, {badge.ddmmyy}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })()
                )}
            </div>



            {/* KPI Cards - Operations */}
            <div>
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#8EBF45] rounded-full"></span>
                    Operations Overview
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Raw Materials */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView('received')}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Raw Materials</p>
                                <p className="text-3xl font-black text-slate-900 mt-1">{ops.rmTotal}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{ops.rmTotalQty.toLocaleString()} total units</p>
                            </div>
                            <div className="text-3xl opacity-60">📦</div>
                        </div>
                        {ops.rmToday > 0 && (
                            <div className="mt-3 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full px-2.5 py-1 inline-block">
                                +{ops.rmToday} today
                            </div>
                        )}
                    </div>

                    {/* WIP */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView('wip')}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Production</p>
                                <p className="text-3xl font-black text-slate-900 mt-1">{ops.wipTotal}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{ops.wipTotalQty.toLocaleString()} batches</p>
                            </div>
                            <div className="text-3xl opacity-60">⚙️</div>
                        </div>
                        {ops.wipToday > 0 && (
                            <div className="mt-3 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full px-2.5 py-1 inline-block">
                                +{ops.wipToday} today
                            </div>
                        )}
                    </div>

                    {/* Finished Goods */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView('finished')}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Finished Goods</p>
                                <p className="text-3xl font-black text-slate-900 mt-1">{ops.fgTotal}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{ops.fgTotalQty.toLocaleString()} units built</p>
                            </div>
                            <div className="text-3xl opacity-60">✅</div>
                        </div>
                        <div className="mt-3 flex gap-2">
                            {ops.fgToday > 0 && (
                                <div className="bg-green-50 text-green-700 text-[10px] font-bold rounded-full px-2.5 py-1 inline-block">
                                    +{ops.fgToday} today
                                </div>
                            )}
                            {ops.fgDelivered > 0 && (
                                <div className="bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full px-2.5 py-1 inline-block">
                                    {ops.fgDelivered} delivered
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Supplies */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView('supplies')}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplies</p>
                                <p className="text-3xl font-black text-slate-900 mt-1">{ops.supInward + ops.supOutward}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{ops.supInward}↓ in · {ops.supOutward}↑ out</p>
                            </div>
                            <div className="text-3xl opacity-60">🚚</div>
                        </div>
                        {ops.supToday > 0 && (
                            <div className="mt-3 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-full px-2.5 py-1 inline-block">
                                +{ops.supToday} today
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Cards - Finance (Admin/Billing only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'billing') && (
                <div>
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#658C3E] rounded-full"></span>
                        Finance Summary
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Invoices Total */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView(currentUser?.role === 'admin' ? 'finance_dashboard' as View : 'finance_maker' as View)}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Invoices</p>
                                    <p className="text-3xl font-black text-slate-900 mt-1">{invoiceStats.total}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(invoiceStats.totalValue)}</p>
                                </div>
                                <div className="text-3xl opacity-60">🧾</div>
                            </div>
                            {invoiceStats.today > 0 && (
                                <div className="mt-3 bg-green-50 text-green-700 text-[10px] font-bold rounded-full px-2.5 py-1 inline-block">
                                    +{invoiceStats.today} today ({formatCurrency(invoiceStats.todayValue)})
                                </div>
                            )}
                        </div>

                        {/* This Week */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">This Week</p>
                                    <p className="text-3xl font-black text-[#658C3E] mt-1">{invoiceStats.thisWeek}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">invoices processed</p>
                                </div>
                                <div className="text-3xl opacity-60">📊</div>
                            </div>
                        </div>

                        {/* Expenses Today */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setView('finance_expenses' as View)}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expenses Today</p>
                                    <p className="text-3xl font-black text-red-600 mt-1">{expenseStats.today}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(expenseStats.todayAmount)} spent</p>
                                </div>
                                <div className="text-3xl opacity-60">💸</div>
                            </div>
                        </div>

                        {/* Total Expenses */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Entries</p>
                                    <p className="text-3xl font-black text-slate-900 mt-1">{expenseStats.total}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">expense records</p>
                                </div>
                                <div className="text-3xl opacity-60">📋</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Section: Recent Activity + Recent Invoices */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                            Recent Activity
                        </h3>
                        <button onClick={() => setView('log')} className="text-[10px] font-bold text-[#658C3E] hover:underline uppercase tracking-wider">
                            View All →
                        </button>
                    </div>
                    {recentLogs.length === 0 ? (
                        <p className="text-sm text-slate-400 italic py-4 text-center">No activity recorded yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {recentLogs.map((log, idx) => (
                                <div key={log.id || idx} className="flex items-start gap-3 group">
                                    <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-sm flex-shrink-0 group-hover:bg-[#8EBF45]/10 transition-colors">
                                        {actionIcon(log.action)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">{log.action}</p>
                                        <p className="text-xs text-slate-500 truncate">{log.details}</p>
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium flex-shrink-0 mt-0.5">
                                        {timeAgo(log.timestamp)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Invoices (Admin/Billing only) */}
                {(currentUser?.role === 'admin' || currentUser?.role === 'billing') ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-[#8EBF45] rounded-full"></span>
                                Recent Documents
                            </h3>
                            {currentUser?.role === 'admin' && (
                                <button onClick={() => setView('finance_dashboard' as View)} className="text-[10px] font-bold text-[#658C3E] hover:underline uppercase tracking-wider">
                                    Dashboard →
                                </button>
                            )}
                        </div>
                        {recentInvoices.length === 0 ? (
                            <p className="text-sm text-slate-400 italic py-4 text-center">No invoices saved yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {recentInvoices.map((inv, idx) => (
                                    <div key={(inv as any).id || idx} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                                        <div className="w-8 h-8 bg-[#8EBF45]/10 rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                                            {inv.document_type?.includes('po') ? '📋' : inv.document_type?.includes('quotation') ? '📝' : '🧾'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">
                                                {inv.invoice_metadata?.invoice_number || inv.filename || 'Untitled'}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {(inv.receiver_details as any)?.name || (inv.issuer_details as any)?.name || '—'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-sm font-black text-slate-900">{formatCurrency(inv.totals?.grand_total || 0)}</p>
                                            <p className="text-[10px] text-slate-400">{inv.invoice_metadata?.invoice_date || ''}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* For general employees: Production Pipeline */
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                            Production Pipeline
                        </h3>
                        <div className="flex items-center justify-between py-6">
                            <div className="text-center flex-1">
                                <div className="text-2xl mb-1">📦</div>
                                <p className="text-2xl font-black text-slate-900">{ops.rmTotal}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Raw</p>
                            </div>
                            <div className="text-slate-300 text-2xl">→</div>
                            <div className="text-center flex-1">
                                <div className="text-2xl mb-1">⚙️</div>
                                <p className="text-2xl font-black text-slate-900">{ops.wipTotal}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">WIP</p>
                            </div>
                            <div className="text-slate-300 text-2xl">→</div>
                            <div className="text-center flex-1">
                                <div className="text-2xl mb-1">✅</div>
                                <p className="text-2xl font-black text-slate-900">{ops.fgTotal}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Finished</p>
                            </div>
                            <div className="text-slate-300 text-2xl">→</div>
                            <div className="text-center flex-1">
                                <div className="text-2xl mb-1">🚚</div>
                                <p className="text-2xl font-black text-slate-900">{ops.fgDelivered}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Shipped</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HomeDashboard;
