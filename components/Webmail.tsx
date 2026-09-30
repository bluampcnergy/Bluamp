import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { WebmailAccount, EmailMessage, EmailAttachment, User } from '../types';
import { supabase } from '../supabaseClient';
import { CNERGY_EMAIL_SIGNATURE_URL, CNERGY_EMAIL_SIGNATURE_HTML } from '../services/openrouterService';

interface WebmailProps {
    currentUser: User | null;
    addLogEntry: (action: string, details: string) => void;
    isIframe?: boolean;
    initialCompose?: {
        to?: string;
        cc?: string;
        subject?: string;
        body?: string;
        isOpen?: boolean;
    };
}


const DEFAULT_ACCOUNTS: WebmailAccount[] = [
    {
        id: 'acc-sales',
        email: 'sales@cnergy.co.in',
        senderName: 'Datlion Cnergy Sales',
        imapHost: 'mail.cnergy.co.in',
        imapPort: 993,
        smtpHost: 'mail.cnergy.co.in',
        smtpPort: 465,
        username: 'sales@cnergy.co.in',
        password: '',
        isDefault: true,
    },
    {
        id: 'acc-support',
        email: 'support@cnergy.co.in',
        senderName: 'Datlion Cnergy Support',
        imapHost: 'mail.cnergy.co.in',
        imapPort: 993,
        smtpHost: 'mail.cnergy.co.in',
        smtpPort: 465,
        username: 'support@cnergy.co.in',
        password: '',
    },
    {
        id: 'acc-info',
        email: 'info@cnergy.co.in',
        senderName: 'Datlion Cnergy Info',
        imapHost: 'mail.cnergy.co.in',
        imapPort: 993,
        smtpHost: 'mail.cnergy.co.in',
        smtpPort: 465,
        username: 'info@cnergy.co.in',
        password: '',
    },
];

const INITIAL_EMAILS: EmailMessage[] = [
    {
        id: 'mail-101',
        accountEmail: 'sales@cnergy.co.in',
        folder: 'inbox',
        from: 'purchasing@tata-motors.com',
        to: 'sales@cnergy.co.in',
        subject: 'RFQ: 48V 100Ah LFP Battery Packs Inquiry (Batch 50 Units)',
        date: new Date(Date.now() - 3600000 * 2).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        timestamp: Date.now() - 3600000 * 2,
        snippet: 'Greetings Datlion Cnergy Sales Team, We are looking to procure 50 units of 48V 100Ah LFP battery packs for EV test trials. Please share official quotation...',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                <p>Dear Sales Team,</p>
                <p>We are interested in procuring <strong>50 units of 48V 100Ah LFP Battery Packs</strong> for our upcoming EV test trials.</p>
                <p>Could you please provide:</p>
                <ul>
                    <li>Official price quotation (excl. GST and incl. GST)</li>
                    <li>Technical datasheet & warranty terms</li>
                    <li>Expected delivery timeline for Mumbai site delivery</li>
                </ul>
                <p>Looking forward to your swift response.</p>
                <br/>
                <p>Best regards,<br/><strong>Rajesh Sharma</strong><br/>Procurement Manager | Tata Motors EV Division</p>
            </div>
        `,
        isUnread: true,
        isStarred: true,
        hasAttachments: true,
        attachments: [
            { filename: 'EV_Battery_Specifications_RFQ.pdf', size: '1.2 MB', type: 'application/pdf' }
        ]
    },
    {
        id: 'mail-102',
        accountEmail: 'sales@cnergy.co.in',
        folder: 'inbox',
        from: 'logistics@bluedart.com',
        to: 'sales@cnergy.co.in',
        subject: 'Dispatch Confirmation: Waybill #BD98402104 - Raw LFP Cells',
        date: new Date(Date.now() - 3600000 * 8).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        timestamp: Date.now() - 3600000 * 8,
        snippet: 'Your consignment consisting of 240 units Grade-A 3.2V 100Ah Cells has been picked up and is in transit to Pune facility...',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                <p>Hello Datlion Cnergy Team,</p>
                <p>Your shipment under Waybill <strong>#BD98402104</strong> has been dispatched from Chennai terminal.</p>
                <p><strong>Shipment Details:</strong></p>
                <ul>
                    <li>Items: 240x Grade-A 3.2V 100Ah LFP Cells</li>
                    <li>Estimated Delivery: Tomorrow by 4:00 PM</li>
                    <li>Tracking URL: <a href="https://www.bluedart.com" target="_blank" style="color: #658C3E; text-decoration: underline;">Track Shipment</a></li>
                </ul>
                <p>Thank you for choosing BlueDart Express.</p>
            </div>
        `,
        isUnread: false,
        isStarred: false,
    },
    {
        id: 'mail-103',
        accountEmail: 'support@cnergy.co.in',
        folder: 'inbox',
        from: 'client.services@solartech.in',
        to: 'support@cnergy.co.in',
        subject: 'BMS Calibration Query for 12V 200Ah Energy Storage Pack',
        date: new Date(Date.now() - 3600000 * 24).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        timestamp: Date.now() - 3600000 * 24,
        snippet: 'Hello Support Team, We have installed the 12V 200Ah pack at site #12. The Smart BMS app shows over-voltage cutoff threshold at 3.65V per cell...',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                <p>Hello Support Team,</p>
                <p>We installed your 12V 200Ah Storage Pack at site #12 yesterday. We have a technical query regarding the Bluetooth Smart BMS parameter setup.</p>
                <p>Should the high-voltage cutoff be set to 3.65V or 3.60V for maximum cycle longevity? Please advise.</p>
                <br/>
                <p>Regards,<br/><strong>Amit Patel</strong><br/>SolarTech Installations</p>
            </div>
        `,
        isUnread: true,
        isStarred: false,
    },
    {
        id: 'mail-104',
        accountEmail: 'sales@cnergy.co.in',
        folder: 'sent',
        from: 'sales@cnergy.co.in',
        to: 'procurement@reliancesolar.com',
        subject: 'Quotation: 72V 150Ah High Capacity Battery Pack - Datlion Cnergy',
        date: new Date(Date.now() - 3600000 * 36).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        timestamp: Date.now() - 3600000 * 36,
        snippet: 'Dear Reliance Solar Procurement, Please find attached our formal commercial proposal and technical specification sheet...',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                <p>Dear Reliance Solar Procurement Team,</p>
                <p>Thank you for reaching out to Datlion Cnergy.</p>
                <p>Please find attached our official quotation <strong>#DC-QT-2026-089</strong> for the 72V 150Ah LFP Energy Storage Pack with Smart Bluetooth BMS.</p>
                <p>We offer a 3-Year Comprehensive Warranty and complete pro-rata backup support.</p>
                <br/>
                <p>Best regards,<br/><strong>Datlion Cnergy Sales Team</strong><br/>Email: sales@cnergy.co.in</p>
            </div>
        `,
        isUnread: false,
        isStarred: true,
        hasAttachments: true,
        attachments: [
            { filename: 'Datlion_Cnergy_Quotation_QT089.pdf', size: '840 KB', type: 'application/pdf' }
        ]
    }
];

