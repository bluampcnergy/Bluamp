import React, { useState } from 'react';
import type { User } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import Modal from './Modal';

interface UserManagementProps {
  users: User[];
  onAddUser: (username: string, password: string, role?: User['role'], name?: string, whatsapp_number?: string) => string | null;
  onUpdateUser?: (username: string, updates: Partial<User>) => string | null;
  onDeleteUser: (username: string) => string | null;
  currentUser: User;
}

const cleanPhoneNumber = (raw: string) => {
  return (raw || '').replace(/[^0-9+]/g, '').trim();
};

const UserManagement: React.FC<UserManagementProps> = ({
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  currentUser
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [role, setRole] = useState<User['role']>('user');
  const [error, setError] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingUsername(null);
    setName('');
    setUsername('');
    setPassword('');
    setWhatsappNumber('');
    setRole('user');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUsername(user.username);
    setName(user.name || '');
    setUsername(user.username);
    setPassword(''); // Leave empty to keep unchanged
    setWhatsappNumber(user.whatsapp_number || '');
    setRole(user.role);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanUser = username.trim().toLowerCase();
    const cleanPhone = cleanPhoneNumber(whatsappNumber);

    if (!cleanUser) {
      setError('Username / Email cannot be empty.');
      return;
    }

    if (!editingUsername && !password) {
      setError('Password is required for new users.');
      return;
    }

    if (editingUsername) {
      if (onUpdateUser) {
        const result = onUpdateUser(editingUsername, {
          name: cleanName,
          whatsapp_number: cleanPhone,
          role,
          ...(password ? { password } : {})
        });
        if (result) {
          setError(result);
          return;
        }
      }
    } else {
      const result = onAddUser(cleanUser, password, role, cleanName, cleanPhone);
      if (result) {
        setError(result);
        return;
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (usernameToDelete: string) => {
    if (usernameToDelete === 'datlioncnergy@gmail.com') {
      alert('The default admin account cannot be deleted.');
      return;
    }
    if (usernameToDelete === currentUser.username) {
      alert('You cannot delete your own account.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete the user "${usernameToDelete}"? This action cannot be undone.`)) {
      const result = onDeleteUser(usernameToDelete);
      if (result) {
        alert(result);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>👥</span>
            <span>User Management & WhatsApp Staff Registry</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage employee logins, roles, and verified WhatsApp numbers for AI bot recognition & role-gated task routing.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-4 py-2.5 rounded-xl shadow-sm hover:bg-[#658C3E] hover:text-white transition-all font-black uppercase tracking-wider text-xs gap-1.5"
        >
          <PlusIcon />
          <span>Add New User</span>
        </button>
      </div>

      {/* WhatsApp Integration Info Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-5 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md no-print">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📱</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                WhatsApp Business API Recognition:
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Active & Synced to Database
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
              When an employee sends a WhatsApp message to your business number, the system identifies them by their registered number, greets them by name, displays their assigned tasks, and enforces their role permissions.
            </p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Employee / Name</th>
                <th className="p-4 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Login / Email</th>
                <th className="p-4 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Verified WhatsApp</th>
                <th className="p-4 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Role & Permissions</th>
                <th className="p-4 font-bold text-slate-600 uppercase text-[11px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => {
                const cleanPhone = cleanPhoneNumber(user.whatsapp_number || '');
                const isCurrent = user.username === currentUser.username;

                return (
                  <tr key={user.username} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{user.name || 'Unnamed Staff'}</span>
                        {isCurrent && (
                          <span className="bg-slate-200 text-slate-700 text-[10px] font-extrabold px-1.5 py-0.2 rounded">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-mono text-slate-600 font-semibold">
                      {user.username}
                    </td>
                    <td className="p-4">
                      {cleanPhone ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg text-xs">
                            📱 {user.whatsapp_number}
                          </span>
                          <a
                            href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 p-1 rounded-md transition-colors"
                            title="Test WhatsApp Direct Chat"
                          >
                            💬
                          </a>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Not configured</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          user.role === 'admin'
                            ? 'bg-[#8EBF45]/20 text-[#658C3E] border-[#8EBF45]/40'
                            : user.role === 'billing'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : user.role === 'dashboard_user'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {user.role === 'admin'
                          ? '👑 Director Admin'
                          : user.role === 'billing'
                          ? '💼 Billing & Operations'
                          : user.role === 'dashboard_user'
                          ? '📊 Dashboard Data'
                          : '🔧 General Employee'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 text-slate-400 hover:text-[#658C3E] hover:bg-[#8EBF45]/10 rounded-lg transition-colors"
                          title="Edit User & WhatsApp Details"
                        >
                          <PencilIcon />
                        </button>
                        {!isCurrent && user.username !== 'datlioncnergy@gmail.com' && (
                          <button
                            onClick={() => handleDelete(user.username)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                    No users registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUsername ? `Edit User: ${editingUsername}` : 'Add New User & WhatsApp Contact'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-xl text-xs font-bold">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Employee Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-bold bg-white"
              placeholder="e.g. Indrajeet Date or Ajay Sharma"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Email / Login Username <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={username}
              disabled={Boolean(editingUsername)}
              onChange={e => setUsername(e.target.value)}
              className={`w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-mono ${
                editingUsername ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900'
              }`}
              required
              placeholder="employee@cnergy.co.in"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Verified WhatsApp Phone Number
            </label>
            <input
              type="text"
              value={whatsappNumber}
              onChange={e => setWhatsappNumber(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm font-mono bg-white"
              placeholder="+91 98765 43210 (include country code)"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Used to identify the employee when they message the WhatsApp Business bot.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Password {editingUsername && <span className="text-slate-400 font-normal">(Leave blank to keep unchanged)</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white"
              required={!editingUsername}
              placeholder={editingUsername ? '••••••••' : 'Enter login password'}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Role & Permissions <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as User['role'])}
              className="w-full border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-[#8EBF45] outline-none text-sm bg-white font-bold text-slate-800"
            >
              <option value="user">🔧 General Employee (Assigned Tasks, Plant Check, QC)</option>
              <option value="billing">💼 Billing & Finance (Full Finance, Invoices, PO & Quotes)</option>
              <option value="dashboard_user">📊 Dashboard Data Employee (Tables Access, No Dashboard UI)</option>
              <option value="admin">👑 Director Admin (Full Plant, Finance, Settings & Users)</option>
            </select>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="text-slate-600 hover:text-slate-900 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#8EBF45] text-[#0D0D0D] px-6 py-2.5 rounded-xl hover:bg-[#658C3E] hover:text-white font-black uppercase tracking-wider text-xs shadow-md transition-all active:scale-95"
            >
              {editingUsername ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserManagement;
