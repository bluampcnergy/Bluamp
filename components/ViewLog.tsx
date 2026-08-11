import React, { useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import type { LogEntry } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { ImportIcon } from './icons/ImportIcon';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { SpannerIcon } from './icons/SpannerIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

// A mapping of action names to their corresponding icons for visual distinction in the log.
const actionIcons: { [key: string]: React.ReactElement } = {
  'Added Raw Material': <PlusIcon />,
  'Updated Raw Material': <PencilIcon />,
  'Updated Storage Item': <PencilIcon />,
  'Imported Raw Materials': <ImportIcon />,
  'Imported Storage Items': <ImportIcon />,
  'Started Production': <ArrowRightIcon />,
  'Finished Production': <ArrowRightIcon />,
  'Sent to Repair': <SpannerIcon />,
  'Item Repaired': <SpannerIcon />,
  'Updated Test Results': <CheckCircleIcon />,
  'Imported Test Results': <ImportIcon />,
};

// A mapping of action names to color styles to further differentiate log entry types.
const actionColors: { [key: string]: string } = {
  'Added Raw Material': 'bg-blue-100 text-blue-800',
  'Updated Raw Material': 'bg-yellow-100 text-yellow-800',
  'Updated Storage Item': 'bg-yellow-100 text-yellow-800',
  'Imported Raw Materials': 'bg-green-100 text-green-800',
  'Imported Storage Items': 'bg-green-100 text-green-800',
  'Started Production': 'bg-indigo-100 text-indigo-800',
  'Finished Production': 'bg-green-100 text-green-800',
  'Sent to Repair': 'bg-red-100 text-red-800',
  'Item Repaired': 'bg-green-100 text-green-800',
  'Updated Test Results': 'bg-purple-100 text-purple-800',
  'Imported Test Results': 'bg-teal-100 text-teal-800',
};

interface ViewLogProps {
  logs: LogEntry[];
}

const ViewLog: React.FC<ViewLogProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customLogs, setCustomLogs] = useState<LogEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copyStatus, setCopyStatus] = useState(false);

  // Active logs source: fetched custom logs by date or standard live logs array
  const activeLogs = customLogs !== null ? customLogs : logs;

  // Memoize the filtered & sorted logs to prevent re-calculation on every render
  const filteredLogs = useMemo(() => {
    let result = [...activeLogs];

    // Filter by Start Date
    if (startDate) {
      const startMs = new Date(startDate + 'T00:00:00').getTime();
      result = result.filter(log => {
        const logTime = typeof log.timestamp === 'number' ? log.timestamp : new Date(log.timestamp).getTime();
        return logTime >= startMs;
      });
    }

    // Filter by End Date
    if (endDate) {
      const endMs = new Date(endDate + 'T23:59:59.999').getTime();
      result = result.filter(log => {
        const logTime = typeof log.timestamp === 'number' ? log.timestamp : new Date(log.timestamp).getTime();
        return logTime <= endMs;
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const lowercasedFilter = searchTerm.toLowerCase();
      result = result.filter(log =>
        (log.action || '').toLowerCase().includes(lowercasedFilter) ||
        (log.details || '').toLowerCase().includes(lowercasedFilter) ||
        (log.username || (log as any).user || '').toLowerCase().includes(lowercasedFilter)
      );
    }

    // Sort logs by timestamp descending (Latest first)
    return result.sort((a, b) => {
      const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }, [activeLogs, startDate, endDate, searchTerm]);

  // Manually load logs from database for a selected date range
  const handleFetchLogsByDate = async (overrideStart?: string, overrideEnd?: string) => {
    const sDate = overrideStart !== undefined ? overrideStart : startDate;
    const eDate = overrideEnd !== undefined ? overrideEnd : endDate;

    if (!sDate && !eDate) {
      alert("Please select a Start Date or End Date to query logs.");
      return;
    }

    setIsLoading(true);
    setStatusMessage('');

    try {
      let query = supabase.from('logs').select('*');

      if (sDate) {
        const startMs = new Date(sDate + 'T00:00:00').getTime();
        query = query.gte('timestamp', startMs);
      }

      if (eDate) {
        const endMs = new Date(eDate + 'T23:59:59.999').getTime();
        query = query.lte('timestamp', endMs);
      }

      const { data, error } = await query.order('timestamp', { ascending: false }).limit(2000);

      if (error) throw error;

      const mappedData: LogEntry[] = (data || []).map((item: any) => ({
        id: item.id,
        action: item.action || 'Activity',
        details: item.details || '',
        username: item.username || item.user || 'Unknown',
        timestamp: typeof item.timestamp === 'number' ? item.timestamp : new Date(item.timestamp).getTime() || Date.now(),
      }));

      setCustomLogs(mappedData);
      setStatusMessage(`Fetched ${mappedData.length} activity log entry(s) from database for specified date range.`);
    } catch (err: any) {
      console.error('Error fetching logs by date:', err);
      setStatusMessage(`Failed to query database logs: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick preset helper
  const handleApplyPreset = (preset: 'today' | 'yesterday' | 'this_month') => {
    const now = new Date();
    let s = '';
    let e = '';

    if (preset === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      s = todayStr;
      e = todayStr;
    } else if (preset === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      s = yStr;
      e = yStr;
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      s = firstDay.toISOString().split('T')[0];
      e = now.toISOString().split('T')[0];
    }

    setStartDate(s);
    setEndDate(e);
    handleFetchLogsByDate(s, e);
  };

  // Reset to live memory feed
  const handleResetFeed = () => {
    setStartDate('');
    setEndDate('');
    setCustomLogs(null);
    setStatusMessage('');
  };

  const handleCopyDailyLog = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyLogs = filteredLogs.filter(log => {
      const logTime = typeof log.timestamp === 'number' ? log.timestamp : new Date(log.timestamp).getTime();
      return logTime >= today.getTime();
    });

    if (dailyLogs.length === 0) {
      alert("No log entries for today in the current view.");
      return;
    }

    const logText = dailyLogs
      .map(l => `${new Date(l.timestamp).toLocaleString()}\t${l.username}\t${l.action}\t${l.details}`)
      .join('\n');

    navigator.clipboard.writeText(logText).then(() => {
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2000);
    }, (err) => {
      console.error('Could not copy text: ', err);
      alert('Failed to copy daily log.');
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Activity Log</h1>
          <p className="text-xs text-gray-500">View, search, and manually query activity logs based on date range.</p>
        </div>
        <div className="flex gap-2">
          {customLogs !== null && (
            <button
              onClick={handleResetFeed}
              className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            >
              Reset to Live Feed
            </button>
          )}
          <button
            onClick={handleCopyDailyLog}
            className="bg-gray-800 text-white hover:bg-gray-900 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs"
          >
            {copyStatus ? '✓ Copied!' : 'Copy Daily Log'}
          </button>
        </div>
      </div>

      {/* Date Picker & Controls Card */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
            📅 Manual Log Query by Date
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 font-medium">Quick Presets:</span>
            <button
              type="button"
              onClick={() => handleApplyPreset('today')}
              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-semibold"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('yesterday')}
              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-semibold"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('this_month')}
              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-semibold"
            >
              This Month
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="sm:col-span-4 flex gap-2">
            <button
              type="button"
              onClick={() => handleFetchLogsByDate()}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isLoading ? (
                <span className="animate-spin text-sm">⏳</span>
              ) : (
                <span>🔍</span>
              )}
              {isLoading ? 'Querying...' : 'Load Logs by Date'}
            </button>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleResetFeed}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-xs font-semibold"
                title="Clear date filter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg font-medium">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-sm">
          🔍
        </div>
        <input
          type="text"
          placeholder="Filter logs by action, details, or username..."
          className="block w-full p-3 pl-9 border border-gray-300 rounded-lg shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Log Entries List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center text-xs text-gray-500 font-semibold">
          <span>Showing {filteredLogs.length} Log Entry(s)</span>
          {customLogs !== null && <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-bold">Database Query Active</span>}
        </div>
        <ul className="divide-y divide-gray-200 max-h-[650px] overflow-y-auto">
          {filteredLogs.map(log => (
            <li key={log.id} className="p-4 flex items-start space-x-4 hover:bg-gray-50 transition-colors">
              <div className={`flex-shrink-0 p-2 rounded-full ${actionColors[log.action] || 'bg-gray-100 text-gray-800'}`}>
                {actionIcons[log.action] || <div className="h-5 w-5 flex items-center justify-center font-bold text-xs">📋</div>}
              </div>
              <div className="flex-grow">
                <div className="flex justify-between items-baseline">
                  <div>
                    <p className="font-semibold text-gray-800">{log.action}</p>
                    <p className="text-xs text-gray-500">by <span className="font-medium text-gray-700">{log.username || (log as any).user || 'System'}</span></p>
                  </div>
                  <p className="text-xs text-gray-500 flex-shrink-0 ml-4 font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {/* Parse details to highlight critical alerts like quantity changes */}
                  {log.details.split(/(\[QUANTITY CHANGED:.*?\])/g).map((part, i) =>
                    part.startsWith('[QUANTITY CHANGED') ?
                      <span key={i} className="font-bold text-red-600 bg-red-50 px-1 rounded border border-red-200 text-xs ml-1">{part}</span> :
                      part
                  )}
                </div>
              </div>
            </li>
          ))}
          {filteredLogs.length === 0 && (
            <li className="p-8 text-center text-gray-500 text-sm">
              {activeLogs.length > 0 ? "No log entries match your search/date filters." : "No log entries found for this selection."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default ViewLog;