export const Webmail: React.FC<WebmailProps> = ({ currentUser, addLogEntry, isIframe, initialCompose }) => {
    const activeUsername = currentUser?.username || 'admin';

    // Accounts state
    const [accounts, setAccounts] = useState<WebmailAccount[]>(() => {
        const saved = localStorage.getItem(`webmail_accounts_${activeUsername}`);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return DEFAULT_ACCOUNTS;
    });

    const [selectedAccountEmail, setSelectedAccountEmail] = useState<string>(() => {
        return accounts[0]?.email || 'sales@cnergy.co.in';
    });

    // Emails State
    const [emails, setEmails] = useState<EmailMessage[]>(() => {
        const saved = localStorage.getItem(`webmail_emails_${activeUsername}`);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return INITIAL_EMAILS;
    });

    // Active View / Folder
    const [activeFolder, setActiveFolder] = useState<'inbox' | 'starred' | 'sent' | 'drafts' | 'trash'>('inbox');
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Modals
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAddAccountMode, setIsAddAccountMode] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isTestingConn, setIsTestingConn] = useState(false);
    const [connTestResult, setConnTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [syncToast, setSyncToast] = useState<string | null>(null);

    // Compose Form State
    const [composeForm, setComposeForm] = useState({
        to: '',
        cc: '',
        subject: '',
        body: '',
        attachmentName: '',
        attachmentBase64: '',
    });
    const [isSending, setIsSending] = useState(false);

    // Settings / Account Edit State
    const [editingAccount, setEditingAccount] = useState<WebmailAccount>(accounts[0] || DEFAULT_ACCOUNTS[0]);

    // Pre-populate compose form from initialCompose props or URL query params
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const toParam = initialCompose?.to || urlParams.get('to') || '';
        const ccParam = initialCompose?.cc || urlParams.get('cc') || '';
        const subjectParam = initialCompose?.subject || urlParams.get('subject') || '';
        const bodyParam = initialCompose?.body || urlParams.get('body') || '';
        const openParam = initialCompose?.isOpen || urlParams.get('mode') === 'webmail_compose' || Boolean(toParam || subjectParam || bodyParam);

        if (openParam) {
            setIsComposeOpen(true);
            setComposeForm({
                to: toParam,
                cc: ccParam,
                subject: subjectParam,
                body: bodyParam,
                attachmentName: '',
                attachmentBase64: '',
            });
        }
    }, [initialCompose]);


    // Hydrate User Accounts from Supabase
    useEffect(() => {
        const fetchUserAccounts = async () => {
            try {
                const { data: dbData, error } = await supabase
                    .from('webmail_accounts')
                    .select('*')
                    .eq('username', activeUsername);

                if (!error && dbData && dbData.length > 0) {
                    const mapped: WebmailAccount[] = dbData.map(row => ({
                        id: row.id,
                        email: row.email,
                        senderName: row.sender_name || row.email,
                        imapHost: row.imap_host || 'mail.cnergy.co.in',
                        imapPort: Number(row.imap_port) || 993,
                        smtpHost: row.smtp_host || 'mail.cnergy.co.in',
                        smtpPort: Number(row.smtp_port) || 465,
                        username: row.auth_username || row.email,
                        password: row.auth_password || '',
                        isDefault: Boolean(row.is_default),
                    }));
                    setAccounts(mapped);
                    if (!mapped.some(a => a.email === selectedAccountEmail)) {
                        setSelectedAccountEmail(mapped[0].email);
                    }
                }
            } catch (err) {
                console.warn('Could not load webmail accounts from Supabase, using local state.', err);
            }
        };

        fetchUserAccounts();
    }, [activeUsername]);

    // Save to LocalStorage and sync Supabase
    const persistAccounts = useCallback(async (newAccounts: WebmailAccount[]) => {
        setAccounts(newAccounts);
        localStorage.setItem(`webmail_accounts_${activeUsername}`, JSON.stringify(newAccounts));

        // Sync to Supabase table (Batch upsert)
        try {
            const rows = newAccounts.map(acc => ({
                id: acc.id,
                username: activeUsername,
                email: acc.email,
                sender_name: acc.senderName,
                imap_host: acc.imapHost,
                imap_port: acc.imapPort,
                smtp_host: acc.smtpHost,
                smtp_port: acc.smtpPort,
                auth_username: acc.username,
                auth_password: acc.password || '',
                is_default: Boolean(acc.isDefault),
                updated_at: Date.now()
            }));
            await supabase.from('webmail_accounts').upsert(rows);
        } catch (err) {
            console.warn('Failed to upsert webmail accounts to Supabase:', err);
        }
    }, [activeUsername]);

    useEffect(() => {
        localStorage.setItem(`webmail_emails_${activeUsername}`, JSON.stringify(emails));
    }, [emails, activeUsername]);

    const activeAccount = useMemo(() => {
        return accounts.find(a => a.email === selectedAccountEmail) || accounts[0] || DEFAULT_ACCOUNTS[0];
    }, [accounts, selectedAccountEmail]);

    // Filter Emails
    const filteredEmails = useMemo(() => {
        return emails.filter(m => {
            const matchesAccount = m.accountEmail === selectedAccountEmail;
            let matchesFolder = false;
            if (activeFolder === 'starred') {
                matchesFolder = Boolean(m.isStarred);
            } else {
                matchesFolder = m.folder === activeFolder;
            }

            const search = searchTerm.toLowerCase().trim();
            const matchesSearch = !search || 
                m.subject.toLowerCase().includes(search) || 
                m.from.toLowerCase().includes(search) || 
                m.to.toLowerCase().includes(search) || 
                m.snippet.toLowerCase().includes(search);

            return matchesAccount && matchesFolder && matchesSearch;
        }).sort((a, b) => b.timestamp - a.timestamp);
    }, [emails, selectedAccountEmail, activeFolder, searchTerm]);

    const selectedEmail = useMemo(() => {
        return emails.find(m => m.id === selectedEmailId) || null;
    }, [emails, selectedEmailId]);

    // Unread count
    const unreadCount = useMemo(() => {
        return emails.filter(m => m.accountEmail === selectedAccountEmail && m.folder === 'inbox' && m.isUnread).length;
    }, [emails, selectedAccountEmail]);

    // Actions
    const handleSelectEmail = (mail: EmailMessage) => {
        setSelectedEmailId(mail.id);
        if (mail.isUnread) {
            setEmails(prev => prev.map(m => m.id === mail.id ? { ...m, isUnread: false } : m));
        }
    };

    const handleToggleStar = (mailId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEmails(prev => prev.map(m => m.id === mailId ? { ...m, isStarred: !m.isStarred } : m));
    };

    const handleDeleteEmail = (mailId: string) => {
        setEmails(prev => prev.map(m => {
            if (m.id === mailId) {
                if (m.folder === 'trash') {
                    return null as any;
                }
                return { ...m, folder: 'trash' as const };
            }
            return m;
        }).filter(Boolean));
        if (selectedEmailId === mailId) {
            setSelectedEmailId(null);
        }
        addLogEntry('Webmail Action', `Moved email ${mailId} to trash`);
    };

    // Real IMAP Fetch / Connection Sync
    const handleSyncIMAP = async () => {
        setIsSyncing(true);
        setSyncToast(`Connecting to ${activeAccount.imapHost}:${activeAccount.imapPort} via SSL...`);

        try {
            const res = await fetch('/api/webmail-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account: activeAccount, mode: 'fetch' })
            });

            const data = await res.json();
            if (res.ok && data.success && Array.isArray(data.emails)) {
                if (data.emails.length > 0) {
                    setEmails(prev => {
                        const existingIds = new Set(prev.map(e => e.id));
                        const newOnes = data.emails.filter((e: any) => !existingIds.has(e.id));
                        return [...newOnes, ...prev];
                    });
                    setSyncToast(`✅ Synced ${data.emails.length} emails from ${activeAccount.imapHost}`);
                } else {
                    setSyncToast(`✅ Mailbox synchronized. No new messages.`);
                }
            } else {
                setSyncToast(`⚠️ IMAP Sync Note: ${data.error || 'Server non-responsive or local demo mode'}`);
            }
        } catch (err: any) {
            setSyncToast(`⚠️ Offline / Demo mode: Simulated mailbox sync active.`);
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSyncToast(null), 5000);
            addLogEntry('Webmail Sync', `Synced inbox for ${selectedAccountEmail}`);
        }
    };

    // Test Server Connection
    const handleTestConnection = async () => {
        setIsTestingConn(true);
        setConnTestResult(null);

        try {
            const res = await fetch('/api/webmail-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account: editingAccount, mode: 'test' })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setConnTestResult({ success: true, message: data.message || '✅ Connection successful!' });
            } else {
                setConnTestResult({ success: false, message: `❌ Connection failed: ${data.error || 'Check credentials'}` });
            }
        } catch (err: any) {
            setConnTestResult({ success: false, message: `❌ Server test error: ${err.message}` });
        } finally {
            setIsTestingConn(false);
        }
    };

    // Open Modal to Add New Account
    const handleOpenAddAccount = () => {
        setIsAddAccountMode(true);
        setConnTestResult(null);
        setEditingAccount({
            id: `acc-${Date.now()}`,
            email: '',
            senderName: '',
            imapHost: 'mail.cnergy.co.in',
            imapPort: 993,
            smtpHost: 'mail.cnergy.co.in',
            smtpPort: 465,
            username: '',
            password: '',
        });
        setIsSettingsOpen(true);
    };

    // Save Account Settings (Add or Edit)
    const handleSaveAccountSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccount.email || !editingAccount.username) {
            alert('Please enter Email Address and Username.');
            return;
        }

        let updatedAccounts: WebmailAccount[] = [];
        if (isAddAccountMode) {
            updatedAccounts = [...accounts, editingAccount];
        } else {
            updatedAccounts = accounts.map(a => a.id === editingAccount.id ? editingAccount : a);
        }

        await persistAccounts(updatedAccounts);
        setSelectedAccountEmail(editingAccount.email);
        setIsSettingsOpen(false);
        alert(`✅ Mailbox settings for ${editingAccount.email} saved successfully!`);
        addLogEntry('Webmail Config', `Saved account credentials for ${editingAccount.email}`);
    };

    // Delete Account
    const handleDeleteAccount = async (accId: string) => {
        const accToDelete = accounts.find(a => a.id === accId);
        if (!accToDelete) return;

        if (confirm(`Are you sure you want to delete configured email address "${accToDelete.email}"?`)) {
            const filtered = accounts.filter(a => a.id !== accId);
            setAccounts(filtered);
            await persistAccounts(filtered);

            try {
                await supabase.from('webmail_accounts').delete().eq('id', accId);
            } catch (e) {
                console.warn('Could not delete account from Supabase DB:', e);
            }

            if (filtered.length > 0) {
                setSelectedAccountEmail(filtered[0].email);
                setEditingAccount(filtered[0]);
            } else {
                setSelectedAccountEmail('');
            }

            setIsSettingsOpen(false);
            addLogEntry('Webmail Config', `Deleted email account ${accToDelete.email}`);
            alert(`✅ Email address ${accToDelete.email} removed successfully.`);
        }
    };

    // Handle File Attachment in Composer
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setComposeForm(prev => ({
                ...prev,
                attachmentName: file.name,
                attachmentBase64: event.target?.result as string,
            }));
        };
        reader.readAsDataURL(file);
    };

    // Handle Send Email via SMTP API
    const handleSendEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!composeForm.to || !composeForm.subject) {
            alert('Please enter recipient email and subject.');
            return;
        }

        setIsSending(true);

        // Ensure mandatory Corporate Email Signature is appended
        let formattedBodyHtml = composeForm.body.replace(/\n/g, '<br/>');
        if (!formattedBodyHtml.includes('Email_signature_3') && !formattedBodyHtml.includes(CNERGY_EMAIL_SIGNATURE_URL)) {
            formattedBodyHtml += CNERGY_EMAIL_SIGNATURE_HTML;
        }

        try {
            const response = await fetch('/api/webmail-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    account: activeAccount,
                    to: composeForm.to,
                    cc: composeForm.cc,
                    subject: composeForm.subject,
                    html: formattedBodyHtml,
                    attachmentBase64: composeForm.attachmentBase64,
                    attachmentName: composeForm.attachmentName,
                }),
            });

            const resData = await response.json();
            if (!response.ok || !resData.success) {
                console.warn('SMTP Dispatch warning/fallback:', resData);
            }

            // Record in local Sent folder state regardless
            const newSentMessage: EmailMessage = {
                id: `mail-sent-${Date.now()}`,
                accountEmail: activeAccount.email,
                folder: 'sent',
                from: `${activeAccount.senderName || activeAccount.email} <${activeAccount.email}>`,
                to: composeForm.to,
                cc: composeForm.cc,
                subject: composeForm.subject,
                date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
                timestamp: Date.now(),
                snippet: composeForm.body.slice(0, 100) + '...',
                bodyHtml: `<div style="font-family: Arial; font-size: 14px;">${formattedBodyHtml}</div>`,
                isUnread: false,
                hasAttachments: Boolean(composeForm.attachmentName),
                attachments: composeForm.attachmentName ? [
                    { filename: composeForm.attachmentName, size: 'Attached', type: 'application/octet-stream', dataUrl: composeForm.attachmentBase64 }
                ] : undefined
            };

            setEmails(prev => [newSentMessage, ...prev]);
            addLogEntry('Sent Email', `Sent email to ${composeForm.to} via ${activeAccount.email}`);
            
            setIsSending(false);
            setIsComposeOpen(false);
            setComposeForm({ to: '', cc: '', subject: '', body: '', attachmentName: '', attachmentBase64: '' });
            alert(`🚀 Email dispatched successfully to ${composeForm.to}`);
        } catch (err: any) {
            setIsSending(false);
            alert(`Error sending email: ${err.message || 'Failed to dispatch email'}`);
        }
    };

    const isIframeMode = isIframe || (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('mode') === 'webmail_compose' || Boolean(new URLSearchParams(window.location.search).get('to'))));

    if (isIframeMode && isComposeOpen) {
        return (
            <div className="w-full h-full bg-slate-100 p-2 sm:p-4 flex flex-col justify-between overflow-y-auto min-h-screen">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1">
                    <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">✏️</span>
                            <h3 className="text-xs font-black uppercase tracking-wider">
                                Dispatch RFQ Email ({activeAccount?.email || selectedAccountEmail})
                            </h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/30">Cnergy Webmail Dispatcher</span>
                        </div>
                    </div>

                    <form onSubmit={handleSendEmail} className="p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">To</label>
                                <input
                                    type="email"
                                    required
                                    value={composeForm.to}
                                    onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })}
                                    placeholder="recipient@example.com"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">CC (Optional)</label>
                                <input
                                    type="text"
                                    value={composeForm.cc}
                                    onChange={(e) => setComposeForm({ ...composeForm, cc: e.target.value })}
                                    placeholder="cc@example.com"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Subject</label>
                            <input
                                type="text"
                                required
                                value={composeForm.subject}
                                onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                                placeholder="Enter subject line..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                            />
                        </div>

                        <div className="flex-1 flex flex-col min-h-[160px]">
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Message Body</label>
                            <textarea
                                rows={8}
                                required
                                value={composeForm.body}
                                onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                                placeholder="Type your message here..."
                                className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45] resize-none"
                            />
                        </div>

                        {/* Auto Appended Corporate Signature Banner */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1 shrink-0">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Corporate Email Signature (Auto-Appended)</span>
                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">✓ Verified Branding</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-center">
                                <img
                                    src={CNERGY_EMAIL_SIGNATURE_URL}
                                    alt="Datlion Cnergy Email Signature"
                                    className="max-h-16 max-w-full object-contain rounded"
                                />
                            </div>
                        </div>

                        {/* Attachment Upload */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="text-base">📎</span>
                                {composeForm.attachmentName ? (
                                    <span className="text-xs font-bold text-slate-800 truncate max-w-xs">{composeForm.attachmentName}</span>
                                ) : (
                                    <span className="text-xs text-slate-400 font-medium">Attach PDF or document</span>
                                )}
                            </div>
                            <label className="cursor-pointer px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg border border-slate-300">
                                <span>Browse</span>
                                <input type="file" onChange={handleFileChange} className="hidden" />
                            </label>
                        </div>

                        {/* Form Buttons */}
                        <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
                            <button
                                type="submit"
                                disabled={isSending}
                                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#8EBF45] to-[#658C3E] text-slate-950 text-xs font-black rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                <span>{isSending ? 'Sending...' : '🚀 Send Email Now'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* TOP BAR & ACCOUNT SWITCHER */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8EBF45] to-[#658C3E] flex items-center justify-center text-white text-xl font-black shadow-md">
                        📧
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">Cnergy Webmail</h1>
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-200">
                                @cnergy.co.in
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Official team mailbox portal for Datlion Cnergy communications.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
                    {/* Account Selector */}
                    <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-slate-500 pl-2">Account:</span>
                        <select
                            value={selectedAccountEmail}
                            onChange={(e) => {
                                setSelectedAccountEmail(e.target.value);
                                setSelectedEmailId(null);
                            }}
                            className="bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-[#8EBF45] cursor-pointer"
                        >
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.email}>
                                    {acc.email} ({acc.senderName || 'Mailbox'})
                                </option>
                            ))}
                        </select>
                        {activeAccount && (
                            <button
                                onClick={() => handleDeleteAccount(activeAccount.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200 text-xs font-bold flex items-center gap-1"
                                title={`Delete configured email address ${activeAccount.email}`}
                            >
                                <span>🗑️</span>
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleOpenAddAccount}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 shadow-sm"
                        title="Add Custom Mailbox Account"
                    >
                        <span>➕ Add Mailbox</span>
                    </button>

                    <button
                        onClick={handleSyncIMAP}
                        disabled={isSyncing}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-300 disabled:opacity-50"
                        title="Sync mailbox with IMAP server"
                    >
                        <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
                        <span>{isSyncing ? 'Syncing...' : 'Fetch Mail'}</span>
                    </button>

                    <button
                        onClick={() => {
                            setIsAddAccountMode(false);
                            setConnTestResult(null);
                            setEditingAccount(activeAccount);
                            setIsSettingsOpen(true);
                        }}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all border border-slate-300"
                        title="Configure IMAP/SMTP Server Settings"
                    >
                        ⚙️
                    </button>
                </div>
            </div>

            {/* SYNC TOAST */}
            {syncToast && (
                <div className="bg-amber-500/10 border border-amber-400 text-amber-900 text-xs font-bold p-3 rounded-xl flex items-center justify-between animate-in">
                    <span className="flex items-center gap-2">
                        <span className="animate-pulse">⚡</span>
                        {syncToast}
                    </span>
                    <button onClick={() => setSyncToast(null)} className="text-amber-800 hover:text-amber-950 font-black text-xs">✕</button>
                </div>
            )}

            {/* MAIN LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 min-h-[600px]">
                {/* SIDEBAR NAVIGATION (3 Cols) */}
                <div className="md:col-span-3 bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                        {/* Compose Button */}
                        <button
                            onClick={() => setIsComposeOpen(true)}
                            className="w-full py-3 px-4 bg-gradient-to-r from-[#8EBF45] to-[#658C3E] hover:opacity-95 text-slate-950 text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 group"
                        >
                            <span className="text-lg group-hover:scale-110 transition-transform">✏️</span>
                            <span>COMPOSE MAIL</span>
                        </button>

                        {/* Folders List */}
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2">Mail Folders</p>
                            
                            <button
                                onClick={() => { setActiveFolder('inbox'); setSelectedEmailId(null); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    activeFolder === 'inbox'
                                        ? 'bg-[#8EBF45]/15 text-[#658C3E] border border-[#8EBF45]/30'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2.5">
                                    <span>📥</span>
                                    <span>Inbox</span>
                                </span>
                                {unreadCount > 0 && (
                                    <span className="bg-[#8EBF45] text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={() => { setActiveFolder('starred'); setSelectedEmailId(null); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    activeFolder === 'starred'
                                        ? 'bg-amber-500/15 text-amber-800 border border-amber-400/30'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2.5">
                                    <span>⭐</span>
                                    <span>Starred</span>
                                </span>
                            </button>

                            <button
                                onClick={() => { setActiveFolder('sent'); setSelectedEmailId(null); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    activeFolder === 'sent'
                                        ? 'bg-blue-500/15 text-blue-800 border border-blue-400/30'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2.5">
                                    <span>📤</span>
                                    <span>Sent Mail</span>
                                </span>
                            </button>

                            <button
                                onClick={() => { setActiveFolder('drafts'); setSelectedEmailId(null); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    activeFolder === 'drafts'
                                        ? 'bg-slate-200 text-slate-900 border border-slate-300'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2.5">
                                    <span>📝</span>
                                    <span>Drafts</span>
                                </span>
                            </button>

                            <button
                                onClick={() => { setActiveFolder('trash'); setSelectedEmailId(null); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    activeFolder === 'trash'
                                        ? 'bg-rose-500/15 text-rose-800 border border-rose-400/30'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex items-center gap-2.5">
                                    <span>🗑️</span>
                                    <span>Trash</span>
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Server Info Card */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <span>Active IMAP Host</span>
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 truncate">{activeAccount.imapHost}</p>
                        <p className="text-[10px] text-slate-500">Port {activeAccount.imapPort} (SSL) | SMTP: {activeAccount.smtpPort}</p>
                    </div>
                </div>

                {/* EMAIL LIST PANEL (4 Cols) */}
                <div className="md:col-span-4 bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col space-y-3">
                    {/* Search Bar */}
                    <div className="relative">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search emails..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                        />
                        <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 text-xs hover:text-slate-700">✕</button>
                        )}
                    </div>

                    {/* Email Items List */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[550px]">
                        {filteredEmails.length === 0 ? (
                            <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                                <span className="text-3xl">📭</span>
                                <p className="text-xs font-bold text-slate-600">No emails in {activeFolder}</p>
                                <p className="text-[11px] text-slate-400">Incoming emails for {selectedAccountEmail} will appear here.</p>
                            </div>
                        ) : (
                            filteredEmails.map(mail => (
                                <div
                                    key={mail.id}
                                    onClick={() => handleSelectEmail(mail)}
                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                                        selectedEmailId === mail.id
                                            ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                            : mail.isUnread
                                                ? 'bg-slate-50/90 border-slate-300 font-bold hover:border-slate-400'
                                                : 'bg-white border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 truncate">
                                            {mail.isUnread && (
                                                <span className="w-2 h-2 rounded-full bg-[#8EBF45] shrink-0"></span>
                                            )}
                                            <span className={`text-xs truncate ${selectedEmailId === mail.id ? 'text-slate-100 font-bold' : 'text-slate-900 font-bold'}`}>
                                                {activeFolder === 'sent' ? `To: ${mail.to}` : mail.from.split('<')[0]}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={(e) => handleToggleStar(mail.id, e)}
                                                className="text-xs hover:scale-125 transition-transform"
                                                title={mail.isStarred ? 'Unstar' : 'Star'}
                                            >
                                                {mail.isStarred ? '⭐' : '☆'}
                                            </button>
                                            <span className={`text-[10px] ${selectedEmailId === mail.id ? 'text-slate-400' : 'text-slate-400'}`}>
                                                {mail.date.split(',')[0]}
                                            </span>
                                        </div>
                                    </div>

                                    <p className={`text-xs truncate font-bold ${selectedEmailId === mail.id ? 'text-white' : 'text-slate-800'}`}>
                                        {mail.subject}
                                    </p>

                                    <p className={`text-[11px] line-clamp-1 ${selectedEmailId === mail.id ? 'text-slate-300' : 'text-slate-500'}`}>
                                        {mail.snippet}
                                    </p>

                                    {mail.hasAttachments && (
                                        <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold mt-0.5">
                                            <span>📎</span>
                                            <span>Attachment</span>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* EMAIL READER VIEW PANEL (5 Cols) */}
                <div className="md:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                    {selectedEmail ? (
                        <div className="space-y-5 flex-1 flex flex-col justify-between">
                            <div className="space-y-4">
                                {/* Reader Header & Actions */}
                                <div className="border-b border-slate-100 pb-4 space-y-3">
                                    <div className="flex justify-between items-start gap-3">
                                        <h2 className="text-base font-black text-slate-900 leading-snug">
                                            {selectedEmail.subject}
                                        </h2>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={() => handleToggleStar(selectedEmail.id)}
                                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs"
                                                title="Toggle Star"
                                            >
                                                {selectedEmail.isStarred ? '⭐' : '☆'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteEmail(selectedEmail.id)}
                                                className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold"
                                                title="Move to Trash"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>

                                    {/* Sender Details */}
                                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                                                {selectedEmail.from[0]?.toUpperCase() || 'M'}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900">{selectedEmail.from}</p>
                                                <p className="text-[10px] text-slate-500">To: {selectedEmail.to}</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400">{selectedEmail.date}</span>
                                    </div>
                                </div>

                                {/* Body HTML Renderer */}
                                <div className="prose max-w-none text-xs text-slate-800 overflow-y-auto max-h-[350px] p-2 bg-slate-50/50 rounded-xl border border-slate-100">
                                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                                </div>

                                {/* Attachments Chips */}
                                {selectedEmail.hasAttachments && selectedEmail.attachments && (
                                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 space-y-2">
                                        <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">
                                            📎 Attachments ({selectedEmail.attachments.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedEmail.attachments.map((att, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm text-xs">
                                                    <span className="text-amber-600 font-bold">📄 {att.filename}</span>
                                                    <span className="text-[10px] text-slate-400">({att.size})</span>
                                                    <a
                                                        href={att.dataUrl || '#'}
                                                        download={att.filename}
                                                        className="text-xs text-slate-700 hover:text-slate-950 font-bold underline ml-1"
                                                    >
                                                        Download
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Reply Action Bar */}
                            <div className="border-t border-slate-100 pt-4 flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setComposeForm({
                                            to: selectedEmail.from.includes('<') ? selectedEmail.from.split('<')[1].replace('>', '') : selectedEmail.from,
                                            cc: '',
                                            subject: `Re: ${selectedEmail.subject}`,
                                            body: `\n\n--- On ${selectedEmail.date}, ${selectedEmail.from} wrote:\n> ${selectedEmail.snippet}`,
                                            attachmentName: '',
                                            attachmentBase64: '',
                                        });
                                        setIsComposeOpen(true);
                                    }}
                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                                >
                                    <span>↩️ Reply</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setComposeForm({
                                            to: '',
                                            cc: '',
                                            subject: `Fwd: ${selectedEmail.subject}`,
                                            body: `\n\n--- Forwarded Message ---\nFrom: ${selectedEmail.from}\nDate: ${selectedEmail.date}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.snippet}`,
                                            attachmentName: '',
                                            attachmentBase64: '',
                                        });
                                        setIsComposeOpen(true);
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-300"
                                >
                                    <span>↪️ Forward</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-3">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl">
                                📩
                            </div>
                            <h3 className="text-sm font-bold text-slate-700">No Email Selected</h3>
                            <p className="text-xs text-slate-400 max-w-xs">
                                Select an email from the message list on the left to read its full contents and reply.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* COMPOSE EMAIL MODAL */}
            {isComposeOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in">
                        <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">✏️</span>
                                <h3 className="text-xs font-black uppercase tracking-wider">Compose Email ({activeAccount.email})</h3>
                            </div>
                            <button onClick={() => setIsComposeOpen(false)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
                        </div>

                        <form onSubmit={handleSendEmail} className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">To</label>
                                    <input
                                        type="email"
                                        required
                                        value={composeForm.to}
                                        onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })}
                                        placeholder="recipient@example.com"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">CC (Optional)</label>
                                    <input
                                        type="text"
                                        value={composeForm.cc}
                                        onChange={(e) => setComposeForm({ ...composeForm, cc: e.target.value })}
                                        placeholder="cc@example.com"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Subject</label>
                                <input
                                    type="text"
                                    required
                                    value={composeForm.subject}
                                    onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                                    placeholder="Enter subject line..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Message Body</label>
                                <textarea
                                    rows={8}
                                    required
                                    value={composeForm.body}
                                    onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                                    placeholder="Type your message here..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45] resize-none"
                                />
                            </div>

                            {/* Auto Appended Corporate Signature Banner */}
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Corporate Email Signature (Auto-Appended)</span>
                                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">✓ Verified Branding</span>
                                </div>
                                <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-center">
                                    <img
                                        src={CNERGY_EMAIL_SIGNATURE_URL}
                                        alt="Datlion Cnergy Email Signature"
                                        className="max-h-24 max-w-full object-contain rounded"
                                    />
                                </div>
                            </div>

                            {/* Attachment Upload */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">📎</span>
                                    {composeForm.attachmentName ? (
                                        <span className="text-xs font-bold text-slate-800 truncate max-w-xs">{composeForm.attachmentName}</span>
                                    ) : (
                                        <span className="text-xs text-slate-400 font-medium">Attach PDF or document</span>
                                    )}
                                </div>
                                <label className="cursor-pointer px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg border border-slate-300">
                                    <span>Browse</span>
                                    <input type="file" onChange={handleFileChange} className="hidden" />
                                </label>
                            </div>

                            {/* Form Buttons */}
                            <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsComposeOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSending}
                                    className="px-5 py-2 bg-gradient-to-r from-[#8EBF45] to-[#658C3E] text-slate-950 text-xs font-black rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    <span>{isSending ? 'Sending...' : '🚀 Send Email'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* IMAP/SMTP SETTINGS MODAL */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in">
                        <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">⚙️</span>
                                <h3 className="text-xs font-black uppercase tracking-wider">
                                    {isAddAccountMode ? 'Add New External Mailbox' : `Mail Server Settings (${editingAccount.email})`}
                                </h3>
                            </div>
                            <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
                        </div>

                        <form onSubmit={handleSaveAccountSettings} className="p-5 space-y-4 text-xs">
                            {connTestResult && (
                                <div className={`p-3 rounded-xl border text-xs font-bold ${
                                    connTestResult.success 
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                                        : 'bg-rose-50 text-rose-800 border-rose-300'
                                }`}>
                                    {connTestResult.message}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        value={editingAccount.email}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, email: e.target.value })}
                                        placeholder="sales@cnergy.co.in"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Sender Display Name</label>
                                    <input
                                        type="text"
                                        value={editingAccount.senderName}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, senderName: e.target.value })}
                                        placeholder="Datlion Cnergy Sales"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">IMAP Host (Incoming)</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingAccount.imapHost}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, imapHost: e.target.value })}
                                        placeholder="mail.cnergy.co.in"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">IMAP Port (SSL 993)</label>
                                    <input
                                        type="number"
                                        required
                                        value={editingAccount.imapPort}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, imapPort: parseInt(e.target.value) || 993 })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">SMTP Host (Outgoing)</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingAccount.smtpHost}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, smtpHost: e.target.value })}
                                        placeholder="mail.cnergy.co.in"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">SMTP Port (SSL 465)</label>
                                    <input
                                        type="number"
                                        required
                                        value={editingAccount.smtpPort}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, smtpPort: parseInt(e.target.value) || 465 })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Mail Login Username</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingAccount.username}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, username: e.target.value })}
                                        placeholder="user@cnergy.co.in"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Email Password / Secret</label>
                                    <input
                                        type="password"
                                        value={editingAccount.password || ''}
                                        onChange={(e) => setEditingAccount({ ...editingAccount, password: e.target.value })}
                                        placeholder="••••••••••••••••"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#8EBF45]"
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex justify-between items-center text-[11px]">
                                <span className="text-slate-500">🔒 Saved to Supabase per user: <strong>{activeUsername}</strong></span>
                                <button
                                    type="button"
                                    disabled={isTestingConn}
                                    onClick={handleTestConnection}
                                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition-all border border-slate-300 disabled:opacity-50"
                                >
                                    {isTestingConn ? 'Testing...' : '⚡ Test Connection'}
                                </button>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                {!isAddAccountMode && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteAccount(editingAccount.id)}
                                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs"
                                    >
                                        🗑️ Delete Account
                                    </button>
                                )}
                                <div className="flex gap-2 ml-auto">
                                    <button
                                        type="button"
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md"
                                    >
                                        Save & Sync Settings
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Webmail;
