'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogOut, LayoutDashboard, Users, HelpCircle, Trophy, BookOpen, Sparkles, Calendar, MessageSquare, Flag } from 'lucide-react';
import Link from 'next/link';
import { FeedbackProvider } from '@/components/FeedbackDialog';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);

  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const { count, error } = await supabase
          .from('reported_questions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (!error && typeof count === 'number') {
          setPendingReportsCount(count);
        }
      } catch (e) {
        // quiet fallback
      }
    }
    fetchPendingCount();
  }, [pathname]);

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

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
      Loading administration portal...
    </div>
  );

  const navItems = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/users', label: 'Learners', icon: Users },
    { href: '/dashboard/questions', label: 'Question bank', icon: HelpCircle },
    { href: '/dashboard/reports', label: 'Reported questions', icon: Flag, count: pendingReportsCount },
    { href: '/dashboard/curriculum', label: 'Curriculum', icon: BookOpen },
    { href: '/dashboard/extractor', label: 'PDF extractor', icon: Sparkles },
    { href: '/dashboard/weekly-tests', label: 'Weekly tests', icon: Calendar },
  ];

  return (
    <FeedbackProvider>
      <div className="min-h-screen bg-slate-50/50 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-950 border-r border-slate-850 text-slate-300 flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-800/60">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-200 font-medium text-xs">
                P
              </div>
              <div>
                <span className="text-sm font-medium text-slate-100 tracking-tight">Prashnix</span>
                <span className="block text-[11px] text-slate-500 font-normal">Administration</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-150 ease-out ${
                    isActive
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-slate-200' : 'text-slate-500'} />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-850">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors duration-150 ease-out w-full px-3 py-2 rounded-lg hover:bg-slate-900"
            >
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </FeedbackProvider>
  );
}
