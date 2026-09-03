
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import ReceivedGoods from './components/ReceivedGoods';
import WorkInProgress from './components/WorkInProgress';
import FinishedGoods from './components/FinishedGoods';
import DirectToFinished from './components/DirectToFinished';
import Testing from './components/Testing';
import Reports from './components/Reports';
import Auth from './components/Auth';
import ViewLog from './components/ViewLog';
import UserManagement from './components/UserManagement';
import MasterData from './components/MasterData';
import CompanyProfiles from './components/CompanyProfiles';
import SuppliesRecord from './components/SuppliesRecord';
import HomeDashboard from './components/HomeDashboard';
import InvoiceModule from './components/invoices/InvoiceModule'; 
import AiChatPanel from './components/invoices/AiChatPanel';
import StorageManager from './components/RackSearch'; 
import PublicStorageViewer from './components/PublicStorageViewer'; // New Import
import HelpGuide from './components/HelpGuide';
import { EmployeeTasks } from './components/EmployeeTasks';
import PlantAiAssistant from './components/PlantAiAssistant';
import Webmail from './components/Webmail';
import { MobileVoiceShell } from './components/mobile/MobileVoiceShell';
import Footer from './components/Footer';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSupabase } from './hooks/useSupabase';
import { supabase } from './supabaseClient';
import type { ReceivedGood, Recipe, WIPItem, FinishedGood, RepairItem, User, LogEntry, TestResult, CompanyProfile, ExtractedInvoice, View, StorageRoom, StorageUnit, StorageItem, SupplyRecord, EmployeeTask } from './types';
import { DUMMY_RECEIVED_GOODS, DUMMY_RECIPES, DUMMY_WIP_ITEMS, DUMMY_FINISHED_GOODS, DUMMY_COMPANY_PROFILES } from './dummyData';

const DUMMY_EMPLOYEE_TASKS: EmployeeTask[] = [
  {
    id: 'task-1',
    assigned_to: 'admin',
    title: 'Review weekly battery assembly & BOM reports',
    description: 'Verify raw material consumption matches finished goods output for current cycle.',
    completed: false,
    due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    created_at: Date.now() - 3600000 * 5,
    created_by: 'system',
  },
  {
    id: 'task-2',
    assigned_to: 'general',
    title: 'Inspect raw LFP cell shipment & record serial numbers',
    description: 'Verify pack seal numbers and check voltage tolerances for incoming batch.',
    completed: false,
    due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    created_at: Date.now() - 3600000 * 4,
    created_by: 'admin',
  },
  {
    id: 'task-3',
    assigned_to: 'user',
    title: 'Perform high-rate discharge test on battery pack #402',
    description: 'Log peak current draw and thermal rise curve in Testing portal.',
    completed: true,
    due_date: new Date().toISOString().split('T')[0],
    created_at: Date.now() - 3600000 * 24,
    created_by: 'admin',
  },
  {
    id: 'task-4',
    assigned_to: 'billing_user',
    title: 'Generate monthly GST summary report & verify E-way bills',
    description: 'Reconcile outgoing tax invoices with E-way bill portal logs.',
    completed: false,
    due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    created_at: Date.now() - 3600000 * 12,
    created_by: 'admin',
  },
  {
    id: 'task-5',
    assigned_to: 'datlioncnergy@gmail.com',
    title: 'Audit daily rack storage map & update bin tags',
    description: 'Ensure finished goods in Rack A2 match physical serial tags.',
    completed: false,
    due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    created_at: Date.now() - 3600000 * 2,
    created_by: 'admin',
  },
];

