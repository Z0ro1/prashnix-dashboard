'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // 1. Server-side verified admin authentication (credentials never leaked to browser)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      if (res.ok) {
        localStorage.setItem('streak_admin_auth', 'true');
        router.push('/dashboard');
        return;
      }

      // 2. Fallback: Supabase Auth if configured
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        throw new Error('Invalid login credentials');
      }

      if (!data.session) {
        throw new Error('Login failed — no session returned.');
      }

      localStorage.setItem('streak_admin_auth', 'true');
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during login';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Lock size={18} />
          </div>
        </div>
        <h2 className="mt-4 text-center text-lg font-medium text-slate-900">
          Sign in to administration portal
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">
          Enter your credentials to access Prashnix administration
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 border border-slate-200 rounded-xl sm:px-8">
          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Email address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-9 text-sm border-slate-200 rounded-lg py-2 border focus:border-slate-400 focus:outline-none text-slate-900 bg-white"
                  placeholder="admin@prashnix.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full text-sm border-slate-200 rounded-lg py-2 px-3 border focus:border-slate-400 focus:outline-none text-slate-900 bg-white"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <p className="text-xs font-medium text-red-700">{error}</p>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
