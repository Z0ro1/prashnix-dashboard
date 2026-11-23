'use client';

import { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trophy,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Eye,
  X,
  Sparkles,
  RefreshCw,
  FileText,
  Copy,
  Check,
  Power,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { useFeedback } from '@/components/FeedbackDialog';
import {
  WeeklyTest,
  WeeklyTestQuestion,
  fetchWeeklyTests,
  saveWeeklyTest,
  deleteWeeklyTest,
  toggleWeeklyTestActive,
  checkWeeklyTestsTableExists,
} from '@/lib/weeklyTestService';
import { supabase } from '@/lib/supabase';

const EXAM_TYPES = [
  'Police Bharti',
  'MPSC Rajyaseva',
  'Combine Group B & C',
  'Talathi Bharti',
];

export default function WeeklyTestsPage() {
  const { toast, confirm, alert: customAlert } = useFeedback();

  const [tests, setTests] = useState<WeeklyTest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableExists, setTableExists] = useState<boolean>(true);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('महाराष्ट्र पोलीस भरती साप्ताहिक महासराव चाचणी #1');
  const [newExamType, setNewExamType] = useState<string>('Police Bharti');
  const [newDate, setNewDate] = useState<string>(() => {
    // Default to upcoming Sunday
    const d = new Date();
    const day = d.getDay();
    const diff = (7 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  });
  const [newTime, setNewTime] = useState<string>('12:00');
  const [newDuration, setNewDuration] = useState<number>(90);
  const [selectedQuestions, setSelectedQuestions] = useState<WeeklyTestQuestion[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Question Preview Modal State
  const [previewTest, setPreviewTest] = useState<WeeklyTest | null>(null);

  // SQL Copy State
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    setLoading(true);
    try {
      const exists = await checkWeeklyTestsTableExists();
      setTableExists(exists);
      const data = await fetchWeeklyTests();
      setTests(data);
    } catch (err: any) {
      toast('error', 'Failed to load weekly tests', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Open Create Modal & check if questions are waiting in session storage from Extractor
  const handleOpenCreateModal = () => {
    setShowCreateModal(true);

    if (typeof window !== 'undefined') {
      const pendingExtractor = sessionStorage.getItem('prashnix_pending_weekly_test_questions');
      if (pendingExtractor) {
        try {
          const parsed = JSON.parse(pendingExtractor);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSelectedQuestions(parsed);
            toast('info', 'Loaded from Extractor', `Found ${parsed.length} questions from your recent PDF extraction.`);
            return;
          }
        } catch {}
      }
    }
  };

  // Load questions from DB question bank to reach 100 questions
  const handleAutoFillFromBank = async () => {
    try {
      toast('info', 'Fetching Questions', 'Loading verified questions from Question Bank...');
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .limit(100);

      if (error || !data || data.length === 0) {
        toast('warning', 'No Questions in Bank', 'Drop a 100-question PDF in AI PDF Extractor first.');
        return;
      }

      const formatted: WeeklyTestQuestion[] = data.map((q: any, idx: number) => {
        const content = q.content || {};
        const opts = content.options || [];
        return {
          id: q.id || `q_${idx}`,
          questionNumber: idx + 1,
          questionText: content.text || q.question_text || 'प्रश्न',
          optionA: opts[0] || q.option_a || '',
          optionB: opts[1] || q.option_b || '',
          optionC: opts[2] || q.option_c || '',
          optionD: opts[3] || q.option_d || '',
          correctOption: q.correct_answer || q.correct_option || 'A',
          correctAnswer: q.correct_answer || opts[0] || '',
          explanation: content.explanation || q.explanation || '',
        };
      });

      setSelectedQuestions(formatted.slice(0, 100));
      toast('success', 'Questions Loaded', `Selected ${Math.min(100, formatted.length)} questions for this test.`);
    } catch (err: any) {
      toast('error', 'Error Loading Questions', err.message);
    }
  };

  // Save new Weekly Test
  const handleSaveTest = async () => {
    if (!newTitle.trim()) {
      toast('warning', 'Title Required', 'Please enter a test title.');
      return;
    }
    if (!newDate) {
      toast('warning', 'Date Required', 'Please pick a scheduled test date from the calendar.');
      return;
    }
    if (selectedQuestions.length !== 100) {
      toast(
        'error',
        'Strict 100 Questions Required',
        `A Weekly Test must have exactly 100 questions. Current count: ${selectedQuestions.length} / 100.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const scheduledDateTime = `${newDate}T${newTime}:00Z`;

      const result = await saveWeeklyTest({
        title: newTitle.trim(),
        exam_type: newExamType,
        scheduled_date: newDate,
        start_time: scheduledDateTime,
        duration_minutes: newDuration,
        total_marks: 100,
        questions: selectedQuestions,
        is_active: true,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save weekly test');
      }

      toast(
        'success',
        'Weekly Test Scheduled!',
        `Test "${newTitle}" with 100 questions scheduled for ${newDate} at ${newTime}!`
      );

      // Clear pending storage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('prashnix_pending_weekly_test_questions');
      }

      setShowCreateModal(false);
      setSelectedQuestions([]);
      loadTests();
    } catch (err: any) {
      customAlert('Save Failed', err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Test
  const handleDelete = (test: WeeklyTest) => {
    confirm({
      title: 'Delete Weekly Test?',
      message: `Are you sure you want to delete "${test.title}" scheduled for ${test.scheduled_date}?`,
      confirmText: 'Yes, Delete Test',
      onConfirm: async () => {
        try {
          await deleteWeeklyTest(test.id, test.source);
          toast('success', 'Test Deleted', 'Weekly test removed successfully.');
          loadTests();
        } catch (err: any) {
          toast('error', 'Delete Failed', err.message);
        }
      },
    });
  };

  // Toggle active
  const handleToggleActive = async (test: WeeklyTest) => {
    try {
      await toggleWeeklyTestActive(test.id, !test.is_active, test.source);
      toast('info', 'Status Updated', `Test is now ${!test.is_active ? 'Active' : 'Inactive'}.`);
      loadTests();
    } catch (err: any) {
      toast('error', 'Status Change Failed', err.message);
    }
  };

  const copySqlSchema = () => {
    const sql = `-- Run this in Supabase SQL Editor if table doesn't exist
CREATE TABLE IF NOT EXISTS public.weekly_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  exam_type TEXT NOT NULL DEFAULT 'Police Bharti',
  scheduled_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 90,
  total_marks INTEGER DEFAULT 100,
  total_questions INTEGER DEFAULT 100,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.weekly_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read for weekly_tests" ON public.weekly_tests FOR SELECT USING (true);
CREATE POLICY "Enable insert for weekly_tests" ON public.weekly_tests FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for weekly_tests" ON public.weekly_tests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for weekly_tests" ON public.weekly_tests FOR DELETE USING (true);
`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
    toast('success', 'SQL Copied', 'Paste into your Supabase Dashboard SQL Editor.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 tracking-tight">
            Weekly examinations
          </h1>
          <p className="text-slate-500 text-sm mt-1 leading-relaxed">
            Schedule official 100-question weekly mock tests with calendar dates and timers for candidates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copySqlSchema}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Copy SQL migration for weekly_tests table"
          >
            {copiedSql ? <Check size={14} className="text-emerald-700" /> : <Copy size={14} />}
            <span>{copiedSql ? 'SQL copied' : 'Copy Supabase SQL'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus size={15} />
            Schedule test
          </button>
        </div>
      </div>

      {/* Supabase Persistence Status Banner */}
      <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
          <span>
            Storage mode:{' '}
            <strong className="text-slate-900 font-medium">
              {tableExists ? 'Dedicated table (weekly_tests)' : 'Curriculum nodes (auto-fallback)'}
            </strong>
          </span>
          <span className="text-slate-400">• App sync active</span>
        </div>

        {!tableExists && (
          <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">
            Node storage fallback active. Run SQL migration for dedicated table.
          </span>
        )}
      </div>

      {/* Test List */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center space-y-3">
          <RefreshCw size={24} className="animate-spin text-indigo-600 mx-auto" />
          <div className="text-sm font-semibold text-gray-600">Loading scheduled weekly tests...</div>
        </div>
      ) : tests.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-300 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
            <Trophy size={28} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">No Weekly Tests Scheduled Yet</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              You can drop a 100-question PDF into the AI PDF Extractor and click &quot;Auto Set to Weekly Test&quot;,
              or click the button below to schedule one manually.
            </p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all shadow-sm"
          >
            <Plus size={15} />
            Schedule First Weekly Test
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tests.map((test) => {
            const isLive = test.is_active;
            const scheduledDate = new Date(test.scheduled_date);
            const dateStr = scheduledDate.toLocaleDateString('mr-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <div
                key={test.id}
                className="bg-white border border-gray-200 hover:border-emerald-300 rounded-2xl p-5 transition-all shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {test.exam_type}
                    </span>
                    <button
                      onClick={() => handleToggleActive(test)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors ${
                        isLive
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title="Toggle Active Status"
                    >
                      <Power size={11} />
                      {isLive ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">
                      {test.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2 font-medium">
                      <CalendarIcon size={14} className="text-emerald-600" />
                      <span>{dateStr}</span>
                      {test.start_time && (
                        <>
                          <span>•</span>
                          <Clock size={13} className="text-emerald-600" />
                          <span>{test.start_time.split('T')[1]?.slice(0, 5) || '12:00'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metrics Badges */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Questions</div>
                      <div className="text-sm font-extrabold text-gray-900 mt-0.5">
                        {test.total_questions || test.questions?.length || 100}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Marks</div>
                      <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                        {test.total_marks || 100}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Duration</div>
                      <div className="text-sm font-extrabold text-gray-900 mt-0.5">
                        {test.duration_minutes || 90}m
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => setPreviewTest(test)}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
                  >
                    <Eye size={14} />
                    Preview {test.questions?.length || 100} Questions
                  </button>

                  <button
                    onClick={() => handleDelete(test)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete Test"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule / Create Weekly Test Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-indigo-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                  <CalendarIcon size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900 text-base">Schedule 100-Mark Weekly Test</h3>
                  <p className="text-xs text-gray-500">Pick date, calendar time & verify 100 questions</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Test Title */}
              <div>
                <label className="font-bold text-gray-700 block mb-1">Weekly Test Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="उदा. महाराष्ट्र पोलीस भरती साप्ताहिक महासराव चाचणी #1"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>

              {/* Exam Category */}
              <div>
                <label className="font-bold text-gray-700 block mb-1">Target Exam Category</label>
                <select
                  value={newExamType}
                  onChange={(e) => setNewExamType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-semibold text-gray-800 outline-none"
                >
                  {EXAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Calendar Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-gray-700 block mb-1 flex items-center gap-1.5">
                    <CalendarIcon size={14} className="text-emerald-600" />
                    Scheduled Date (Calendar)
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 block mb-1 flex items-center gap-1.5">
                    <Clock size={14} className="text-emerald-600" />
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none"
                  />
                </div>
              </div>

              {/* Duration and Marks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={newDuration}
                    onChange={(e) => setNewDuration(parseInt(e.target.value, 10) || 90)}
                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl font-semibold text-gray-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={100}
                    disabled
                    className="w-full px-3.5 py-2 bg-gray-100 border border-gray-200 rounded-xl font-semibold text-gray-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Strict 100 Questions Validator */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-800 flex items-center gap-2">
                    <Trophy size={16} className="text-emerald-600" />
                    Question Allocation (Strict 100 Qs Rule)
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                      selectedQuestions.length === 100
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {selectedQuestions.length} / 100 Questions
                  </span>
                </div>

                {selectedQuestions.length === 100 ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-2 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>Exact 100 questions verified! Ready to schedule on Supabase.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-center gap-2 font-medium">
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                      <span>
                        Weekly test requires exactly 100 questions. Current count:{' '}
                        <strong>{selectedQuestions.length}</strong>.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAutoFillFromBank}
                        className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg text-xs font-semibold text-gray-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Sparkles size={13} className="text-indigo-600" />
                        Fill 100 from Question Bank
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleSaveTest}
                disabled={isSaving || selectedQuestions.length !== 100}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                  isSaving || selectedQuestions.length !== 100
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                }`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Scheduling Test...
                  </>
                ) : (
                  <>
                    <CalendarIcon size={14} />
                    Schedule Test (100 Qs)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Questions Modal */}
      {previewTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">{previewTest.title}</h3>
                <p className="text-xs text-gray-500">
                  {previewTest.exam_type} • Scheduled:{' '}
                  {new Date(previewTest.scheduled_date).toLocaleDateString('mr-IN')} •{' '}
                  {previewTest.questions?.length || 100} Questions
                </p>
              </div>
              <button
                onClick={() => setPreviewTest(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 text-xs">
              {previewTest.questions && previewTest.questions.length > 0 ? (
                previewTest.questions.map((q, idx) => (
                  <div key={q.id || idx} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-mono font-bold rounded">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-gray-900 leading-relaxed">{q.questionText}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'A'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        A) {q.optionA}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'B'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        B) {q.optionB}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'C'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        C) {q.optionC}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'D'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        D) {q.optionD}
                      </div>
                    </div>

                    {q.explanation && (
                      <div className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        <strong>स्पष्टीकरण:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Questions are stored in curriculum node lessons.
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setPreviewTest(null)}
                className="px-4 py-2 text-xs font-semibold bg-gray-200 hover:bg-gray-300 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
