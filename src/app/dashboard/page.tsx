'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, HelpCircle, Layers, Loader2 } from 'lucide-react';

export default function DashboardHome() {
  const [stats, setStats] = useState({
    users: 0,
    questions: 0,
    units: 0,
    loading: true,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [usersRes, questionsRes, unitsRes] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('questions').select('*', { count: 'exact', head: true }),
          supabase.from('units').select('*', { count: 'exact', head: true }),
        ]);

        setStats({
          users: usersRes.count ?? 0,
          questions: questionsRes.count ?? 0,
          units: unitsRes.count ?? 0,
          loading: false,
        });
      } catch (err) {
        console.error('Error fetching dashboard statistics:', err);
        setStats(prev => ({ ...prev, loading: false }));
      }
    }

    loadStats();
  }, []);

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800">Welcome, Admin</h2>
      <p className="text-gray-600 mt-2">Here is a quick overview of your app today.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">Total Users</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {stats.loading ? <Loader2 className="animate-spin text-gray-400" size={28} /> : stats.users}
            </p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Users size={26} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">Questions in Bank</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {stats.loading ? <Loader2 className="animate-spin text-gray-400" size={28} /> : stats.questions}
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <HelpCircle size={26} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">Curriculum Units</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {stats.loading ? <Loader2 className="animate-spin text-gray-400" size={28} /> : stats.units}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Layers size={26} />
          </div>
        </div>
      </div>
    </div>
  );
}

