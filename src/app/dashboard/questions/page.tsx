'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search,
  HelpCircle,
  Trash2,
  Calendar,
  MapPin,
  CheckCircle2,
  Loader2,
  BookOpen,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
  Edit3,
  Copy,
} from 'lucide-react';
import { useFeedback } from '@/components/FeedbackDialog';

interface QuestionItem {
  id: string;
  lesson_id: string | null;
  display_id: string;
  question_type: string;
  correct_answer: string;
  created_at: string;
  content: {
    text: string;
    options: string[];
    explanation?: string;
    pyq_year?: number | null;
    district_tag?: string | null;
  };
}

function normalizeText(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ')
    .replace(/[?!.,:;।॥]+$/g, '')
    .trim();
}

export default function QuestionBankPage() {
  const { toast, confirm } = useFeedback();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Duplicate Scanner State
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err: unknown) {
      console.error('Error fetching questions:', err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    confirm({
      title: 'Delete Question?',
      message: 'Are you sure you want to permanently delete this question from the Question Bank? This action cannot be undone.',
      confirmText: 'Delete Question',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        setDeletingId(id);
        try {
          const { error } = await supabase.from('questions').delete().eq('id', id);
          if (error) throw error;
          setQuestions((prev) => prev.filter((q) => q.id !== id));
          toast('success', 'Question Deleted', 'The question has been removed from the database.');
        } catch (err: unknown) {
          toast('error', 'Delete Failed', err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  // Edit Question State
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    text: '',
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: '',
    pyq_year: '',
    district_tag: '',
  });

  const startEditing = (q: QuestionItem) => {
    setEditingQuestion(q);
    const opts = [...(q.content?.options || [])];
    while (opts.length < 4) opts.push('');
    setEditForm({
      text: q.content?.text || '',
      options: opts,
      correct_answer: q.correct_answer || opts[0] || '',
      explanation: q.content?.explanation || '',
      pyq_year: q.content?.pyq_year ? String(q.content.pyq_year) : '',
      district_tag: q.content?.district_tag || '',
    });
  };

  const handleOptionChange = (idx: number, value: string) => {
    const oldVal = editForm.options[idx];
    const newOptions = [...editForm.options];
    newOptions[idx] = value;

    let newCorrect = editForm.correct_answer;
    if (newCorrect === oldVal || newCorrect === String.fromCharCode(65 + idx) || newCorrect === String(idx + 1)) {
      newCorrect = value;
    }

    setEditForm((prev) => ({
      ...prev,
      options: newOptions,
      correct_answer: newCorrect,
    }));
  };

  const setCorrectOption = (optVal: string) => {
    setEditForm((prev) => ({ ...prev, correct_answer: optVal }));
  };

  const saveEditing = async () => {
    if (!editingQuestion) return;
    if (!editForm.text.trim()) {
      toast('error', 'Validation Error', 'Question text cannot be empty.');
      return;
    }
    const cleanOptions = editForm.options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      toast('error', 'Validation Error', 'Please provide at least 2 options.');
      return;
    }
    if (!editForm.correct_answer.trim()) {
      toast('error', 'Validation Error', 'Please designate a correct answer.');
      return;
    }

    setSavingEdit(true);
    try {
      const updatedContent = {
        ...editingQuestion.content,
        text: editForm.text.trim(),
        options: editForm.options.map((o) => o.trim()),
        explanation: editForm.explanation.trim() || undefined,
        pyq_year: editForm.pyq_year ? parseInt(editForm.pyq_year, 10) : null,
        district_tag: editForm.district_tag.trim() || null,
      };

      const { error } = await supabase
        .from('questions')
        .update({
          correct_answer: editForm.correct_answer.trim(),
          content: updatedContent,
        })
        .eq('id', editingQuestion.id);

      if (error) throw error;

      setQuestions((prev) =>
        prev.map((item) =>
          item.id === editingQuestion.id
            ? {
                ...item,
                correct_answer: editForm.correct_answer.trim(),
                content: updatedContent,
              }
            : item
        )
      );

      toast('success', 'Question Updated', 'Question text, options, and explanation saved.');
      setEditingQuestion(null);
    } catch (err: unknown) {
      toast('error', 'Update Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Copy Question & AI Prompt State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getFormattedQuestionPrompt = (
    text: string,
    options: string[],
    correctAnswer: string,
    existingExplanation?: string
  ) => {
    const optionsText = options
      .map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`)
      .join('\n');

    const normAns = (correctAnswer || '').trim();
    let correctDisplay = normAns;
    options.forEach((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      const num = String(i + 1);
      if (normAns === opt || normAns.toUpperCase() === letter || normAns === num) {
        correctDisplay = `${letter}) ${opt}`;
      }
    });

    const explanationPart = existingExplanation?.trim()
      ? `${existingExplanation.trim()}\n\n(Prompt: Give me a small explanation of the correct answer.)`
      : 'Give me a small explanation of the correct answer.';

    return `Question:
${text}

Options:
${optionsText}

Correct Answer:
${correctDisplay}

Explanation:
${explanationPart}`;
  };

  const handleCopyQuestion = async (q: QuestionItem) => {
    const formatted = getFormattedQuestionPrompt(
      q.content?.text || '',
      q.content?.options || [],
      q.correct_answer || '',
      q.content?.explanation
    );

    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedId(q.id);
      toast('success', 'Question Copied', 'Question, options, answer, and explanation prompt copied.');
      setTimeout(() => {
        setCopiedId((curr) => (curr === q.id ? null : curr));
      }, 2000);
    } catch (err: unknown) {
      toast('error', 'Copy Failed', err instanceof Error ? err.message : 'Clipboard access denied.');
    }
  };

  const copyCurrentEditPrompt = async () => {
    const formatted = getFormattedQuestionPrompt(
      editForm.text,
      editForm.options.filter(Boolean),
      editForm.correct_answer,
      editForm.explanation
    );
    try {
      await navigator.clipboard.writeText(formatted);
      toast('success', 'Prompt Copied', 'Ready to paste into ChatGPT/Claude to get an explanation.');
    } catch (err: unknown) {
      toast('error', 'Copy Failed', err instanceof Error ? err.message : 'Clipboard access denied.');
    }
  };

  // Duplicate Clusters Calculation
  const duplicateClusters = useMemo(() => {
    const groups = new Map<string, QuestionItem[]>();
    for (const q of questions) {
      const norm = normalizeText(q.content?.text || '');
      if (!norm) continue;
      const list = groups.get(norm) || [];
      list.push(q);
      groups.set(norm, list);
    }

    // Only keep groups with > 1 question
    const dupes: { normalizedText: string; items: QuestionItem[] }[] = [];
    for (const [norm, items] of groups.entries()) {
      if (items.length > 1) {
        dupes.push({ normalizedText: norm, items });
      }
    }
    return dupes;
  }, [questions]);

  // Set of IDs that are duplicate questions
  const duplicateIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const cluster of duplicateClusters) {
      for (const item of cluster.items) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [duplicateClusters]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (showDuplicatesOnly && !duplicateIdSet.has(q.id)) {
        return false;
      }
      const text = (q.content?.text || '').toLowerCase();
      const explanation = (q.content?.explanation || '').toLowerCase();
      const district = (q.content?.district_tag || '').toLowerCase();
      const s = search.toLowerCase();
      return text.includes(s) || explanation.includes(s) || district.includes(s);
    });
  }, [questions, search, showDuplicatesOnly, duplicateIdSet]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <HelpCircle className="text-indigo-600" /> Question Bank
          </h2>
          <p className="text-gray-600 mt-1">
            Browse, search, and audit all {questions.length} questions in the repository.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {duplicateClusters.length > 0 && (
            <button
              onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                showDuplicatesOnly
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <AlertTriangle size={15} />
              {showDuplicatesOnly
                ? 'Showing Duplicates (Click to Show All)'
                : `Filter Duplicates (${duplicateClusters.length} clusters)`}
            </button>
          )}

          <button
            onClick={() => setShowScanModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
          >
            <RefreshCw size={14} />
            Scan Database Duplicates
          </button>
        </div>
      </div>

      {/* Duplicate Alert Banner if any exist */}
      {duplicateClusters.length > 0 && !showDuplicatesOnly && (
        <div className="mb-6 bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="font-bold text-amber-900 text-sm">
                {duplicateClusters.length} Duplicate Question Groups Detected
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                Some questions appear in multiple lessons or have been duplicated. You can clean them up directly.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowDuplicatesOnly(true)}
            className="text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 px-3.5 py-1.5 rounded-lg transition-colors shrink-0 shadow-sm"
          >
            Review Duplicates
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center gap-3">
        <Search className="text-gray-400 shrink-0" size={20} />
        <input
          type="text"
          placeholder="Search by question text, explanation, or district..."
          className="flex-1 outline-none text-gray-700 bg-transparent text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 bg-gray-100 rounded"
          >
            Clear
          </button>
        )}
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-gray-100 flex items-center justify-center text-gray-500">
          <Loader2 className="animate-spin text-indigo-600 mr-2" /> Loading question bank...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-500 text-sm">
          No questions found matching your filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q, idx) => {
            const isDup = duplicateIdSet.has(q.id);

            return (
              <div
                key={q.id}
                className={`bg-white p-5 rounded-xl border shadow-sm transition-colors ${
                  isDup ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-100 hover:border-indigo-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        #{idx + 1}
                      </span>
                      {isDup && (
                        <span className="text-xs flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
                          <AlertTriangle size={12} /> Duplicate Question
                        </span>
                      )}
                      {q.content?.pyq_year && (
                        <span className="text-xs flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">
                          <Calendar size={12} /> {q.content.pyq_year}
                        </span>
                      )}
                      {q.content?.district_tag && (
                        <span className="text-xs flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                          <MapPin size={12} /> {q.content.district_tag}
                        </span>
                      )}
                      {q.lesson_id ? (
                        <span className="text-xs flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">
                          <BookOpen size={12} /> Linked to Lesson
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                          Global Pool
                        </span>
                      )}
                    </div>

                    <h3 className="text-gray-900 font-semibold text-base mb-3 leading-relaxed">
                      {q.content?.text || 'No question text'}
                    </h3>

                    {/* Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {(q.content?.options || []).map((opt, i) => {
                        const optLetter = String.fromCharCode(65 + i);
                        const optNum = String(i + 1);
                        const normAns = (q.correct_answer || '').trim();
                        const isCorrect =
                          normAns === opt ||
                          normAns.toUpperCase() === optLetter ||
                          normAns === optNum ||
                          (normAns !== '' && opt !== '' && normAns.toLowerCase() === opt.trim().toLowerCase());
                        return (
                          <div
                            key={i}
                            className={`p-2.5 rounded-lg text-xs border flex items-center justify-between ${
                              isCorrect
                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 font-medium'
                                : 'bg-gray-50 border-gray-100 text-gray-700'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-400">
                                {optLetter}.
                              </span>
                              {opt}
                            </span>
                            {isCorrect && <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>

                    {q.content?.explanation && (
                      <div className="p-3 bg-indigo-50/50 rounded-lg text-xs text-indigo-900 border border-indigo-100/60">
                        <span className="font-semibold text-indigo-700">Explanation: </span>
                        {q.content.explanation}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopyQuestion(q)}
                      className={`p-2 rounded-lg transition-all ${
                        copiedId === q.id
                          ? 'text-emerald-600 bg-emerald-50 ring-1 ring-emerald-200'
                          : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                      }`}
                      title={copiedId === q.id ? 'Copied to clipboard!' : 'Copy question & answer prompt'}
                    >
                      {copiedId === q.id ? (
                        <Check size={18} className="text-emerald-600" />
                      ) : (
                        <Copy size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => startEditing(q)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit Question"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      disabled={deletingId === q.id}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Question"
                    >
                      {deletingId === q.id ? (
                        <Loader2 size={18} className="animate-spin text-red-500" />
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- DUPLICATE AUDIT MODAL --- */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={20} />
                Database Duplicate Scanner
              </h3>
              <button
                onClick={() => setShowScanModal(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {duplicateClusters.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-bold text-gray-800 text-base">All Questions Are Unique!</p>
                  <p className="text-xs text-gray-400 mt-1">
                    No duplicate questions were found across any lessons in the database.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-gray-600">
                    Found <strong>{duplicateClusters.length}</strong> questions that appear more than
                    once in Supabase. You can remove redundant copies below:
                  </div>

                  {duplicateClusters.map((cluster, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-4 border border-amber-200 bg-amber-50/30 rounded-xl space-y-3"
                    >
                      <div className="font-bold text-gray-900 text-sm">
                        "{cluster.items[0]?.content?.text}"
                      </div>
                      <div className="text-xs text-gray-500">
                        Appears in <strong>{cluster.items.length}</strong> instances:
                      </div>

                      <div className="space-y-2">
                        {cluster.items.map((item, iIdx) => (
                          <div
                            key={item.id}
                            className="bg-white p-3 rounded-lg border border-gray-200 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-medium text-gray-800">
                                Copy #{iIdx + 1} • ID: {item.id.substring(0, 8)}...
                              </div>
                              <div className="text-gray-400 text-[11px] mt-0.5">
                                Created: {new Date(item.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-md font-semibold text-xs flex items-center gap-1 transition-colors"
                            >
                              <Trash2 size={13} />
                              Delete this copy
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowScanModal(false)}
                className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-xl text-xs hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT QUESTION MODAL --- */}
      {editingQuestion && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Edit3 className="text-indigo-600" size={20} />
                Edit Question
              </h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Question Text */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Question Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={editForm.text}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  placeholder="Enter question text in Marathi or English..."
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
              </div>

              {/* Options */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Answer Options & Correct Answer <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-gray-500">
                    Click an option letter or button to set it as correct
                  </span>
                </div>

                <div className="space-y-2.5">
                  {editForm.options.map((opt, i) => {
                    const optLetter = String.fromCharCode(65 + i);
                    const optNum = String(i + 1);
                    const normAns = (editForm.correct_answer || '').trim();
                    const isSelected =
                      normAns === opt ||
                      normAns.toUpperCase() === optLetter ||
                      normAns === optNum ||
                      (opt !== '' && normAns.toLowerCase() === opt.trim().toLowerCase());

                    return (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-300'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCorrectOption(opt || optLetter)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title="Click to mark as correct answer"
                        >
                          {isSelected ? <Check size={14} strokeWidth={3} /> : optLetter}
                        </button>

                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                          placeholder={`Option ${optLetter}`}
                          className="flex-1 bg-transparent text-sm text-gray-900 outline-none"
                        />

                        {isSelected ? (
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-md shrink-0 flex items-center gap-1">
                            <CheckCircle2 size={13} /> Correct Answer
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCorrectOption(opt || optLetter)}
                            className="text-[11px] font-medium text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition-colors shrink-0"
                          >
                            Mark Correct
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explanation */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Explanation / Reasoning (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={copyCurrentEditPrompt}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    title="Copy formatted question & prompt to paste into AI for generating explanation"
                  >
                    <Copy size={12} /> Copy AI Prompt
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={editForm.explanation}
                  onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                  placeholder="Explain why this answer is correct (shown to students in the app)..."
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
              </div>

              {/* Metadata: PYQ Year & District */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    PYQ Year
                  </label>
                  <input
                    type="number"
                    value={editForm.pyq_year}
                    onChange={(e) => setEditForm({ ...editForm, pyq_year: e.target.value })}
                    placeholder="e.g. 2023"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    District Tag
                  </label>
                  <input
                    type="text"
                    value={editForm.district_tag}
                    onChange={(e) => setEditForm({ ...editForm, district_tag: e.target.value })}
                    placeholder="e.g. Pune, Mumbai, Thane"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                disabled={savingEdit}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditing}
                disabled={savingEdit}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {savingEdit ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
