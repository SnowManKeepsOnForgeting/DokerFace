import { useState } from 'react';
import { useAuth } from '../api/auth';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || !password.trim()) {
      setError('Login name and password are required');
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      await login({
        login_name: loginName.trim(),
        password: password.trim(),
      });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected login error occurred');
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 p-4 font-sans">
      <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-purple-600/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-8 shadow-2xl shadow-purple-950/10 relative">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600 text-white font-bold text-xl tracking-wider shadow-lg shadow-purple-900/40">
            D
          </div>
          <span className="font-bold text-2xl tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
            DokerFace
          </span>
        </div>

        <h2 className="text-xl font-semibold text-center mb-6">Sign In to Play</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm font-medium animate-fadeIn">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Username
            </label>
            <input
              type="text"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              disabled={isPending}
              placeholder="Enter your username"
              className="w-full h-11 bg-slate-950/80 border border-slate-800 focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              placeholder="••••••••"
              className="w-full h-11 bg-slate-950/80 border border-slate-800 focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-11 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-purple-300 text-white font-medium rounded-lg shadow-lg shadow-purple-900/20 hover:shadow-purple-900/30 transition-all flex items-center justify-center gap-2 text-sm mt-8 cursor-pointer"
          >
            {isPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
