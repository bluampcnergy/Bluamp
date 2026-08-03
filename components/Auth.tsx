
import React, { useState } from 'react';

// Define the props interface for the Auth component
interface AuthProps {
  onLogin: (username: string, password: string) => Promise<string | null>;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const loginError = await onLogin(username, password);
    if (loginError) {
      setError(loginError);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex flex-col justify-center items-center p-4">
        <div className="flex flex-col items-center mb-10 animate-fade-in">
            <img 
                src="https://supabase.cnergy.co.in/storage/v1/object/public/Logo/DC_Full_battery_black_bg.png" 
                alt="Datlion Cnergy Logo" 
                className="h-24 w-auto object-contain mb-6"
            />
            <h1 className="text-3xl font-bold text-white tracking-tight font-brand">Datlion Cnergy</h1>
            <p className="text-xs font-black text-[#8EBF45] uppercase tracking-[0.3em] mt-2">Plant Management System</p>
        </div>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-10 border border-[#A8BF75]/20">
        <h2 className="text-xl font-bold text-center text-[#0D0D0D] mb-8 font-brand">
          Secure Access
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start" role="alert">
            <span className="font-bold mr-1">Error:</span> {error}
          </div>}
          
          <div>
            <label htmlFor="username" className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Email Address</label>
            <input
              id="username"
              type="email"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="appearance-none block w-full px-4 py-3 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8EBF45] focus:border-[#8EBF45] sm:text-sm transition-all"
              placeholder="operator@datlion.com"
            />
          </div>

          <div>
            <label htmlFor="password"className="block text-xs font-bold text-[#404040] uppercase tracking-wider mb-2">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none block w-full px-4 py-3 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8EBF45] focus:border-[#8EBF45] sm:text-sm transition-all"
              placeholder="••••••••"
            />
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-black uppercase tracking-widest text-[#0D0D0D] bg-[#8EBF45] hover:bg-[#658C3E] hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#8EBF45] disabled:bg-slate-300 disabled:cursor-not-allowed transition-all transform active:scale-95"
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="mt-10 text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest border-t border-slate-100 pt-6">
            <span>Confidential Internal System</span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