const App: React.FC = () => {
  // Check for public QR code scan or Iframe Mode
  const searchParams = new URLSearchParams(window.location.search);
  const publicUnitId = searchParams.get('public_storage');
  const mode = searchParams.get('mode');

  const [view, setView] = useState<View>(() => {
      const v = searchParams.get('view');
      return v ? (v as View) : 'home';
  }); 
  
  // Auth state
  const [users, setUsers] = useSupabase<User>('app_users', [], 'username');
  const [currentUser, setCurrentUser] = useLocalStorage<User | null>('currentUser', null);

  // Track visited views to keep lazy-loaded tables active once fetched
  const [visitedViews, setVisitedViews] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (view && !visitedViews[view]) {
      setVisitedViews(prev => ({ ...prev, [view]: true }));
    }
  }, [view, visitedViews]);

  // App data state - synchronized with Supabase
  const [receivedGoods, setReceivedGoods] = useSupabase<ReceivedGood>('received_goods', DUMMY_RECEIVED_GOODS);
  const [recipes, setRecipes] = useSupabase<Recipe>('recipes', DUMMY_RECIPES);
  const [wipItems, setWipItems] = useSupabase<WIPItem>('wip_items', DUMMY_WIP_ITEMS);
  const [finishedGoods, setFinishedGoods] = useSupabase<FinishedGood>('finished_goods', DUMMY_FINISHED_GOODS);
  const [repairItems, setRepairItems] = useSupabase<RepairItem>('repair_items', [], 'id', view === 'finished' || Boolean(visitedViews['finished']));
  const [testResults, setTestResults] = useSupabase<TestResult>('test_results', []);
  const [logs, setLogs] = useSupabase<LogEntry>('logs', [], 'id', view === 'log' || Boolean(visitedViews['log']));
  const [companyProfiles, setCompanyProfiles] = useSupabase<CompanyProfile>('company_profiles', DUMMY_COMPANY_PROFILES);
  const [employeeTasks, setEmployeeTasks] = useSupabase<EmployeeTask>('employee_tasks', DUMMY_EMPLOYEE_TASKS);

  // Auto-seed default employee tasks if table is empty
  useEffect(() => {
    if (!employeeTasks || employeeTasks.length === 0) {
      setEmployeeTasks(DUMMY_EMPLOYEE_TASKS);
    }
  }, [employeeTasks, setEmployeeTasks]);
  
  // Storage Management State (Lazy loaded)
  const isStorageActive = view === 'storage' || Boolean(visitedViews['storage']);
  const [rooms, setRooms] = useSupabase<StorageRoom>('storage_rooms', [], 'id', isStorageActive);
  const [storageUnits, setStorageUnits] = useSupabase<StorageUnit>('storage_units', [], 'id', isStorageActive);
  const [storageItems, setStorageItems] = useSupabase<StorageItem>('storage_items', [], 'id', isStorageActive);
  const [suppliesRecords, setSuppliesRecords] = useSupabase<SupplyRecord>('supplies_records', [], 'id', view === 'supplies' || Boolean(visitedViews['supplies']));

  // State for transferring data from Reports to Invoice Maker
  const [invoiceDraft, setInvoiceDraft] = useState<ExtractedInvoice | null>(null);

  // State for transferring data from Testing to WIP (Start Production)
  const [productionDraft, setProductionDraft] = useState<{ receivedGoodId: string; serials: string[] } | null>(null);

  // Parse Slack Deep Link
  useEffect(() => {
      const draftId = searchParams.get('slack_draft');
      if (draftId && currentUser) {
          const fetchDraft = async () => {
              try {
                  // Use serverless function to bypass RLS so basic users can view the draft
                  const res = await fetch(`/api/get-shared-draft?id=${draftId}`);
                  if (res.ok) {
                      const data = await res.json();
                      setInvoiceDraft(data as ExtractedInvoice);
                  } else {
                      // Fallback to direct supabase query (for admins or local testing)
                      const { data, error } = await supabase.from('invoices').select('*').eq('id', draftId).single();
                      if (data && !error) {
                          setInvoiceDraft(data as ExtractedInvoice);
                      }
                  }
              } catch (err) {
                  const { data, error } = await supabase.from('invoices').select('*').eq('id', draftId).single();
                  if (data && !error) {
                      setInvoiceDraft(data as ExtractedInvoice);
                  }
              }
          };
          fetchDraft();
      }
  }, [currentUser]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: Only accept messages from our own origin
      if (event.origin !== window.location.origin) return;
      if (event.data.type === 'COMPANY_ADDED') {
        const newCompany = event.data.company;
        setCompanyProfiles(prev => {
          if (prev.some(c => c.id === newCompany.id)) return prev;
          return [...prev, newCompany];
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setCompanyProfiles]);

  useEffect(() => {
    if (users.length === 0) {
        // Wait for sync
    }

    // Ensure admin role is preserved — password is managed in the database only
    setUsers(prevUsers => {
        const ADMIN_USERNAME = 'datlioncnergy@gmail.com';
        const existingUsers = [...prevUsers];
        const adminIndex = existingUsers.findIndex(u => u.username === ADMIN_USERNAME);

        if (adminIndex !== -1) {
            // Ensure admin role is always set (don't touch password)
            if (existingUsers[adminIndex].role !== 'admin') {
                existingUsers[adminIndex] = { ...existingUsers[adminIndex], role: 'admin' };
                return existingUsers;
            }
            return prevUsers;
        }
        // If admin user doesn't exist at all (first-time setup), it should be seeded via SQL.
        // Don't create from client-side code.
        return prevUsers;
    });
  }, [setUsers, users]); 

  // Keep currentUser role & password in sync with app_users table; automatically log out if user is deleted or password changes
  useEffect(() => {
    if (currentUser && users.length > 0) {
      const dbUser = users.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
      if (!dbUser) {
        // User removed from app_users DB -> Force immediate logout
        setCurrentUser(null);
      } else {
        // Role sync
        if (dbUser.role && dbUser.role !== currentUser.role) {
          setCurrentUser(prev => prev ? { ...prev, role: dbUser.role } : null);
        }
        // Password sync: If password in app_users DB table changed and no longer matches active session password -> Force immediate logout
        if (dbUser.password && currentUser.password && currentUser.password !== dbUser.password && currentUser.password !== 'migrated_to_supabase') {
          setCurrentUser(null);
        }
      }
    }
  }, [users, currentUser, setCurrentUser]);

  // Seamless migration & session check for Supabase Auth (runs max once per session load)
  const hasMigratedAuthRef = useRef(false);
  useEffect(() => {
    if (hasMigratedAuthRef.current) return;
    const migrateExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session && currentUser && currentUser.password && currentUser.password !== 'migrated_to_supabase') {
        hasMigratedAuthRef.current = true;
        const { error } = await supabase.auth.signInWithPassword({
          email: currentUser.username,
          password: currentUser.password
        });
        
        if (error && error.message.includes('Invalid login')) {
           // Try sign up if they don't exist yet
           await supabase.auth.signUp({
             email: currentUser.username,
             password: currentUser.password
           });
        }
        
        // Ensure they actually get signed in
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: currentUser.username,
          password: currentUser.password
        });
        
        if (signInErr) {
            setCurrentUser(null);
        } else {
            setCurrentUser(prev => prev ? { ...prev, password: currentUser.password } : null);
        }
      } else {
        hasMigratedAuthRef.current = true;
      }
    };
    
    migrateExistingSession();
  }, [currentUser, setCurrentUser]);

  const addLogEntry = useCallback((action: string, details: string) => {
    if (!currentUser) return;
    const newLog: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      username: currentUser.username,
      action,
      details,
    };
    setLogs(prev => [newLog, ...prev]);
  }, [setLogs, currentUser]);

  const handleLogin = async (username: string, password: string): Promise<string | null> => {
    try {
      // 1. Try standard Supabase Auth first
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });

      if (!error && data.session) {
        let role = users.find(u => u.username === username)?.role;
        if (!role) {
          try {
            const { data: dbUser } = await supabase
              .from('app_users')
              .select('role')
              .eq('username', username)
              .maybeSingle();
            if (dbUser && dbUser.role) {
              role = dbUser.role;
            }
          } catch (e) {
            console.warn('Direct app_users role fetch failed:', e);
          }
        }
        if (!role && username.toLowerCase() === 'datlioncnergy@gmail.com') {
          role = 'admin';
        }
        const finalRole = role || 'user';
        setCurrentUser({ username, role: finalRole, password });
        addLogEntry('User Logged In', `User '${username}' (${finalRole}) logged in via Supabase Auth.`);
        return null;
      }

      // 2. Fallback: Seamless Migration for Legacy Users
      let legacyUser = users.find(u => u.username === username);
      if (!legacyUser) {
        try {
          const { data: dbUser } = await supabase
            .from('app_users')
            .select('*')
            .eq('username', username)
            .maybeSingle();
          if (dbUser) legacyUser = dbUser as User;
        } catch (e) {}
      }

      if (legacyUser && legacyUser.password === password) {
        // Valid legacy credentials, migrate them to Supabase
        const { error: signUpError } = await supabase.auth.signUp({
          email: username,
          password,
        });

        if (signUpError && !signUpError.message.includes('already registered')) {
           return signUpError.message;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: username,
            password
        });

        if (signInError) {
            // Even if Supabase auth fails, allow legacy login with app_users table password
            const finalRole = legacyUser.role || (username.toLowerCase() === 'datlioncnergy@gmail.com' ? 'admin' : 'user');
            setCurrentUser({ username, role: finalRole, password });
            addLogEntry('User Logged In', `User '${username}' (${finalRole}) logged in via app_users table.`);
            return null;
        }

        const finalRole = legacyUser.role || (username.toLowerCase() === 'datlioncnergy@gmail.com' ? 'admin' : 'user');
        setCurrentUser({ username, role: finalRole, password });
        addLogEntry('User Migrated', `Legacy user '${username}' (${finalRole}) seamlessly logged in.`);
        return null;
      }

      return error?.message || 'Invalid username or password.';
    } catch (err: any) {
      return err.message;
    }
  };

  const handleLogout = async () => {
    if(currentUser) {
      addLogEntry('User Logged Out', `User '${currentUser.username}' logged out.`);
    }
    await supabase.auth.signOut();
    setCurrentUser(null);
  };
  
  const handleAddUser = (
    username: string,
    password: string,
    role: User['role'] = 'user',
    name?: string,
    whatsapp_number?: string
  ): string | null => {
    if (currentUser?.role !== 'admin') {
      return 'Permission denied.';
    }
    const cleanUsername = username.trim().toLowerCase();
    const userExists = users.some(u => u.username.toLowerCase() === cleanUsername);
    if (userExists) {
      return 'A user with this email already exists.';
    }
    const newUser: User = {
      username: cleanUsername,
      password,
      role,
      name: name?.trim(),
      whatsapp_number: whatsapp_number?.trim(),
      is_active: true
    };
    setUsers(prev => [...prev, newUser]);
    addLogEntry('User Created', `Admin '${currentUser.username}' created new user '${cleanUsername}' (${role}, WA: ${whatsapp_number || 'none'}).`);
    return null;
  };

  const handleUpdateUser = (username: string, updates: Partial<User>): string | null => {
    if (currentUser?.role !== 'admin') {
      return 'Permission denied.';
    }
    const cleanUsername = username.trim().toLowerCase();
    setUsers(prev =>
      prev.map(u =>
        u.username.toLowerCase() === cleanUsername
          ? {
              ...u,
              ...updates,
              name: updates.name !== undefined ? updates.name?.trim() : u.name,
              whatsapp_number: updates.whatsapp_number !== undefined ? updates.whatsapp_number?.trim() : u.whatsapp_number,
              role: updates.role || u.role,
              ...(updates.password ? { password: updates.password } : {})
            }
          : u
      )
    );
    addLogEntry('User Updated', `Admin '${currentUser.username}' updated user '${cleanUsername}' (Role: ${updates.role || 'unchanged'}, WA: ${updates.whatsapp_number || 'unchanged'}).`);
    return null;
  };

  const handleDeleteUser = (usernameToDelete: string): string | null => {
    if (currentUser?.role !== 'admin') {
      return 'Permission denied.';
    }
    if (usernameToDelete === 'datlioncnergy@gmail.com') {
      return 'The default admin account cannot be deleted.';
    }
    if (usernameToDelete === currentUser.username) {
      return 'You cannot delete your own account.';
    }
    setUsers(prev => prev.filter(user => user.username !== usernameToDelete));
    addLogEntry('User Deleted', `Admin '${currentUser.username}' deleted user '${usernameToDelete}'.`);
    return null;
  };

  const handleAddEmployeeTask = useCallback((assignedTo: string, title: string, description?: string, dueDate?: string) => {
    const newTask: EmployeeTask = {
      id: `task-${Date.now()}`,
      assigned_to: assignedTo,
      title,
      description,
      completed: false,
      due_date: dueDate,
      created_at: Date.now(),
      created_by: currentUser?.username || 'admin',
    };
    setEmployeeTasks(prev => [newTask, ...prev]);
    addLogEntry('CREATE_TASK', `Assigned task "${title}" to employee ${assignedTo}`);
  }, [currentUser, setEmployeeTasks, addLogEntry]);

  const handleToggleEmployeeTask = useCallback((taskId: string) => {
    setEmployeeTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const nextState = !t.completed;
        addLogEntry('UPDATE_TASK', `Marked task "${t.title}" as ${nextState ? 'Completed' : 'Pending'}`);
        return { ...t, completed: nextState };
      }
      return t;
    }));
  }, [setEmployeeTasks, addLogEntry]);

  const handleDeleteEmployeeTask = useCallback((taskId: string) => {
    const target = employeeTasks.find(t => t.id === taskId);
    setEmployeeTasks(prev => prev.filter(t => t.id !== taskId));
    if (target) {
      addLogEntry('DELETE_TASK', `Deleted task "${target.title}" assigned to ${target.assigned_to}`);
    }
  }, [employeeTasks, setEmployeeTasks, addLogEntry]);

  const handleEditEmployeeTask = useCallback((taskId: string, title: string, description?: string, dueDate?: string) => {
    setEmployeeTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, title, description, due_date: dueDate };
      }
      return t;
    }));
    addLogEntry('EDIT_TASK', `Updated task details for "${title}"`);
  }, [setEmployeeTasks, addLogEntry]);

  const renderView = useCallback(() => {
    // Handle Finance Sub-routes
    if (view.startsWith('finance_')) {
        const tab = view.replace('finance_', '') as any;
        if (currentUser?.role !== 'admin' && currentUser?.role !== 'billing' && tab !== 'maker' && tab !== 'expenses') {
            return <div className="text-center p-8 text-red-600 font-semibold">Access Denied: Director Admins and Billing Users Only</div>;
        }
        return <InvoiceModule 
            currentUser={currentUser} 
            companyProfiles={companyProfiles}
            invoiceDraft={invoiceDraft}
            setInvoiceDraft={setInvoiceDraft}
            setView={setView}
            activeTab={tab}
            finishedGoods={finishedGoods}
            recipes={recipes}
            addLogEntry={addLogEntry}
        />;
    }

    switch (view) {
      case 'home':
        if (currentUser?.role === 'dashboard_user') {
          return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-slate-200 text-center m-8">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 text-2xl">🔒</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Dashboard Access Restricted</h2>
              <p className="text-slate-600 max-w-md text-sm mb-6">
                Your account role (Dashboard Data Employee) has direct database access for tools (Invoice Maker, Operations, Supplies) but is restricted from viewing the Summary Dashboard UI.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setView('wip')} className="px-4 py-2 bg-[#8EBF45] text-[#0D0D0D] font-bold rounded-lg text-xs uppercase hover:bg-[#7cb037]">Go to Operations (WIP)</button>
                <button onClick={() => setView('finance_maker')} className="px-4 py-2 bg-slate-800 text-white font-bold rounded-lg text-xs uppercase hover:bg-slate-700">Go to Invoice Maker</button>
              </div>
            </div>
          );
        }
        return <HomeDashboard
          receivedGoods={receivedGoods}
          wipItems={wipItems}
          finishedGoods={finishedGoods}
          recipes={recipes}
          suppliesRecords={suppliesRecords}
          logs={logs}
          currentUser={currentUser}
          setView={setView}
          employeeTasks={employeeTasks}
          onToggleTask={handleToggleEmployeeTask}
        />;
      case 'received':
        return (
          <ReceivedGoods 
            receivedGoods={receivedGoods} 
            setReceivedGoods={setReceivedGoods} 
            recipes={recipes}
            setRecipes={setRecipes}
            addLogEntry={addLogEntry} 
            wipItems={wipItems}
            setWipItems={setWipItems}
            finishedGoods={finishedGoods}
            setFinishedGoods={setFinishedGoods}
            companyProfiles={companyProfiles}
            testResults={testResults}
            setTestResults={setTestResults}
            currentUser={currentUser}
            setView={setView}
            setInvoiceDraft={setInvoiceDraft}
          />
        );
      case 'testing':
        return <Testing 
          receivedGoods={receivedGoods} 
          setReceivedGoods={setReceivedGoods}
          testResults={testResults} 
          setTestResults={setTestResults} 
          addLogEntry={addLogEntry} 
          currentUser={currentUser}
          onSendToProduction={(data) => {
              setProductionDraft(data);
              setView('wip');
          }}
        />;
      case 'wip':
        return <WorkInProgress
          wipItems={wipItems}
          setWipItems={setWipItems}
          receivedGoods={receivedGoods}
          setReceivedGoods={setReceivedGoods}
          recipes={recipes}
          setRecipes={setRecipes}
          setFinishedGoods={setFinishedGoods}
          repairItems={repairItems}
          setRepairItems={setRepairItems}
          finishedGoods={finishedGoods}
          addLogEntry={addLogEntry}
          testResults={testResults}
          companyProfiles={companyProfiles}
          productionDraft={productionDraft}
          setProductionDraft={setProductionDraft}
          currentUser={currentUser}
        />;
      case 'dtf':
        return <DirectToFinished
          receivedGoods={receivedGoods}
          setReceivedGoods={setReceivedGoods}
          finishedGoods={finishedGoods}
          setFinishedGoods={setFinishedGoods}
          recipes={recipes}
          setRecipes={setRecipes}
          addLogEntry={addLogEntry}
          currentUser={currentUser}
        />;
      case 'finished':
        return <FinishedGoods 
          finishedGoods={finishedGoods} 
          setFinishedGoods={setFinishedGoods}
          recipes={recipes} 
          receivedGoods={receivedGoods} 
          setReceivedGoods={setReceivedGoods}
          setRepairItems={setRepairItems}
          addLogEntry={addLogEntry}
          companyProfiles={companyProfiles}
          setView={setView}
          setInvoiceDraft={setInvoiceDraft}
          testResults={testResults}
        />;
      case 'storage':
        return <StorageManager 
            rooms={rooms}
            setRooms={setRooms}
            units={storageUnits}
            setUnits={setStorageUnits}
            items={storageItems}
            setItems={setStorageItems}
            receivedGoods={receivedGoods}
            addLogEntry={addLogEntry}
        />;
      case 'supplies':
        return <SuppliesRecord
            suppliesRecords={suppliesRecords}
            setSuppliesRecords={setSuppliesRecords}
            companyProfiles={companyProfiles}
            setCompanyProfiles={setCompanyProfiles}
            receivedGoods={receivedGoods}
            setReceivedGoods={setReceivedGoods}
            recipes={recipes}
            addLogEntry={addLogEntry}
            currentUser={currentUser}
            setView={setView}
        />;

      case 'reports':
        return <Reports 
          receivedGoods={receivedGoods} 
          finishedGoods={finishedGoods} 
          recipes={recipes} 
          wipItems={wipItems} 
          logs={logs} 
          setView={setView}
          setInvoiceDraft={setInvoiceDraft}
        />;
      case 'master':
        return <MasterData 
          receivedGoods={receivedGoods}
          wipItems={wipItems}
          finishedGoods={finishedGoods}
          recipes={recipes}
          repairItems={repairItems}
          testResults={testResults}
          rooms={rooms}
          storageUnits={storageUnits}
          storageItems={storageItems}
        />;
      case 'log':
        return <ViewLog logs={logs} />;
      case 'companies':
        return <CompanyProfiles 
          companyProfiles={companyProfiles}
          setCompanyProfiles={setCompanyProfiles}
          addLogEntry={addLogEntry}
        />;
      case 'users':
        return currentUser && currentUser.role === 'admin' ? (
          <UserManagement 
            users={users} 
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser} 
            currentUser={currentUser} 
          />
        ) : <div className="text-center p-8 text-red-600 font-semibold">Access Denied</div>;
      
      case 'employee_tasks':
        return (
          <EmployeeTasks
            currentUser={currentUser}
            users={users}
            tasks={employeeTasks}
            onAddTask={handleAddEmployeeTask}
            onToggleTask={handleToggleEmployeeTask}
            onDeleteTask={handleDeleteEmployeeTask}
            onEditTask={handleEditEmployeeTask}
          />
        );

      case 'ai_assistant':
        return (
          <PlantAiAssistant
            currentUser={currentUser}
            receivedGoods={receivedGoods}
            finishedGoods={finishedGoods}
            wipItems={wipItems}
            recipes={recipes}
            suppliesRecords={suppliesRecords}
            logs={logs}
            employeeTasks={employeeTasks}
          />
        );

      case 'webmail':
        return <Webmail currentUser={currentUser} addLogEntry={addLogEntry} />;

      case 'help':
        return <HelpGuide setView={setView} userRole={currentUser?.role} />;

      case 'mobile':
        return (
          <MobileVoiceShell
            currentUser={currentUser}
            setView={setView}
            users={users}
            tasks={employeeTasks}
            onAddTask={handleAddEmployeeTask}
            onToggleTask={handleToggleEmployeeTask}
            onDeleteTask={handleDeleteEmployeeTask}
            onEditTask={handleEditEmployeeTask}
            receivedGoods={receivedGoods}
            finishedGoods={finishedGoods}
            companyProfiles={companyProfiles}
            addLogEntry={addLogEntry}
          />
        );

      default:
        return null;
    }
  }, [view, receivedGoods, recipes, wipItems, finishedGoods, repairItems, logs, users, currentUser, addLogEntry, setReceivedGoods, setWipItems, setFinishedGoods, setRepairItems, setRecipes, testResults, setTestResults, companyProfiles, setCompanyProfiles, invoiceDraft, productionDraft, rooms, storageUnits, storageItems, setRooms, setStorageUnits, setStorageItems, suppliesRecords, setSuppliesRecords, employeeTasks, handleAddEmployeeTask, handleToggleEmployeeTask, handleDeleteEmployeeTask, handleEditEmployeeTask]);

  // --- WEBMAIL COMPOSE IFRAME ROUTE ---
  if (mode === 'webmail_compose' || mode === 'webmail') {
      const urlParams = new URLSearchParams(window.location.search);
      const to = urlParams.get('to') || '';
      const cc = urlParams.get('cc') || '';
      const subject = urlParams.get('subject') || '';
      const body = urlParams.get('body') || '';

      return (
        <div className="min-h-screen bg-slate-900 p-2 sm:p-4">
           <Webmail 
              currentUser={currentUser}
              addLogEntry={addLogEntry}
              isIframe={true}
              initialCompose={{
                to,
                cc,
                subject,
                body,
                isOpen: true
              }}
           />
        </div>
      );
  }

  // --- COMPANY PROFILES IFRAME ROUTE ---
  if (mode === 'add_company') {
      return (
        <div className="h-screen w-screen bg-white overflow-hidden p-0 m-0">
           <CompanyProfiles 
              companyProfiles={companyProfiles}
              setCompanyProfiles={setCompanyProfiles}
              addLogEntry={addLogEntry}
              isIframe={true}
           />
        </div>
      );
  }

  // --- MASTER SEARCH IFRAME ROUTE ---
  if (mode === 'master_search') {
      return (
        <div className="min-h-screen bg-gray-50 p-4">
           <MasterData 
              receivedGoods={receivedGoods}
              wipItems={wipItems}
              finishedGoods={finishedGoods}
              recipes={recipes}
              repairItems={repairItems}
              testResults={testResults}
              rooms={rooms}
              storageUnits={storageUnits}
              storageItems={storageItems}
            />
        </div>
      );
  }

  // --- PUBLIC ACCESS ROUTE ---
  if (publicUnitId) {
      return <PublicStorageViewer unitId={publicUnitId} />;
  }

  if (!currentUser) {
    return <Auth onLogin={handleLogin} />;
  }

  // --- MOBILE FULLSCREEN VIEW ---
  if (view === 'mobile') {
    return (
      <MobileVoiceShell
        currentUser={currentUser}
        setView={setView}
        users={users}
        tasks={employeeTasks}
        onAddTask={handleAddEmployeeTask}
        onToggleTask={handleToggleEmployeeTask}
        onDeleteTask={handleDeleteEmployeeTask}
        onEditTask={handleEditEmployeeTask}
        receivedGoods={receivedGoods}
        finishedGoods={finishedGoods}
        companyProfiles={companyProfiles}
        addLogEntry={addLogEntry}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-12">
      <Header 
        currentView={view} 
        setView={setView} 
        username={currentUser.username} 
        userRole={currentUser.role}
        onLogout={handleLogout} 
      />
      <main className="px-2.5 py-3.5 sm:px-6 sm:py-8 pb-24 md:pb-8">
        {renderView()}
      </main>
      
      <Footer 
        receivedGoods={receivedGoods} 
        finishedGoods={finishedGoods} 
      />
    </div>
  );
};

export default App;
