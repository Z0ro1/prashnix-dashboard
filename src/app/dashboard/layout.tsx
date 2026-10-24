'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogOut, LayoutDashboard, Users, HelpCircle, Trophy, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { FeedbackProvider } from '@/components/FeedbackDialog';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const isStaticAuth = typeof window !== 'undefined' && localStorage.getItem('streak_admin_auth') === 'true';
      if (isStaticAuth) {
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
      } else {
        setLoading(false);
      }
    }
    checkAuth();

    // Listen for auth state changes (e.g., token expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const isStaticAuth = typeof window !== 'undefined' && localStorage.getItem('streak_admin_auth') === 'true';
      if (!session && !isStaticAuth) {
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('streak_admin_auth');
    }
    await supabase.auth.signOut().catch(() => {});
    router.push('/');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading Admin Portal...</div>;

  return (
    <FeedbackProvider>
      <div className="min-h-screen bg-gray-50 flex">
        <div className="w-64 bg-indigo-900 text-white flex flex-col">
          <div className="p-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="text-yellow-400" /> Streak
            </h1>
            <p className="text-indigo-300 text-sm mt-1">Admin Portal</p>
          </div>
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/dashboard' ? 'bg-indigo-800 text-white' : 'hover:bg-indigo-800 text-indigo-100'}`}>
              <LayoutDashboard size={20} /> Dashboard
            </Link>
            <Link href="/dashboard/users" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/dashboard/users' ? 'bg-indigo-800 text-white' : 'hover:bg-indigo-800 text-indigo-100'}`}>
              <Users size={20} /> Users
            </Link>
            <Link href="/dashboard/questions" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/dashboard/questions' ? 'bg-indigo-800 text-white' : 'hover:bg-indigo-800 text-indigo-100'}`}>
              <HelpCircle size={20} /> Question Bank
            </Link>
            <Link href="/dashboard/curriculum" className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/dashboard/curriculum' ? 'bg-indigo-800 text-white' : 'hover:bg-indigo-800 text-indigo-100'}`}>
              <BookOpen size={20} /> Curriculum Builder
            </Link>
          </nav>
          <div className="p-4 border-t border-indigo-800">
            <button onClick={handleSignOut} className="flex items-center gap-3 text-indigo-300 hover:text-white transition-colors w-full px-4 py-2">
              <LogOut size={20} /> Sign Out
            </button>
          </div>
        </div>
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </div>
    </FeedbackProvider>
  );
}
