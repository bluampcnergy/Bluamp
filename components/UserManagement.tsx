
import React, { useState } from 'react';
import type { User } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import Modal from './Modal';

interface UserManagementProps {
  users: User[];
  onAddUser: (username: string, password: string, role?: User['role']) => string | null;
  onDeleteUser: (username: string) => string | null;
  currentUser: User;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onAddUser, onDeleteUser, currentUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('user');
  const [error, setError] = useState<string | null>(null);

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError("Username and password cannot be empty.");
      return;
    }
    const result = onAddUser(username, password, role);
    if (result) {
      setError(result);
    } else {
      setIsModalOpen(false);
      setUsername('');
      setPassword('');
      setRole('user');
    }
  };
  
  const handleDelete = (usernameToDelete: string) => {
    const result = onDeleteUser(usernameToDelete);
    if (result) {
        alert(result); // Show error in an alert for delete action
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
        <button
          onClick={() => { setIsModalOpen(true); setError(null); setUsername(''); setPassword(''); setRole('user'); }}
          className="flex items-center bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg shadow-md hover:bg-[#658C3E] hover:text-white transition-colors font-black uppercase tracking-wide text-xs"
        >
          <PlusIcon />
          <span className="ml-2">Add New User</span>
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 font-semibold text-sm text-gray-600">Username (Email)</th>
              <th className="p-4 font-semibold text-sm text-gray-600">Role</th>
              <th className="p-4 font-semibold text-sm text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.username} className="hover:bg-gray-50">
                <td className="p-4">{user.username}</td>
                <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' ? 'bg-[#8EBF45]/20 text-[#658C3E]' : user.role === 'billing' ? 'bg-blue-100 text-blue-800' : user.role === 'dashboard_user' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {user.role === 'admin' ? 'Director Admin' : user.role === 'billing' ? 'Billing & Operations' : user.role === 'dashboard_user' ? 'Dashboard Data Employee' : 'General Employee'}
                    </span>
                </td>
                <td className="p-4 text-right">
                  {user.username !== currentUser.username ? (
                    <button 
                      onClick={() => {
                        if (user.username === 'datlioncnergy@gmail.com') {
                          alert('The default admin account cannot be deleted.');
                          return;
                        }
                        if (window.confirm(`Are you sure you want to delete the user "${user.username}"? This action cannot be undone.`)) {
                           handleDelete(user.username)
                        }
                      }}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors" 
                      title="Delete User"
                    >
                      <TrashIcon />
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Current User</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New User">
        <form onSubmit={handleAddUserSubmit} className="space-y-4">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-md text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input 
              type="email" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as User['role'])}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-white"
            >
              <option value="user">General Employee</option>
              <option value="dashboard_user">Dashboard-Data Employee (Tables Access, No Dashboard UI)</option>
              <option value="billing">Billing & Finance (Full Access to all Finance Options & Operations)</option>
              <option value="admin">Director Admin</option>
            </select>
          </div>
          <div className="flex justify-end pt-4">
            <button type="submit" className="bg-[#8EBF45] text-[#0D0D0D] px-4 py-2 rounded-lg hover:bg-[#658C3E] hover:text-white font-bold uppercase tracking-wide text-xs">Create User</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserManagement;
