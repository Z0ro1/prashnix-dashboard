'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Flag,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  Eye,
  ExternalLink,
  RotateCcw,
  RefreshCw,
  X,
  FileQuestion,
  User,
  MapPin,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface QuestionReport {
  id: string;
  user_id: string | null;
  question_id: string;
  display_code: string | null;
  reason_category: string;
  reason_details: string;
  suggested_correct_answer: string;
  status: 'pending' | 'resolved' | 'dismissed';
  user_email: string | null;
  metadata?: {
    platform?: string;
    district?: string;
    source?: string;
    reported_at?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

interface QuestionDetails {
  id: string;
  display_id: string;
  question_type: string;
  content: {
    text?: string;
    options?: string[];
    explanation?: string;
    pyq_year?: number | string;
    district_tag?: string;
    subject_tag?: string;
  };
  correct_answer?: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');
  const [search, setSearch] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Question inspect modal state
  const [inspectReport, setInspectReport] = useState<QuestionReport | null>(null);
  const [questionData, setQuestionData] = useState<QuestionDetails | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  // Delete confirmation modal state
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reported_questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reported questions:', error);
        setFeedbackMsg({ type: 'error', text: 'Failed to load reported questions.' });
      } else if (data) {
        setReports(data as QuestionReport[]);
      }
    } catch (e) {
      console.error('Exception fetching reports:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId: string, newStatus: 'pending' | 'resolved' | 'dismissed') => {
    setActionInProgress(reportId);
    try {
      const { error } = await supabase
        .from('reported_questions')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) {
        setFeedbackMsg({ type: 'error', text: `Failed to update status: ${error.message}` });
      } else {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: newStatus, updated_at: new Date().toISOString() } : r))
        );
        if (inspectReport && inspectReport.id === reportId) {
          setInspectReport((prev) => prev ? { ...prev, status: newStatus } : null);
        }
        setFeedbackMsg({
          type: 'success',
          text: newStatus === 'resolved' ? 'Report marked as resolved.' : newStatus === 'dismissed' ? 'Report dismissed.' : 'Report reopened as pending.'
        });
      }
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: `Error updating status: ${e.message || e}` });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    setActionInProgress(reportId);
    try {
      const { error } = await supabase
        .from('reported_questions')
        .delete()
        .eq('id', reportId);

      if (error) {
        setFeedbackMsg({ type: 'error', text: `Failed to delete report: ${error.message}` });
      } else {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        if (inspectReport && inspectReport.id === reportId) {
          setInspectReport(null);
          setQuestionData(null);
        }
        setFeedbackMsg({ type: 'success', text: 'Report permanently deleted.' });
      }
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: `Error deleting report: ${e.message || e}` });
    } finally {
      setActionInProgress(null);
      setReportToDelete(null);
    }
  };

  const openInspectModal = async (report: QuestionReport) => {
    setInspectReport(report);
    setQuestionData(null);
    setLoadingQuestion(true);

    try {
      const searchTarget = report.question_id || report.display_code || '';
      
      // Attempt 1: Search by display_id
      let { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('display_id', searchTarget)
        .maybeSingle();

      // Attempt 2: If not found, try searching by UUID
      if (!data && searchTarget.includes('-')) {
        const res = await supabase
          .from('questions')
          .select('*')
          .eq('id', searchTarget)
          .maybeSingle();
        data = res.data;
      }

      // Attempt 3: If still not found, search with like pattern
      if (!data && searchTarget) {
        const res = await supabase
          .from('questions')
          .select('*')
          .ilike('display_id', `%${searchTarget}%`)
          .limit(1)
          .maybeSingle();
        data = res.data;
      }

      if (data) {
        setQuestionData(data as QuestionDetails);
      }
    } catch (e) {
      console.error('Error fetching question details:', e);
    } finally {
      setLoadingQuestion(false);
    }
  };

  // Filtered and searched reports
  const filteredReports = reports.filter((report) => {
    const matchesFilter = filterStatus === 'all' || report.status === filterStatus;
    if (!matchesFilter) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const id = (report.question_id || '').toLowerCase();
    const code = (report.display_code || '').toLowerCase();
    const reason = (report.reason_details || '').toLowerCase();
    const answer = (report.suggested_correct_answer || '').toLowerCase();
    const email = (report.user_email || '').toLowerCase();
    const district = (report.metadata?.district || '').toLowerCase();
    const category = (report.reason_category || '').toLowerCase();

    return (
      id.includes(q) ||
      code.includes(q) ||
      reason.includes(q) ||
      answer.includes(q) ||
      email.includes(q) ||
      district.includes(q) ||
      category.includes(q)
    );
  });

  const pendingCount = reports.filter((r) => r.status === 'pending').length;
  const resolvedCount = reports.filter((r) => r.status === 'resolved').length;
  const dismissedCount = reports.filter((r) => r.status === 'dismissed').length;

  const formatCategory = (cat: string) => {
    switch (cat) {
      case 'wrong_answer':
        return 'Wrong Answer';
      case 'typo':
        return 'Typo / Spelling Error';
      case 'out_of_syllabus':
        return 'Out of Syllabus';
      case 'inappropriate':
        return 'Inappropriate Content';
      case 'multiple_correct':
        return 'Multiple Correct Answers';
      default:
        return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown date';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Feedback Message */}
      {feedbackMsg && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm transition-all ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Flag className="w-6 h-6 text-rose-600" /> Reported Questions
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Review question issues reported by app users, inspect original questions, and update statuses.
          </p>
        </div>
        <button
          onClick={fetchReports}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Reports</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{reports.length}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 uppercase tracking-wider">Pending Action</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{pendingCount}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{resolvedCount}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Dismissed</span>
            <XCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600">{dismissedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-sm w-fit">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({reports.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              filterStatus === 'pending'
                ? 'bg-white text-amber-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              filterStatus === 'resolved'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            onClick={() => setFilterStatus('dismissed')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              filterStatus === 'dismissed'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dismissed ({dismissedCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, text, category, district, or email..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
          <p className="text-sm">Loading reported questions...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Reports Found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? `No reported questions matching "${search}".`
              : filterStatus !== 'all'
              ? `No ${filterStatus} reports at this time.`
              : 'There are currently no reported questions submitted by users.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => {
            const isPending = report.status === 'pending';
            const isResolved = report.status === 'resolved';
            const isDismissed = report.status === 'dismissed';
            const isProcessing = actionInProgress === report.id;

            return (
              <div
                key={report.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-colors"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                        isPending
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : isResolved
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {isPending && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                      {isResolved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      {isDismissed && <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                      {report.status.toUpperCase()}
                    </span>

                    {/* Question ID */}
                    <span className="font-mono text-xs px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md font-medium border border-slate-200">
                      ID: {report.question_id || report.display_code || 'N/A'}
                    </span>

                    {/* Category */}
                    <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md font-medium border border-indigo-100">
                      {formatCategory(report.reason_category)}
                    </span>
                  </div>

                  {/* Date & Metadata */}
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDate(report.created_at)}
                    </span>
                  </div>
                </div>

                {/* Reporter information bar */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-3">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {report.user_email || 'Anonymous Student'}
                  </span>
                  {report.metadata?.district && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      District: {report.metadata.district}
                    </span>
                  )}
                  {report.metadata?.platform && (
                    <span className="text-slate-500">
                      Platform: <span className="uppercase font-mono">{report.metadata.platform}</span>
                    </span>
                  )}
                </div>

                {/* Report Details and Suggested Answer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1">
                      Report Reason & Student Feedback
                    </span>
                    <p className="text-sm text-slate-800 leading-relaxed break-words whitespace-pre-wrap">
                      {report.reason_details || 'No details provided.'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-indigo-50/60 rounded-lg border border-indigo-100">
                    <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide block mb-1">
                      Student Suggested Correct Answer
                    </span>
                    <p className="text-sm text-slate-900 font-medium leading-relaxed break-words whitespace-pre-wrap">
                      {report.suggested_correct_answer || 'No suggested answer submitted.'}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openInspectModal(report)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect Question
                    </button>
                    <Link
                      href={`/dashboard/questions?search=${encodeURIComponent(report.question_id || '')}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      Open in Question Bank
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status transition buttons */}
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(report.id, 'resolved')}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark Resolved
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(report.id, 'dismissed')}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(report.id, 'pending')}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reopen
                      </button>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={() => setReportToDelete(report.id)}
                      disabled={isProcessing}
                      title="Delete Report"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Question Inspection Modal */}
      {inspectReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <FileQuestion className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Question Inspection
                  </h3>
                  <span className="font-mono text-xs text-slate-500">
                    Report ID: {inspectReport.id} • Target ID: {inspectReport.question_id || inspectReport.display_code}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setInspectReport(null);
                  setQuestionData(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Top: Student report summary */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                    Student Issue ({formatCategory(inspectReport.reason_category)})
                  </span>
                  <span className="text-xs text-amber-700">
                    By {inspectReport.user_email || 'Student'}
                  </span>
                </div>
                <p className="text-sm text-slate-800 mb-3">{inspectReport.reason_details}</p>
                <div className="bg-white border border-amber-200 rounded-lg p-2.5 text-xs text-slate-900">
                  <span className="font-semibold text-amber-900 block mb-0.5">Student Suggested Answer:</span>
                  {inspectReport.suggested_correct_answer}
                </div>
              </div>

              {/* Bottom: Live Question Bank Record */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center justify-between">
                  <span>Question Bank Record</span>
                  {questionData && (
                    <span className="font-normal font-mono text-xs text-slate-500">
                      UUID: {questionData.id}
                    </span>
                  )}
                </h4>

                {loadingQuestion ? (
                  <div className="p-8 text-center text-slate-500 border border-slate-200 rounded-xl">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
                    <p className="text-xs">Fetching question from database...</p>
                  </div>
                ) : questionData ? (
                  <div className="space-y-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    {/* Question text */}
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                        Question Text
                      </span>
                      <p className="text-base font-medium text-slate-900 leading-relaxed">
                        {questionData.content?.text || 'No question text found.'}
                      </p>
                    </div>

                    {/* Options list */}
                    {questionData.content?.options && Array.isArray(questionData.content.options) && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                          Options
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {questionData.content.options.map((opt, index) => {
                            const isCorrect =
                              questionData.correct_answer === opt ||
                              questionData.correct_answer === String.fromCharCode(65 + index) ||
                              questionData.correct_answer === String(index + 1);

                            return (
                              <div
                                key={index}
                                className={`p-3 rounded-lg border text-sm flex items-start justify-between gap-2 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-700'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                                    {String.fromCharCode(65 + index)}
                                  </span>
                                  <span>{opt}</span>
                                </div>
                                {isCorrect && (
                                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded shrink-0">
                                    CURRENT KEY
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                    {questionData.content?.explanation && (
                      <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs">
                        <span className="font-semibold text-slate-700 block mb-1">Explanation:</span>
                        <p className="text-slate-600 leading-relaxed">{questionData.content.explanation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                    <p className="text-sm font-medium text-slate-700">Question record not found in database.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      No question matched ID: <code className="font-mono">{inspectReport.question_id}</code>. It may have been previously modified or deleted.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-5 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <Link
                href={`/dashboard/questions?search=${encodeURIComponent(inspectReport.question_id || '')}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Edit in Question Bank <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <div className="flex items-center gap-2">
                {inspectReport.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(inspectReport.id, 'resolved')}
                      className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      Mark as Resolved
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(inspectReport.id, 'dismissed')}
                      className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus(inspectReport.id, 'pending')}
                    className="px-3.5 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 transition-colors"
                  >
                    Reopen as Pending
                  </button>
                )}
                <button
                  onClick={() => {
                    setInspectReport(null);
                    setQuestionData(null);
                  }}
                  className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {reportToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Delete Report?</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this report record? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setReportToDelete(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteReport(reportToDelete)}
                disabled={actionInProgress === reportToDelete}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {actionInProgress === reportToDelete ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
