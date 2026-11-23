'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, HelpCircle, BookOpen, Flag, ArrowRight, Sparkles, Calendar } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHome() {
  const [stats, setStats] = useState({
    users: 0,
    questions: 0,
    units: 0,
    reports: 0,
    loading: true,
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [usersRes, questionsRes, unitsRes, reportsRes] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('questions').select('*', { count: 'exact', head: true }),
          supabase.from('units').select('*', { count: 'exact', head: true }),
          supabase.from('reported_questions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);

        setStats({
          users: usersRes.count ?? 0,
          questions: questionsRes.count ?? 0,
          units: unitsRes.count ?? 0,
          reports: reportsRes.count ?? 0,
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
    <div className="max-w-6xl mx-auto pb-16 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-slate-900 tracking-tight">System overview</h1>
        <p className="text-sm text-slate-500 mt-1">Current learning metrics and content repository status across Prashnix.</p>
      </div>
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Learners */}
        <Link href="/dashboard/users" className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors duration-150 ease-out block">
          <div className="text-xs font-medium text-slate-500">Registered learners</div>
          <div className="text-2xl font-medium text-slate-900 mt-2">
            {stats.loading ? '...' : stats.users.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            Manage profiles <ArrowRight size={12} />
          </div>
        </Link>

        {/* Questions */}
        <Link href="/dashboard/questions" className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors duration-150 ease-out block">
          <div className="text-xs font-medium text-slate-500">Question repository</div>
          <div className="text-2xl font-medium text-slate-900 mt-2">
            {stats.loading ? '...' : stats.questions.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            Browse bank <ArrowRight size={12} />
          </div>
        </Link>

        {/* Units */}
        <Link href="/dashboard/curriculum" className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors duration-150 ease-out block">
          <div className="text-xs font-medium text-slate-500">Curriculum units</div>
          <div className="text-2xl font-medium text-slate-900 mt-2">
            {stats.loading ? '...' : stats.units.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            Inspect tree <ArrowRight size={12} />
          </div>
        </Link>

        {/* Pending Reports */}
        <Link href="/dashboard/reports" className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors duration-150 ease-out block">
          <div className="text-xs font-medium text-slate-500">Pending issue reports</div>
          <div className={`text-2xl font-medium mt-2 ${stats.reports > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {stats.loading ? '...' : stats.reports}
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            Review reports <ArrowRight size={12} />
          </div>
        </Link>
      </div>

      {/* Quick Access Grid */}
      <div className="border border-slate-200 bg-white rounded-xl p-6">
        <h2 className="text-sm font-medium text-slate-900 mb-1">Administrative modules</h2>
        <p className="text-xs text-slate-500 mb-6">Direct access to core learning operations and content publishing.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/dashboard/questions" className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors duration-150 ease-out">
            <div className="flex items-center gap-2.5">
              <HelpCircle size={16} className="text-slate-600" />
              <div className="text-sm font-medium text-slate-900">Question bank</div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Search questions by ID or text, update options, and fix explanations.</p>
          </Link>

          <Link href="/dashboard/reports" className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors duration-150 ease-out">
            <div className="flex items-center gap-2.5">
              <Flag size={16} className="text-slate-600" />
              <div className="text-sm font-medium text-slate-900">Reported questions</div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Inspect question issues reported by app users and compare live data.</p>
          </Link>

          <Link href="/dashboard/users" className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors duration-150 ease-out">
            <div className="flex items-center gap-2.5">
              <Users size={16} className="text-slate-600" />
              <div className="text-sm font-medium text-slate-900">Learner management</div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Control XP, streak records, hearts, admin privileges, or account deletion.</p>
          </Link>

          <Link href="/dashboard/curriculum" className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors duration-150 ease-out">
            <div className="flex items-center gap-2.5">
              <BookOpen size={16} className="text-slate-600" />
              <div className="text-sm font-medium text-slate-900">Curriculum builder</div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Organize syllabus milestones, police bharti lessons, and node maps.</p>
          </Link>

          <Link href="/dashboard/extractor" className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors duration-150 ease-out">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-slate-600" />
              <div className="text-sm font-medium text-slate-900">PDF extractor</div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Extract Marathi multiple-choice questions from PYQ exam papers via Gemini AI.</p>
          </Link>

          <Link href="/dashboard/weekly-tests" className="p-4 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-colors duration-150 ease-out">
            <div className="flex items-center gap-2.5">
              <Calendar size={16} className="text-slate-600" />
              <div className="text-sm font-medium text-slate-900">Weekly tests</div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Publish and schedule full 100-question weekly mock examination papers.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

