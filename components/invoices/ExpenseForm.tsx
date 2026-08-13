
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { Expense } from '../../types';
import { Loader2, PlusCircle, CheckCircle, Trash2 } from './Icons';

interface ExpenseFormProps {
    currentUser: { username: string; role?: string } | null;
    addLogEntry?: (action: string, details: string) => void;
}

const CATEGORIES = [
    'Travel & Commute',
    'Food & Dining',
    'Office Supplies',
    'Software Subscriptions',
    'Marketing',
    'Maintenance',
    'Salary Advance',
    'Reimbursement',
    'Other'
];

const ExpenseForm: React.FC<ExpenseFormProps> = ({ currentUser, addLogEntry }) => {
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [success, setSuccess] = useState(false);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [showForm, setShowForm] = useState(false);

    // Filters
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');

    const [formData, setFormData] = useState({
        employeeName: currentUser?.username || '',
        date: new Date().toISOString().split('T')[0],
        type: 'debit' as 'debit' | 'credit',
        category: 'Travel & Commute',
        description: '',
        amount: '',
        imageLink: ''
    });

    const fetchExpenses = useCallback(async () => {
        setFetching(true);
        try {
            let query = supabase
                .from('expenses')
                .select('*')
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(500);

            if (filterEmployee) {
                query = query.ilike('employee_name', `%${filterEmployee}%`);
            }
            if (filterDateStart) {
                query = query.gte('date', filterDateStart);
            }
            if (filterDateEnd) {
                query = query.lte('date', filterDateEnd);
            }

            const { data, error } = await query;
            if (error) throw error;
            setExpenses((data || []) as Expense[]);
        } catch (err: any) {
            console.error('Error fetching expenses:', err.message);
        } finally {
            setFetching(false);
        }
    }, [filterEmployee, filterDateStart, filterDateEnd]);

    useEffect(() => {
        const timer = setTimeout(() => fetchExpenses(), 300);
        return () => clearTimeout(timer);
    }, [fetchExpenses]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const amount = parseFloat(formData.amount);
            if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');

            const payload = {
                id: `exp-${Date.now()}`,
                employee_name: formData.employeeName,
                date: formData.date,
                type: formData.type,
                category: formData.category,
                description: formData.description,
                amount: amount,
                image_link: formData.imageLink || null,
                created_by: currentUser?.username || 'system'
            };

            const { error } = await supabase.from('expenses').insert([payload]);
            if (error) throw error;

            if (addLogEntry) {
                addLogEntry('Recorded Expense', `Recorded ${formData.type.toUpperCase()} expense of ₹${amount} for ${formData.employeeName} (${formData.category})`);
            }

            setSuccess(true);
            setFormData({
                employeeName: formData.employeeName,
                date: new Date().toISOString().split('T')[0],
                type: 'debit',
                category: 'Travel & Commute',
                description: '',
                amount: '',
                imageLink: ''
            });
            setTimeout(() => setSuccess(false), 3000);
            fetchExpenses();
        } catch (err: any) {
            alert('Error saving expense: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this entry?')) return;
        try {
            const { error } = await supabase.from('expenses').delete().eq('id', id);
            if (error) throw error;
            if (addLogEntry) {
                addLogEntry('Deleted Expense', `Deleted expense entry ID ${id}`);
            }
            setExpenses(prev => prev.filter(e => e.id !== id));
        } catch (err: any) {
            alert('Error deleting: ' + err.message);
        }
    };

    // Group expenses by employee for balance summary
    const employeeSummaries: Record<string, { credits: number; debits: number }> = {};
    for (const exp of expenses) {
        if (!employeeSummaries[exp.employee_name]) employeeSummaries[exp.employee_name] = { credits: 0, debits: 0 };
        if (exp.type === 'credit') employeeSummaries[exp.employee_name].credits += exp.amount;
        else employeeSummaries[exp.employee_name].debits += exp.amount;
    }

    // Unique employee names for filter dropdown
    const uniqueEmployees = [...new Set(expenses.map(e => e.employee_name))].sort();

    return (
        <div className="max-w-6xl mx-auto animate-fade-in space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-[#0D0D0D] font-brand tracking-tight">Employee Expense Ledger</h2>
                    <p className="text-slate-500 text-sm">Internal credit & debit tracking for all employees.</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-[#8EBF45] text-[#0D0D0D] hover:bg-[#658C3E] hover:text-white px-6 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest shadow-lg transition-colors flex items-center gap-2"
                >
                    <PlusCircle /> {showForm ? 'Close Form' : 'New Entry'}
                </button>
            </div>

            {/* New Entry Form */}
            {showForm && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="bg-[#0D0D0D] p-5 text-white">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <PlusCircle /> Record Entry
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Debit = money spent by employee | Credit = money returned/reimbursed to company
                        </p>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        <div className="grid md:grid-cols-3 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee Name</label>
                                <input
                                    type="text" required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8EBF45] outline-none"
                                    placeholder="Employee name"
                                    value={formData.employeeName}
                                    onChange={e => setFormData({ ...formData, employeeName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                                <input
                                    type="date" required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8EBF45] outline-none"
                                    value={formData.date}
                                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: 'debit' })}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all border ${formData.type === 'debit'
                                            ? 'bg-red-50 text-red-700 border-red-300 shadow-sm'
                                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        ↗ Debit (Spent)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: 'credit' })}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all border ${formData.type === 'credit'
                                            ? 'bg-green-50 text-green-700 border-green-300 shadow-sm'
                                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        ↙ Credit (Returned)
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-3 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                                <select
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8EBF45] outline-none"
                                    value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                >
                                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (₹)</label>
                                <input
                                    type="number" required step="0.01" min="0.01"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8EBF45] outline-none font-semibold"
                                    placeholder="0.00"
                                    value={formData.amount}
                                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Invoice Image Link</label>
                                <input
                                    type="url"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8EBF45] outline-none"
                                    placeholder="https://..."
                                    value={formData.imageLink}
                                    onChange={e => setFormData({ ...formData, imageLink: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                            <textarea
                                required rows={2}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#8EBF45] outline-none"
                                placeholder="Details of the expense..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3 rounded-lg font-black uppercase tracking-widest text-[#0D0D0D] transition-all transform active:scale-95 flex items-center justify-center gap-2
                                ${success ? 'bg-[#8EBF45]' : 'bg-[#8EBF45] hover:bg-[#658C3E] hover:text-white'}
                            `}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : success ? <CheckCircle /> : <PlusCircle />}
                            {success ? 'Entry Recorded!' : `Save ${formData.type === 'debit' ? 'Debit' : 'Credit'} Entry`}
                        </button>
                    </form>
                </div>
            )}

            {/* Employee Balance Summary Cards */}
            {Object.keys(employeeSummaries).length > 0 && (
                <div>
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Employee Balances</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(employeeSummaries).map(([name, data]) => {
                            const balance = data.debits - data.credits;
                            return (
                                <div key={name} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <p className="text-sm font-bold text-[#0D0D0D] truncate">{name}</p>
                                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                                        <span>Debits: <span className="text-red-600 font-bold">₹{data.debits.toLocaleString('en-IN')}</span></span>
                                        <span>Credits: <span className="text-green-600 font-bold">₹{data.credits.toLocaleString('en-IN')}</span></span>
                                    </div>
                                    <div className={`mt-2 pt-2 border-t text-sm font-black ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-500'}`}>
                                        Outstanding: ₹{Math.abs(balance).toLocaleString('en-IN')} {balance > 0 ? '(Owed)' : balance < 0 ? '(Surplus)' : '(Settled)'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Employee</label>
                    <select
                        className="p-2 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none min-w-[160px]"
                        value={filterEmployee}
                        onChange={e => setFilterEmployee(e.target.value)}
                    >
                        <option value="">All Employees</option>
                        {uniqueEmployees.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From</label>
                    <input type="date" className="p-2 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label>
                    <input type="date" className="p-2 border border-slate-200 rounded-lg text-sm focus:border-[#8EBF45] outline-none" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
                </div>
                {(filterEmployee || filterDateStart || filterDateEnd) && (
                    <button onClick={() => { setFilterEmployee(''); setFilterDateStart(''); setFilterDateEnd(''); }} className="text-xs text-red-500 hover:text-red-700 font-bold py-2">
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Expense History Table */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-[#0D0D0D] font-bold border-b border-slate-200">
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Employee</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Description</th>
                                <th className="p-4 text-right">Amount</th>
                                <th className="p-4 text-center">Image</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {fetching ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2 text-[#8EBF45]" /> Loading ledger...</td></tr>
                            ) : expenses.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400">No expense entries found.</td></tr>
                            ) : (
                                expenses.map(exp => (
                                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 text-slate-500 whitespace-nowrap">{exp.date}</td>
                                        <td className="p-4 font-bold text-[#0D0D0D]">{exp.employee_name}</td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${exp.type === 'debit'
                                                ? 'bg-red-50 text-red-700'
                                                : 'bg-green-50 text-green-700'
                                            }`}>
                                                {exp.type === 'debit' ? '↗ Debit' : '↙ Credit'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-500">{exp.category}</td>
                                        <td className="p-4 max-w-[250px] truncate" title={exp.description}>{exp.description}</td>
                                        <td className={`p-4 text-right font-bold font-mono ${exp.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                                            {exp.type === 'debit' ? '-' : '+'}₹{exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-center">
                                            {exp.image_link ? (
                                                <a href={exp.image_link} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 text-xs font-bold underline">View</a>
                                            ) : (
                                                <span className="text-slate-300 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {(currentUser?.role === 'admin') && (
                                                <button onClick={() => handleDelete(exp.id)} className="text-red-400 hover:text-red-600 p-1" title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ExpenseForm;
