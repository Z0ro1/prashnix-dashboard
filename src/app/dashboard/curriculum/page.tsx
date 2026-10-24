'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  Upload,
  Trash2,
  Edit,
  BookOpen,
  Layers,
  Target,
  CheckCircle2,
  X,
  Sparkles,
  AlertTriangle,
  Search,
  Check,
  FolderPlus,
  HelpCircle,
  FileSpreadsheet,
  CornerDownRight,
  RefreshCw,
} from 'lucide-react';
import Papa from 'papaparse';
import { useFeedback } from '@/components/FeedbackDialog';

// --- DATA TYPES ---
interface Unit {
  id: string;
  display_id: string;
  title: string;
  theme_color: string;
  order_index: number;
}

interface NodeItem {
  id: string;
  unit_id: string;
  display_id: string;
  title: string;
  node_type: string;
  icon_name: string;
  animation_preset: string;
  info_note: string;
  order_index: number;
}

interface LessonItem {
  id: string;
  node_id: string;
  display_id: string;
  title: string;
  order_index: number;
}

interface QuestionItem {
  id: string;
  lesson_id: string | null;
  display_id: string;
  question_type: string;
  correct_answer: string;
  content: {
    text: string;
    options: string[];
    explanation?: string;
    pyq_year?: number | null;
    district_tag?: string | null;
  };
}

// --- IMPORT STAGING TYPES ---
interface StagedImportRow {
  id: string;
  rowIndex: number;
  unitTitle: string;
  unitColor?: string;
  nodeTitle: string;
  nodeType?: string;
  lessonTitle: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  pyqYear: number | null;
  districtTag: string | null;

  // Duplicate / Conflict Tracking
  isDuplicate: boolean;
  duplicateType?: 'database' | 'csv';
  existingLocation?: string;
  status: 'valid' | 'conflict_pending' | 'skipped' | 'edited';

  // Inline edited fields
  editedText: string;
  editedOptions: string[];
  editedCorrectAnswer: string;
  editedExplanation: string;
}

// Helper: Normalize question text for duplicate detection
function normalizeQuestionText(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ') // Remove multiple spaces & invisible unicode
    .replace(/[?!.,:;।॥]+$/g, '') // Remove trailing English & Devanagari punctuation
    .trim();
}

export default function CurriculumBuilderPage() {
  const { toast, confirm, alert: customAlert } = useFeedback();
  const [units, setUnits] = useState<Unit[]>([]);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Navigation
  const [treeSearch, setTreeSearch] = useState('');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Master-Detail State
  const [selection, setSelection] = useState<{
    type: 'unit' | 'node' | 'lesson';
    item: any;
  } | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [lessonQuestions, setLessonQuestions] = useState<QuestionItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Manual Add / Edit Modals
  const [activeModal, setActiveModal] = useState<
    'unit' | 'node' | 'lesson' | 'question' | null
  >(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [addForm, setAddForm] = useState({
    title: '',
    theme_color: '#4f46e5',
    node_type: 'learning',
    animation_preset: 'heartbeat',
    info_note: '',
  });

  const [addQuestionForm, setAddQuestionForm] = useState({
    question_text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A',
    explanation: '',
  });

  // --- BULK CSV IMPORT & ANTI-DUPLICATE STAGING STATE ---
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const lessonFileInputRef = useRef<HTMLInputElement>(null);
  const [importLessonId, setImportLessonId] = useState<string | null>(null);

  const [stagedRows, setStagedRows] = useState<StagedImportRow[]>([]);
  const [isMegaCurriculum, setIsMegaCurriculum] = useState(false);
  const [showStagingModal, setShowStagingModal] = useState(false);
  const [stagingTab, setStagingTab] = useState<'duplicates' | 'unique' | 'hierarchy'>('duplicates');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [unitsRes, nodesRes, lessonsRes, questionsRes] = await Promise.all([
        supabase.from('units').select('*').order('order_index', { ascending: true }),
        supabase.from('nodes').select('*').order('order_index', { ascending: true }),
        supabase.from('lessons').select('*').order('order_index', { ascending: true }),
        supabase.from('questions').select('*'),
      ]);

      if (unitsRes.data) setUnits(unitsRes.data);
      if (nodesRes.data) setNodes(nodesRes.data);
      if (lessonsRes.data) setLessons(lessonsRes.data);
      if (questionsRes.data) setAllQuestions(questionsRes.data);

      // Auto expand first unit if available
      if (unitsRes.data && unitsRes.data.length > 0 && expandedUnits.size === 0) {
        setExpandedUnits(new Set([unitsRes.data[0].id]));
      }
    } catch (err: unknown) {
      console.error('Failed to load curriculum:', err);
    } finally {
      setLoading(false);
    }
  };

  // Select Item for Right Panel
  const selectItem = async (type: 'unit' | 'node' | 'lesson', item: any) => {
    setSelection({ type, item });
    setEditForm({ ...item });

    if (type === 'lesson') {
      setLoadingQuestions(true);
      const { data } = await supabase
        .from('questions')
        .select('*')
        .eq('lesson_id', item.id)
        .order('created_at', { ascending: true });
      setLessonQuestions(data || []);
      setLoadingQuestions(false);
    }
  };

  // Update Item in DB
  const handleUpdate = async () => {
    if (!selection) return;
    setActionLoading(true);
    try {
      const table =
        selection.type === 'unit'
          ? 'units'
          : selection.type === 'node'
          ? 'nodes'
          : 'lessons';
      const { id: _id, ...payload } = editForm;
      const { error } = await supabase.from(table).update(payload).eq('id', selection.item.id);
      if (error) throw error;

      await fetchData();
      setSelection({ type: selection.type, item: editForm });
      toast('success', 'Updated Successfully', `${selection.type.toUpperCase()} settings have been saved.`);
    } catch (err: unknown) {
      toast('error', 'Update Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Unit/Node/Lesson
  const handleDelete = (table: string, id: string) => {
    confirm({
      title: `Delete ${selection?.type || 'item'}?`,
      message: `Are you sure you want to delete this ${selection?.type}? It will permanently delete all nested content and cannot be undone.`,
      confirmText: 'Yes, Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from(table).delete().eq('id', id);
          if (error) throw error;
          if (selection?.item.id === id) setSelection(null);
          await fetchData();
          toast('success', 'Deleted Successfully', `${table.slice(0, -1)} has been deleted.`);
        } catch (err: unknown) {
          toast('error', 'Delete Failed', err instanceof Error ? err.message : 'Unknown error');
        }
      },
    });
  };

  // Delete Single Question
  const handleDeleteQuestion = (id: string) => {
    confirm({
      title: 'Delete Question?',
      message: 'Are you sure you want to delete this question? It will be removed from this lesson.',
      confirmText: 'Delete Question',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('questions').delete().eq('id', id);
          if (error) throw error;
          setLessonQuestions((prev) => prev.filter((q) => q.id !== id));
          setAllQuestions((prev) => prev.filter((q) => q.id !== id));
          toast('success', 'Question Deleted', 'The question was removed from this lesson.');
        } catch (err: unknown) {
          toast('error', 'Delete Failed', err instanceof Error ? err.message : 'Unknown error');
        }
      },
    });
  };

  // Open manual add modals
  const openModal = (
    type: 'unit' | 'node' | 'lesson' | 'question',
    parentId: string | null = null
  ) => {
    setErrorMsg(null);
    setSelectedParentId(parentId);
    setEditingQuestionId(null);
    setAddForm({
      title: '',
      theme_color: '#4f46e5',
      node_type: 'learning',
      animation_preset: 'heartbeat',
      info_note: '',
    });
    setAddQuestionForm({
      question_text: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_option: 'A',
      explanation: '',
    });
    setActiveModal(type);
  };

  // Open edit modal for an existing question
  const openEditQuestionModal = (q: any) => {
    setErrorMsg(null);
    setEditingQuestionId(q.id);
    setSelectedParentId(q.lesson_id);

    const opts = q.content?.options || [];
    setAddQuestionForm({
      question_text: q.content?.text || '',
      option_a: opts[0] || '',
      option_b: opts[1] || '',
      option_c: opts[2] || '',
      option_d: opts[3] || '',
      correct_option:
        q.correct_answer === opts[0]
          ? 'A'
          : q.correct_answer === opts[1]
          ? 'B'
          : q.correct_answer === opts[2]
          ? 'C'
          : q.correct_answer === opts[3]
          ? 'D'
          : 'A',
      explanation: q.content?.explanation || '',
    });
    setActiveModal('question');
  };

  // Save manual add / edit
  const handleSaveAdd = async () => {
    if (activeModal !== 'question' && !addForm.title.trim())
      return setErrorMsg('Title is required.');
    if (activeModal === 'question' && !addQuestionForm.question_text.trim())
      return setErrorMsg('Question text is required.');

    setActionLoading(true);
    try {
      if (activeModal === 'unit') {
        const nextOrder =
          units.length > 0 ? Math.max(...units.map((u) => u.order_index)) + 1 : 1;
        const { error } = await supabase.from('units').insert({
          display_id: nextOrder.toString().padStart(2, '0'),
          title: addForm.title,
          theme_color: addForm.theme_color,
          order_index: nextOrder,
        });
        if (error) throw error;
      } else if (activeModal === 'node' && selectedParentId) {
        const parentUnit = units.find((u) => u.id === selectedParentId);
        const unitNodes = nodes.filter((n) => n.unit_id === selectedParentId);
        const nextOrder =
          unitNodes.length > 0 ? Math.max(...unitNodes.map((n) => n.order_index)) + 1 : 1;
        const { error } = await supabase.from('nodes').insert({
          unit_id: selectedParentId,
          display_id: `${parentUnit?.display_id}.${nextOrder}`,
          title: addForm.title,
          node_type: addForm.node_type,
          animation_preset: addForm.animation_preset,
          info_note: addForm.info_note,
          order_index: nextOrder,
        });
        if (error) throw error;
      } else if (activeModal === 'lesson' && selectedParentId) {
        const parentNode = nodes.find((n) => n.id === selectedParentId);
        const nodeLessons = lessons.filter((l) => l.node_id === selectedParentId);
        const nextOrder =
          nodeLessons.length > 0 ? Math.max(...nodeLessons.map((l) => l.order_index)) + 1 : 1;
        const { error } = await supabase.from('lessons').insert({
          node_id: selectedParentId,
          display_id: `${parentNode?.display_id}.${nextOrder}`,
          title: addForm.title,
          order_index: nextOrder,
        });
        if (error) throw error;
      } else if (activeModal === 'question' && selectedParentId) {
        const correctText =
          addQuestionForm.correct_option === 'A'
            ? addQuestionForm.option_a
            : addQuestionForm.correct_option === 'B'
            ? addQuestionForm.option_b
            : addQuestionForm.correct_option === 'C'
            ? addQuestionForm.option_c
            : addQuestionForm.option_d;

        const contentPayload = {
          text: addQuestionForm.question_text,
          options: [
            addQuestionForm.option_a,
            addQuestionForm.option_b,
            addQuestionForm.option_c,
            addQuestionForm.option_d,
          ].filter((o) => o.trim() !== ''),
          explanation: addQuestionForm.explanation,
        };

        if (editingQuestionId) {
          const { error } = await supabase
            .from('questions')
            .update({
              content: contentPayload,
              correct_answer: correctText,
            })
            .eq('id', editingQuestionId);
          if (error) throw error;
        } else {
          const parentLesson = lessons.find((l) => l.id === selectedParentId);
          const { error } = await supabase.from('questions').insert({
            lesson_id: parentLesson?.id,
            display_id: `${parentLesson?.display_id}.${Date.now()}`,
            is_global_pool: false,
            question_type: 'multiple_choice',
            content: contentPayload,
            correct_answer: correctText,
          });
          if (error) throw error;
        }

        if (selection?.item.id === selectedParentId) {
          const { data } = await supabase
            .from('questions')
            .select('*')
            .eq('lesson_id', selectedParentId)
            .order('created_at', { ascending: true });
          setLessonQuestions(data || []);
        }
      }

      await fetchData();
      setActiveModal(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  // --- CSV PARSING & ANTI-DUPLICATE DETECTION ENGINE ---
  const handleCSVUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    isTargetedLesson: boolean = false
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ''),
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (!rows || rows.length === 0) {
            customAlert('Empty File', 'The uploaded CSV file contains no rows or data.', 'warning');
            setActionLoading(false);
            return;
          }

          // Check if this CSV has Unit and Node columns (Mega Curriculum)
          const sample = rows[0];
          const hasUnitCol = Object.keys(sample).some((k) =>
            /unit/i.test(k.replace(/[^a-zA-Z]/g, ''))
          );
          const hasNodeCol = Object.keys(sample).some((k) =>
            /node/i.test(k.replace(/[^a-zA-Z]/g, ''))
          );
          const isMega = !isTargetedLesson && (hasUnitCol || hasNodeCol);
          setIsMegaCurriculum(isMega);

          // Build a lookup map of all questions currently in Supabase for fast O(1) matching
          // Key: normalized question text -> { id, locationPath }
          const dbQuestionMap = new Map<string, { id: string; locationPath: string }>();

          // Build quick lookup for lessons -> nodes -> units
          const lessonLookup = new Map<string, { lessonTitle: string; nodeTitle: string; unitTitle: string }>();
          for (const l of lessons) {
            const node = nodes.find((n) => n.id === l.node_id);
            const unit = units.find((u) => u.id === node?.unit_id);
            lessonLookup.set(l.id, {
              lessonTitle: l.title,
              nodeTitle: node?.title || 'Unknown Node',
              unitTitle: unit?.title || 'Unknown Unit',
            });
          }

          for (const q of allQuestions) {
            const norm = normalizeQuestionText(q.content?.text || '');
            if (norm) {
              const loc = q.lesson_id ? lessonLookup.get(q.lesson_id) : null;
              const locationPath = loc
                ? `Unit: "${loc.unitTitle}" > Node: "${loc.nodeTitle}" > Lesson: "${loc.lessonTitle}"`
                : 'Question Bank (Global Pool)';
              dbQuestionMap.set(norm, { id: q.id, locationPath });
            }
          }

          // Also track duplicates WITHIN the CSV file itself
          const csvSeenMap = new Map<string, number>();

          // Target lesson context if single-lesson import
          let targetLessonTitle = '';
          let targetNodeTitle = '';
          let targetUnitTitle = '';
          if (isTargetedLesson && importLessonId) {
            const loc = lessonLookup.get(importLessonId);
            if (loc) {
              targetLessonTitle = loc.lessonTitle;
              targetNodeTitle = loc.nodeTitle;
              targetUnitTitle = loc.unitTitle;
            }
          }

          const parsedStagedRows: StagedImportRow[] = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const qText = String(
              row['Question Text'] ??
                row['question_text'] ??
                row['Question'] ??
                row['question'] ??
                ''
            ).trim();

            if (!qText) continue; // Skip blank rows

            const uTitle = isMega
              ? String(
                  row['Unit Title'] ??
                    row['unit_title'] ??
                    row['Unit'] ??
                    row['unit'] ??
                    'General Knowledge'
                ).trim()
              : targetUnitTitle || 'Current Unit';

            const uColor = String(
              row['Theme Color'] ??
                row['theme_color'] ??
                row['Color'] ??
                '#4f46e5'
            ).trim();

            const nTitle = isMega
              ? String(
                  row['Node Title'] ??
                    row['node_title'] ??
                    row['Node'] ??
                    row['node'] ??
                    'Core Practice'
                ).trim()
              : targetNodeTitle || 'Current Node';

            const nType = String(
              row['Node Type'] ??
                row['node_type'] ??
                row['Type'] ??
                'learning'
            ).trim().toLowerCase();

            const lTitle = isMega
              ? String(
                  row['Lesson Title'] ??
                    row['lesson_title'] ??
                    row['Lesson'] ??
                    row['lesson'] ??
                    'Lesson 1'
                ).trim()
              : targetLessonTitle || 'Selected Lesson';

            const getVal = (aliases: string[]): string => {
              for (const a of aliases) {
                if (row[a] !== undefined && row[a] !== null && String(row[a]).trim() !== '') {
                  return String(row[a]).trim();
                }
              }
              const rowKeys = Object.keys(row);
              for (const a of aliases) {
                const foundKey = rowKeys.find((k) => k.trim().toLowerCase() === a.toLowerCase());
                if (
                  foundKey &&
                  row[foundKey] !== undefined &&
                  row[foundKey] !== null &&
                  String(row[foundKey]).trim() !== ''
                ) {
                  return String(row[foundKey]).trim();
                }
              }
              return '';
            };

            const optA = getVal(['Option A', 'option_a', 'Option 1', 'option_1', 'OptionA', 'optionA', 'A', '1']);
            const optB = getVal(['Option B', 'option_b', 'Option 2', 'option_2', 'OptionB', 'optionB', 'B', '2']);
            const optC = getVal(['Option C', 'option_c', 'Option 3', 'option_3', 'OptionC', 'optionC', 'C', '3']);
            const optD = getVal(['Option D', 'option_d', 'Option 4', 'option_4', 'OptionD', 'optionD', 'D', '4']);

            const rawCorrect = getVal([
              'Correct Option (A/B/C/D)',
              'Correct Option',
              'correct_option',
              'Correct Option(A/B/C/D)',
              'Correct Answer',
              'correct_answer',
              'Correct Answer (A/B/C/D)',
              'Correct',
              'correct',
              'Answer',
              'answer',
              'Ans',
              'ans',
              'Key',
              'key',
              'Answer Key',
            ]);

            const cleanCorrect = rawCorrect.replace(/^[(\[]|[)\]]$/g, '').trim().toUpperCase();

            let correctText = '';
            if (cleanCorrect === 'A' || cleanCorrect === '1' || cleanCorrect === 'OPTION A' || cleanCorrect === 'OPTION 1') {
              correctText = optA;
            } else if (cleanCorrect === 'B' || cleanCorrect === '2' || cleanCorrect === 'OPTION B' || cleanCorrect === 'OPTION 2') {
              correctText = optB;
            } else if (cleanCorrect === 'C' || cleanCorrect === '3' || cleanCorrect === 'OPTION C' || cleanCorrect === 'OPTION 3') {
              correctText = optC;
            } else if (cleanCorrect === 'D' || cleanCorrect === '4' || cleanCorrect === 'OPTION D' || cleanCorrect === 'OPTION 4') {
              correctText = optD;
            } else if (rawCorrect && optA && rawCorrect.toLowerCase() === optA.toLowerCase()) {
              correctText = optA;
            } else if (rawCorrect && optB && rawCorrect.toLowerCase() === optB.toLowerCase()) {
              correctText = optB;
            } else if (rawCorrect && optC && rawCorrect.toLowerCase() === optC.toLowerCase()) {
              correctText = optC;
            } else if (rawCorrect && optD && rawCorrect.toLowerCase() === optD.toLowerCase()) {
              correctText = optD;
            } else if (rawCorrect) {
              correctText = rawCorrect;
            } else {
              correctText = optA || 'A';
            }

            const explanation = String(row['Explanation'] ?? row['explanation'] ?? '').trim();
            const pyqYear = row['PYQ Year']
              ? parseInt(String(row['PYQ Year']), 10)
              : row['pyq_year']
              ? parseInt(String(row['pyq_year']), 10)
              : null;
            const districtTag = row['District']
              ? String(row['District']).trim()
              : row['district']
              ? String(row['district']).trim()
              : null;

            const norm = normalizeQuestionText(qText);

            // ANTI-DUPLICATE CHECK
            let isDup = false;
            let dupType: 'database' | 'csv' | undefined = undefined;
            let existingLoc: string | undefined = undefined;

            if (dbQuestionMap.has(norm)) {
              isDup = true;
              dupType = 'database';
              existingLoc = dbQuestionMap.get(norm)?.locationPath;
            } else if (csvSeenMap.has(norm)) {
              isDup = true;
              dupType = 'csv';
              existingLoc = `Same CSV (First appeared in row #${csvSeenMap.get(norm)})`;
            } else {
              csvSeenMap.set(norm, i + 1);
            }

            parsedStagedRows.push({
              id: `staged_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
              rowIndex: i + 1,
              unitTitle: uTitle,
              unitColor: uColor.startsWith('#') ? uColor : '#4f46e5',
              nodeTitle: nTitle,
              nodeType: ['learning', 'reward', 'boss', 'milestone'].includes(nType)
                ? nType
                : 'learning',
              lessonTitle: lTitle,
              questionText: qText,
              options: [optA, optB, optC, optD].filter((o) => o !== ''),
              correctAnswer: correctText,
              explanation,
              pyqYear: isNaN(pyqYear as number) ? null : pyqYear,
              districtTag,
              isDuplicate: isDup,
              duplicateType: dupType,
              existingLocation: existingLoc,
              status: isDup ? 'conflict_pending' : 'valid',
              editedText: qText,
              editedOptions: [optA, optB, optC, optD],
              editedCorrectAnswer: correctText,
              editedExplanation: explanation,
            });
          }

          if (parsedStagedRows.length === 0) {
            customAlert('No Valid Questions', 'No valid questions were found in this CSV. Please verify that column headers match the template.', 'warning');
            setActionLoading(false);
            return;
          }

          setStagedRows(parsedStagedRows);

          // If there are duplicates, default to the duplicates tab; otherwise go straight to summary
          const duplicateCount = parsedStagedRows.filter((r) => r.isDuplicate).length;
          setStagingTab(duplicateCount > 0 ? 'duplicates' : 'hierarchy');
          setShowStagingModal(true);
        } catch (err: unknown) {
          toast('error', 'CSV Parse Error', err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setActionLoading(false);
          if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
          if (lessonFileInputRef.current) lessonFileInputRef.current.value = '';
        }
      },
      error: (err) => {
        toast('error', 'CSV Reading Error', err.message);
        setActionLoading(false);
      },
    });
  };

  // Skip individual duplicate
  const handleSkipDuplicate = (rowId: string) => {
    setStagedRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, status: 'skipped' } : r))
    );
  };

  // Restore skipped duplicate
  const handleRestoreRow = (rowId: string) => {
    setStagedRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, status: r.isDuplicate ? 'conflict_pending' : 'valid' } : r
      )
    );
  };

  // Save inline edit for duplicate question
  const handleSaveInlineEdit = (rowId: string) => {
    setStagedRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const norm = normalizeQuestionText(r.editedText);
        // Re-check against all DB questions
        const dbCollision = allQuestions.some(
          (q) => normalizeQuestionText(q.content?.text || '') === norm
        );

        return {
          ...r,
          questionText: r.editedText,
          options: r.editedOptions.filter((o) => o.trim() !== ''),
          correctAnswer: r.editedCorrectAnswer,
          explanation: r.editedExplanation,
          status: 'edited',
          isDuplicate: dbCollision,
          duplicateType: dbCollision ? 'database' : undefined,
          existingLocation: dbCollision
            ? 'Warning: Still matches an existing question in database'
            : undefined,
        };
      })
    );
    setEditingRowId(null);
  };

  // Bulk Skip all unresolved duplicates
  const handleSkipAllDuplicates = () => {
    setStagedRows((prev) =>
      prev.map((r) => (r.status === 'conflict_pending' ? { ...r, status: 'skipped' } : r))
    );
  };

  // --- ATOMIC COMMIT & AUTOMATED HIERARCHY BUILDER ---
  const handleConfirmBuildCurriculum = async () => {
    // Only import rows that are valid or edited
    const rowsToImport = stagedRows.filter(
      (r) => r.status === 'valid' || r.status === 'edited'
    );

    if (rowsToImport.length === 0) {
      customAlert('No Questions Selected', 'There are no approved questions to import. Please review skipped items.', 'warning');
      return;
    }

    setActionLoading(true);
    setImportProgress('Initializing automated hierarchy generation...');

    try {
      if (isMegaCurriculum) {
        // --- 1. RESOLVE / CREATE UNITS ---
        setImportProgress('Mapping and creating Units...');
        const uniqueUnitTitles = Array.from(new Set(rowsToImport.map((r) => r.unitTitle)));
        const unitIdMap = new Map<string, { id: string; display_id: string }>();

        let currentUnits = [...units];
        let maxUnitOrder =
          currentUnits.length > 0 ? Math.max(...currentUnits.map((u) => u.order_index)) : 0;

        for (const uTitle of uniqueUnitTitles) {
          const sampleRow = rowsToImport.find((r) => r.unitTitle === uTitle);
          const existingUnit = currentUnits.find(
            (u) => u.title.toLowerCase() === uTitle.toLowerCase()
          );

          if (existingUnit) {
            unitIdMap.set(uTitle, {
              id: existingUnit.id,
              display_id: existingUnit.display_id,
            });
          } else {
            maxUnitOrder += 1;
            const newDisplayId = maxUnitOrder.toString().padStart(2, '0');
            const { data: newUnit, error } = await supabase
              .from('units')
              .insert({
                title: uTitle,
                display_id: newDisplayId,
                theme_color: sampleRow?.unitColor || '#4f46e5',
                order_index: maxUnitOrder,
              })
              .select()
              .single();

            if (error) throw error;
            currentUnits.push(newUnit);
            unitIdMap.set(uTitle, { id: newUnit.id, display_id: newUnit.display_id });
          }
        }

        // --- 2. RESOLVE / CREATE NODES ---
        setImportProgress('Mapping and creating Nodes...');
        const uniqueNodes = Array.from(
          new Set(rowsToImport.map((r) => `${r.unitTitle}:::${r.nodeTitle}`))
        );
        const nodeIdMap = new Map<string, { id: string; display_id: string }>();

        let currentNodes = [...nodes];

        for (const composite of uniqueNodes) {
          const [uTitle, nTitle] = composite.split(':::');
          const unitInfo = unitIdMap.get(uTitle)!;
          const sampleRow = rowsToImport.find(
            (r) => r.unitTitle === uTitle && r.nodeTitle === nTitle
          );

          const existingNode = currentNodes.find(
            (n) => n.unit_id === unitInfo.id && n.title.toLowerCase() === nTitle.toLowerCase()
          );

          if (existingNode) {
            nodeIdMap.set(composite, {
              id: existingNode.id,
              display_id: existingNode.display_id,
            });
          } else {
            const unitNodes = currentNodes.filter((n) => n.unit_id === unitInfo.id);
            const nextNodeOrder =
              unitNodes.length > 0 ? Math.max(...unitNodes.map((n) => n.order_index)) + 1 : 1;
            const newDisplayId = `${unitInfo.display_id}.${nextNodeOrder}`;

            const { data: newNode, error } = await supabase
              .from('nodes')
              .insert({
                unit_id: unitInfo.id,
                title: nTitle,
                display_id: newDisplayId,
                node_type: sampleRow?.nodeType || 'learning',
                animation_preset: 'heartbeat',
                icon_name: 'star',
                info_note: '',
                order_index: nextNodeOrder,
              })
              .select()
              .single();

            if (error) throw error;
            currentNodes.push(newNode);
            nodeIdMap.set(composite, { id: newNode.id, display_id: newNode.display_id });
          }
        }

        // --- 3. RESOLVE / CREATE LESSONS ---
        setImportProgress('Mapping and creating Lessons...');
        const uniqueLessons = Array.from(
          new Set(
            rowsToImport.map((r) => `${r.unitTitle}:::${r.nodeTitle}:::${r.lessonTitle}`)
          )
        );
        const lessonIdMap = new Map<string, { id: string; display_id: string }>();

        let currentLessons = [...lessons];

        for (const composite of uniqueLessons) {
          const [uTitle, nTitle, lTitle] = composite.split(':::');
          const nodeInfo = nodeIdMap.get(`${uTitle}:::${nTitle}`)!;

          const existingLesson = currentLessons.find(
            (l) => l.node_id === nodeInfo.id && l.title.toLowerCase() === lTitle.toLowerCase()
          );

          if (existingLesson) {
            lessonIdMap.set(composite, {
              id: existingLesson.id,
              display_id: existingLesson.display_id,
            });
          } else {
            const nodeLessons = currentLessons.filter((l) => l.node_id === nodeInfo.id);
            const nextLessonOrder =
              nodeLessons.length > 0 ? Math.max(...nodeLessons.map((l) => l.order_index)) + 1 : 1;
            const newDisplayId = `${nodeInfo.display_id}.${nextLessonOrder}`;

            const { data: newLesson, error } = await supabase
              .from('lessons')
              .insert({
                node_id: nodeInfo.id,
                title: lTitle,
                display_id: newDisplayId,
                order_index: nextLessonOrder,
              })
              .select()
              .single();

            if (error) throw error;
            currentLessons.push(newLesson);
            lessonIdMap.set(composite, { id: newLesson.id, display_id: newLesson.display_id });
          }
        }

        // --- 4. BATCH INSERT QUESTIONS ---
        setImportProgress(`Inserting ${rowsToImport.length} verified questions...`);
        const questionPayloads = rowsToImport.map((r) => {
          const lessonInfo = lessonIdMap.get(
            `${r.unitTitle}:::${r.nodeTitle}:::${r.lessonTitle}`
          )!;
          return {
            lesson_id: lessonInfo.id,
            display_id: `${lessonInfo.display_id}.${Date.now() + Math.random()}`,
            is_global_pool: false,
            question_type: 'multiple_choice',
            content: {
              text: r.questionText,
              options: r.options,
              explanation: r.explanation,
              pyq_year: r.pyqYear,
              district_tag: r.districtTag,
            },
            correct_answer: r.correctAnswer,
          };
        });

        // Insert in batches of 50
        const CHUNK_SIZE = 50;
        for (let i = 0; i < questionPayloads.length; i += CHUNK_SIZE) {
          const chunk = questionPayloads.slice(i, i + CHUNK_SIZE);
          const { error } = await supabase.from('questions').insert(chunk);
          if (error) throw error;
        }

        customAlert(
          'Curriculum Built Successfully!',
          <div className="space-y-3 text-sm text-slate-300">
            <p>Your full curriculum hierarchy has been generated and questions inserted:</p>
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/60 rounded-xl border border-slate-700/50">
              <div><span className="text-slate-400">Units:</span> <span className="font-bold text-white">{uniqueUnitTitles.length}</span></div>
              <div><span className="text-slate-400">Nodes:</span> <span className="font-bold text-white">{uniqueNodes.length}</span></div>
              <div><span className="text-slate-400">Lessons:</span> <span className="font-bold text-white">{uniqueLessons.length}</span></div>
              <div><span className="text-slate-400">Questions:</span> <span className="font-bold text-emerald-400">{rowsToImport.length}</span></div>
            </div>
            {stagedRows.length - rowsToImport.length > 0 && (
              <p className="text-xs text-amber-400 font-medium">
                ⚠️ Skipped {stagedRows.length - rowsToImport.length} duplicate questions.
              </p>
            )}
          </div>,
          'success'
        );
      } else {
        // Single Lesson Import
        if (!importLessonId) throw new Error('Target lesson not selected.');
        const parentLesson = lessons.find((l) => l.id === importLessonId);
        if (!parentLesson) throw new Error('Target lesson not found.');

        setImportProgress(`Importing ${rowsToImport.length} questions into "${parentLesson.title}"...`);

        const questionPayloads = rowsToImport.map((r) => ({
          lesson_id: parentLesson.id,
          display_id: `${parentLesson.display_id}.${Date.now() + Math.random()}`,
          is_global_pool: false,
          question_type: 'multiple_choice',
          content: {
            text: r.questionText,
            options: r.options,
            explanation: r.explanation,
            pyq_year: r.pyqYear,
            district_tag: r.districtTag,
          },
          correct_answer: r.correctAnswer,
        }));

        const CHUNK_SIZE = 50;
        for (let i = 0; i < questionPayloads.length; i += CHUNK_SIZE) {
          const chunk = questionPayloads.slice(i, i + CHUNK_SIZE);
          const { error } = await supabase.from('questions').insert(chunk);
          if (error) throw error;
        }

        toast('success', 'Import Successful', `Imported ${rowsToImport.length} verified questions into "${parentLesson.title}"!`);
      }

      await fetchData();
      setShowStagingModal(false);
      setStagedRows([]);

      // Auto select the first lesson if mega curriculum
      if (isMegaCurriculum && lessons.length > 0) {
        selectItem('lesson', lessons[0]);
      } else if (importLessonId) {
        const updatedLesson = lessons.find((l) => l.id === importLessonId);
        if (updatedLesson) selectItem('lesson', updatedLesson);
      }
    } catch (err: unknown) {
      customAlert('Build Failed', err instanceof Error ? err.message : 'Unknown error', 'error');
    } finally {
      setActionLoading(false);
      setImportProgress(null);
    }
  };

  // --- TREE FILTERING ---
  const filteredUnits = useMemo(() => {
    if (!treeSearch.trim()) return units;
    const query = treeSearch.toLowerCase();

    return units.filter((unit) => {
      const matchUnit = unit.title.toLowerCase().includes(query);
      const unitNodes = nodes.filter((n) => n.unit_id === unit.id);
      const matchNodes = unitNodes.some((n) => n.title.toLowerCase().includes(query));
      const matchLessons = lessons.some((l) => {
        const parentNode = nodes.find((n) => n.id === l.node_id);
        return parentNode?.unit_id === unit.id && l.title.toLowerCase().includes(query);
      });
      return matchUnit || matchNodes || matchLessons;
    });
  }, [units, nodes, lessons, treeSearch]);

  // Hierarchy stats for staging preview
  const hierarchyPreviewStats = useMemo(() => {
    const activeRows = stagedRows.filter((r) => r.status === 'valid' || r.status === 'edited');
    const uSet = new Set(activeRows.map((r) => r.unitTitle));
    const nSet = new Set(activeRows.map((r) => `${r.unitTitle}:::${r.nodeTitle}`));
    const lSet = new Set(activeRows.map((r) => `${r.unitTitle}:::${r.nodeTitle}:::${r.lessonTitle}`));
    return {
      unitsCount: uSet.size,
      nodesCount: nSet.size,
      lessonsCount: lSet.size,
      questionsCount: activeRows.length,
      skippedCount: stagedRows.filter((r) => r.status === 'skipped').length,
    };
  }, [stagedRows]);

  // Answer distribution stats for pre-flight review to detect single-option skew
  const answerDistributionStats = useMemo(() => {
    const activeRows = stagedRows.filter((r) => r.status === 'valid' || r.status === 'edited');
    const counts = { A: 0, B: 0, C: 0, D: 0, other: 0 };
    const total = activeRows.length;
    if (total === 0) {
      return {
        counts,
        percentages: { A: 0, B: 0, C: 0, D: 0, other: 0 },
        maxSkewOption: null,
        maxPct: 0,
        isSkewed: false,
      };
    }

    activeRows.forEach((r) => {
      const opts = r.options || [];
      const ans = (r.correctAnswer || '').trim();
      if (ans === opts[0]) counts.A++;
      else if (ans === opts[1]) counts.B++;
      else if (ans === opts[2]) counts.C++;
      else if (ans === opts[3]) counts.D++;
      else counts.other++;
    });

    const percentages = {
      A: Math.round((counts.A / total) * 100),
      B: Math.round((counts.B / total) * 100),
      C: Math.round((counts.C / total) * 100),
      D: Math.round((counts.D / total) * 100),
      other: Math.round((counts.other / total) * 100),
    };

    let maxSkewOption: string | null = null;
    let maxPct = 0;
    if (percentages.A >= 75) { maxSkewOption = 'Option A'; maxPct = percentages.A; }
    else if (percentages.B >= 75) { maxSkewOption = 'Option B'; maxPct = percentages.B; }
    else if (percentages.C >= 75) { maxSkewOption = 'Option C'; maxPct = percentages.C; }
    else if (percentages.D >= 75) { maxSkewOption = 'Option D'; maxPct = percentages.D; }

    return {
      counts,
      percentages,
      maxSkewOption,
      maxPct,
      isSkewed: !!maxSkewOption,
    };
  }, [stagedRows]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-indigo-600 mr-2" /> Loading Curriculum Data...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col pt-4">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={bulkFileInputRef}
        onChange={(e) => handleCSVUpload(e, false)}
        accept=".csv"
        className="hidden"
      />
      <input
        type="file"
        ref={lessonFileInputRef}
        onChange={(e) => handleCSVUpload(e, true)}
        accept=".csv"
        className="hidden"
      />

      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 px-2 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            Curriculum Builder
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your Prashnix learning tree, units, nodes, lessons, and question banks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Download Templates Button */}
          <div className="relative group">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium text-sm shadow-sm">
              <FileSpreadsheet size={16} className="text-emerald-600" />
              Templates
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            <div className="absolute right-0 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-xl py-1 hidden group-hover:block z-30">
              <a
                href="/police_bharti_300_curriculum.csv"
                download
                className="flex items-center gap-2 px-4 py-2.5 text-xs text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100 font-semibold"
              >
                <Sparkles size={14} className="text-emerald-600" />
                Police Bharti 300 Qs CSV
                <span className="text-[10px] text-emerald-500 block">(Pune + Daund + Nagpur)</span>
              </a>
              <div className="border-t border-gray-100 my-1" />
              <a
                href="/curriculum_bulk_template.csv"
                download
                className="flex items-center gap-2 px-4 py-2.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium"
              >
                <FileSpreadsheet size={14} className="text-indigo-600" />
                Blank Mega Curriculum Template
                <span className="text-[10px] text-gray-400 block">(Unit+Node+Lesson)</span>
              </a>
              <div className="border-t border-gray-100 my-1" />
              <a
                href="/template.csv"
                download
                className="flex items-center gap-2 px-4 py-2.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium"
              >
                <BookOpen size={14} className="text-blue-600" />
                Single Lesson Questions Template
              </a>
            </div>
          </div>

          {/* Automated Mega Import Button */}
          <button
            onClick={() => bulkFileInputRef.current?.click()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-semibold text-sm shadow-sm"
            title="Import an entire curriculum from a single CSV (Units, Nodes, Lessons, and Questions)"
          >
            <Sparkles size={16} />
            Auto-Build Curriculum (CSV)
          </button>

          {/* Add Unit Button */}
          <button
            onClick={() => openModal('unit')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-semibold text-sm shadow-sm"
          >
            <Plus size={16} />
            Add Unit
          </button>
        </div>
      </div>

      {/* --- MASTER-DETAIL SPLIT CONTAINER --- */}
      <div className="flex flex-1 gap-6 min-h-0">
        {/* LEFT PANEL: Tree View */}
        <div className="w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          {/* Tree Header & Search */}
          <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
            <div className="flex items-center justify-between font-semibold text-gray-700 text-sm">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-indigo-600" />
                Curriculum Hierarchy
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setExpandedUnits(new Set(units.map((u) => u.id)));
                    setExpandedNodes(new Set(nodes.map((n) => n.id)));
                  }}
                  className="text-indigo-600 hover:underline"
                >
                  Expand
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => {
                    setExpandedUnits(new Set());
                    setExpandedNodes(new Set());
                  }}
                  className="text-gray-500 hover:underline"
                >
                  Collapse
                </button>
              </div>
            </div>

            {/* Tree Search Bar */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search units, nodes, lessons..."
                value={treeSearch}
                onChange={(e) => {
                  setTreeSearch(e.target.value);
                  if (e.target.value.trim()) {
                    setExpandedUnits(new Set(units.map((u) => u.id)));
                    setExpandedNodes(new Set(nodes.map((n) => n.id)));
                  }
                }}
                className="w-full bg-white border border-gray-200 pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none focus:border-indigo-500 text-gray-800"
              />
            </div>
          </div>

          {/* Tree Scroll List */}
          <div className="p-3 overflow-y-auto flex-1 space-y-1.5">
            {filteredUnits.length === 0 ? (
              <div className="text-gray-400 text-center py-10 text-xs">
                {treeSearch ? 'No curriculum matching search.' : 'No units found. Click "Add Unit" or "Auto-Build".'}
              </div>
            ) : (
              filteredUnits.map((unit) => {
                const isSelectedUnit = selection?.type === 'unit' && selection.item.id === unit.id;
                const unitNodes = nodes.filter((n) => n.unit_id === unit.id);
                const isExpandedUnit = expandedUnits.has(unit.id);

                return (
                  <div key={unit.id} className="select-none">
                    {/* Unit Row */}
                    <div
                      onClick={() => {
                        selectItem('unit', unit);
                        const n = new Set(expandedUnits);
                        n.has(unit.id) ? n.delete(unit.id) : n.add(unit.id);
                        setExpandedUnits(n);
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        isSelectedUnit
                          ? 'bg-indigo-50 border-l-4 border-indigo-600'
                          : 'hover:bg-gray-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-gray-800 text-sm truncate">
                        {isExpandedUnit ? (
                          <ChevronDown size={15} className="text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight size={15} className="text-gray-400 shrink-0" />
                        )}
                        <div
                          className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: unit.theme_color || '#4f46e5' }}
                        />
                        <span className="truncate">
                          {unit.display_id} - {unit.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded-full">
                          {unitNodes.length} nodes
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('node', unit.id);
                          }}
                          className="text-indigo-600 hover:bg-indigo-100 p-1 rounded"
                          title="Add Node under this Unit"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Nodes under Unit */}
                    {isExpandedUnit && (
                      <div className="ml-5 mt-1 space-y-1 border-l-2 border-indigo-100 pl-2">
                        {unitNodes.length === 0 ? (
                          <div className="text-[11px] text-gray-400 py-1 pl-2 italic">
                            No nodes yet. Click + to add one.
                          </div>
                        ) : (
                          unitNodes.map((node) => {
                            const isSelectedNode =
                              selection?.type === 'node' && selection.item.id === node.id;
                            const nodeLessons = lessons.filter((l) => l.node_id === node.id);
                            const isExpandedNode = expandedNodes.has(node.id);

                            return (
                              <div key={node.id}>
                                {/* Node Row */}
                                <div
                                  onClick={() => {
                                    selectItem('node', node);
                                    const n = new Set(expandedNodes);
                                    n.has(node.id) ? n.delete(node.id) : n.add(node.id);
                                    setExpandedNodes(n);
                                  }}
                                  className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                                    isSelectedNode
                                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                      : 'hover:bg-gray-50 text-gray-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 text-xs font-medium truncate">
                                    {isExpandedNode ? (
                                      <ChevronDown size={13} className="text-gray-400 shrink-0" />
                                    ) : (
                                      <ChevronRight size={13} className="text-gray-400 shrink-0" />
                                    )}
                                    <Target
                                      size={14}
                                      className={
                                        node.node_type === 'reward'
                                          ? 'text-yellow-500 shrink-0'
                                          : node.node_type === 'boss'
                                          ? 'text-red-500 shrink-0'
                                          : 'text-emerald-500 shrink-0'
                                      }
                                    />
                                    <span className="truncate">{node.title}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded-full">
                                      {nodeLessons.length}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openModal('lesson', node.id);
                                      }}
                                      className="text-indigo-600 hover:bg-indigo-100 p-1 rounded"
                                      title="Add Lesson under this Node"
                                    >
                                      <Plus size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Lessons under Node */}
                                {isExpandedNode && (
                                  <div className="ml-5 mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                                    {nodeLessons.length === 0 ? (
                                      <div className="text-[11px] text-gray-400 py-1 pl-2 italic">
                                        No lessons yet.
                                      </div>
                                    ) : (
                                      nodeLessons.map((lesson) => {
                                        const isSelectedLesson =
                                          selection?.type === 'lesson' &&
                                          selection.item.id === lesson.id;

                                        return (
                                          <div
                                            key={lesson.id}
                                            onClick={() => selectItem('lesson', lesson)}
                                            className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                                              isSelectedLesson
                                                ? 'bg-indigo-100 text-indigo-900 font-bold border-l-2 border-indigo-700'
                                                : 'hover:bg-gray-100 text-gray-600'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 truncate">
                                              <BookOpen
                                                size={13}
                                                className={
                                                  isSelectedLesson
                                                    ? 'text-indigo-700'
                                                    : 'text-gray-400'
                                                }
                                              />
                                              <span className="truncate">{lesson.title}</span>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Details & Editor */}
        <div className="w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden relative">
          {!selection ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
              <Layers size={64} className="mb-4 text-gray-200" />
              <h2 className="text-xl font-semibold text-gray-700">Select an item to view & edit</h2>
              <p className="mt-2 text-sm text-gray-500 max-w-sm">
                Click on any Unit, Node, or Lesson in the hierarchy on the left, or use the{' '}
                <span className="font-semibold text-emerald-600">Auto-Build Curriculum</span> button
                above.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Detail Header */}
              <div className="p-5 border-b border-gray-100 bg-gray-50/70 flex justify-between items-start shrink-0">
                <div className="flex-1 mr-4">
                  <div className="text-[11px] font-mono text-indigo-600 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    {selection.type === 'unit' && <Layers size={13} />}
                    {selection.type === 'node' && <Target size={13} />}
                    {selection.type === 'lesson' && <BookOpen size={13} />}
                    {selection.type} SETTINGS
                  </div>
                  <input
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="text-2xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-indigo-600 outline-none text-gray-900 transition-colors w-full pb-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(selection.type + 's', selection.item.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={actionLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 text-sm shadow-sm"
                  >
                    {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                  </button>
                </div>
              </div>

              {/* Detail Body */}
              <div className="p-6 overflow-y-auto flex-1">
                {/* Unit Specific Fields */}
                {selection.type === 'unit' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Theme Color
                      </label>
                      <div className="flex gap-3 items-center">
                        <input
                          type="color"
                          value={editForm.theme_color || '#4f46e5'}
                          onChange={(e) =>
                            setEditForm({ ...editForm, theme_color: e.target.value })
                          }
                          className="h-11 w-11 rounded-lg cursor-pointer border-0 p-0 shadow-sm"
                        />
                        <input
                          type="text"
                          value={editForm.theme_color || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, theme_color: e.target.value })
                          }
                          className="border border-gray-300 rounded-lg px-3 py-2 uppercase font-mono text-gray-900 w-32 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Node Specific Fields */}
                {selection.type === 'node' && (
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Node Type
                      </label>
                      <select
                        value={editForm.node_type || 'learning'}
                        onChange={(e) =>
                          setEditForm({ ...editForm, node_type: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 text-sm"
                      >
                        <option value="learning">Learning</option>
                        <option value="reward">Reward Chest</option>
                        <option value="boss">Boss Challenge</option>
                        <option value="milestone">Milestone Exam</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Animation Preset
                      </label>
                      <select
                        value={editForm.animation_preset || 'heartbeat'}
                        onChange={(e) =>
                          setEditForm({ ...editForm, animation_preset: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 text-sm"
                      >
                        <option value="heartbeat">Heartbeat</option>
                        <option value="bounce">Bounce</option>
                        <option value="glow">Glow</option>
                        <option value="float">Float</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Internal Notes
                      </label>
                      <textarea
                        value={editForm.info_note || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, info_note: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 h-20 text-gray-900 resize-none text-sm"
                        placeholder="Internal notes about this node..."
                      />
                    </div>
                  </div>
                )}

                {/* Lesson Questions View */}
                {selection.type === 'lesson' && (
                  <div>
                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          <BookOpen size={18} className="text-indigo-600" />
                          Lesson Questions
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {lessonQuestions.length} questions attached to this lesson.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            setImportLessonId(selection.item.id);
                            lessonFileInputRef.current?.click();
                          }}
                          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                          title="Import CSV questions directly into this lesson with anti-duplicate detection"
                        >
                          <Upload size={14} className="text-emerald-600" />
                          Import CSV into Lesson
                        </button>
                        <button
                          onClick={() => openModal('question', selection.item.id)}
                          className="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Plus size={14} />
                          Add Question
                        </button>
                      </div>
                    </div>

                    {/* Questions List */}
                    {loadingQuestions ? (
                      <div className="flex justify-center p-12">
                        <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
                      </div>
                    ) : lessonQuestions.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                        <Target size={36} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-600 font-medium text-sm">No questions in this lesson yet.</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Add questions manually or use "Import CSV into Lesson".
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {lessonQuestions.map((q, idx) => {
                          const opts = q.content?.options || [];
                          const correctOpt = q.correct_answer;
                          return (
                            <div
                              key={q.id}
                              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-200 transition-colors relative group"
                            >
                              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
                                <button
                                  onClick={() => openEditQuestionModal(q)}
                                  className="text-gray-400 hover:text-indigo-600 p-1.5 bg-white rounded-md shadow-sm border border-gray-100 transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="text-gray-400 hover:text-red-500 p-1.5 bg-white rounded-md shadow-sm border border-gray-100 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>

                              <div className="flex gap-2.5 mb-3 pr-16">
                                <div className="bg-indigo-100 text-indigo-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs mt-0.5">
                                  {idx + 1}
                                </div>
                                <p className="font-semibold text-gray-900 text-base leading-snug">
                                  {q.content?.text || 'Untitled Question'}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 pl-8">
                                {opts.map((text, i) => {
                                  const isCorrect = correctOpt === text;
                                  const letter = ['A', 'B', 'C', 'D'][i] || '?';
                                  return (
                                    <div
                                      key={i}
                                      className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                                        isCorrect
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                                          : 'bg-gray-50 border-gray-100 text-gray-700'
                                      }`}
                                    >
                                      <span
                                        className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                          isCorrect
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-gray-200 text-gray-600'
                                        }`}
                                      >
                                        {letter}
                                      </span>
                                      <span className="truncate">{text}</span>
                                      {isCorrect && (
                                        <CheckCircle2
                                          size={14}
                                          className="text-emerald-600 ml-auto shrink-0"
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {(q.content?.explanation ||
                                q.content?.pyq_year ||
                                q.content?.district_tag) && (
                                <div className="ml-8 bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-900">
                                  {q.content.explanation && (
                                    <p className="mb-1">
                                      <span className="font-semibold text-blue-800">
                                        Explanation:{' '}
                                      </span>
                                      {q.content.explanation}
                                    </p>
                                  )}
                                  <div className="flex gap-3 text-[11px] font-medium text-blue-700/80">
                                    {q.content.pyq_year && <span>PYQ: {q.content.pyq_year}</span>}
                                    {q.content.district_tag && (
                                      <span>District: {q.content.district_tag}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* --- PRE-FLIGHT CSV STAGING & ANTI-DUPLICATE RESOLUTION MODAL --- */}
      {/* ========================================================================= */}
      {showStagingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="text-emerald-600" size={20} />
                  {isMegaCurriculum
                    ? 'Automated Curriculum Pre-Flight Review'
                    : 'Lesson Questions Pre-Flight Review'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Anti-duplicate scanner analyzed your CSV against all existing questions in the database.
                </p>
              </div>
              <button
                onClick={() => setShowStagingModal(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Summary KPI Cards */}
            <div className="px-6 py-3 bg-white border-b border-gray-100 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                <div className="text-[11px] font-semibold text-indigo-700 uppercase">Total in CSV</div>
                <div className="text-xl font-extrabold text-indigo-900 mt-0.5">
                  {stagedRows.length} Questions
                </div>
              </div>
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="text-[11px] font-semibold text-emerald-700 uppercase">
                  Ready to Import
                </div>
                <div className="text-xl font-extrabold text-emerald-900 mt-0.5">
                  {hierarchyPreviewStats.questionsCount}
                </div>
              </div>
              <div
                className={`p-3 rounded-xl border ${
                  stagedRows.filter((r) => r.isDuplicate).length > 0
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="text-[11px] font-semibold text-amber-700 uppercase">
                  Duplicates Detected
                </div>
                <div className="text-xl font-extrabold text-amber-900 mt-0.5">
                  {stagedRows.filter((r) => r.isDuplicate).length}
                </div>
              </div>
              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100">
                <div className="text-[11px] font-semibold text-purple-700 uppercase">
                  Hierarchy to Build
                </div>
                <div className="text-xs font-semibold text-purple-900 mt-1">
                  {hierarchyPreviewStats.unitsCount} Units • {hierarchyPreviewStats.nodesCount} Nodes
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${answerDistributionStats.isSkewed ? 'bg-rose-50/80 border-rose-200' : 'bg-blue-50/60 border-blue-100'}`}>
                <div className={`text-[11px] font-semibold uppercase ${answerDistributionStats.isSkewed ? 'text-rose-700' : 'text-blue-700'}`}>
                  Answer Balance
                </div>
                <div className="text-xs font-semibold mt-1 flex flex-wrap gap-1 font-mono">
                  <span className={answerDistributionStats.percentages.A >= 70 ? 'text-rose-600 font-extrabold' : 'text-gray-700'}>A:{answerDistributionStats.percentages.A}%</span>
                  <span className={answerDistributionStats.percentages.B >= 70 ? 'text-rose-600 font-extrabold' : 'text-gray-700'}>B:{answerDistributionStats.percentages.B}%</span>
                  <span className={answerDistributionStats.percentages.C >= 70 ? 'text-rose-600 font-extrabold' : 'text-gray-700'}>C:{answerDistributionStats.percentages.C}%</span>
                  <span className={answerDistributionStats.percentages.D >= 70 ? 'text-rose-600 font-extrabold' : 'text-gray-700'}>D:{answerDistributionStats.percentages.D}%</span>
                </div>
              </div>
            </div>

            {/* Answer Skew Warning Banner */}
            {answerDistributionStats.isSkewed && (
              <div className="mx-6 mt-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-3">
                <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                <div className="space-y-1">
                  <div className="font-bold text-rose-950">
                    Critical Answer Skew Detected: {answerDistributionStats.maxSkewOption} accounts for {answerDistributionStats.maxPct}% of questions!
                  </div>
                  <p className="text-rose-800 text-[11px] leading-relaxed">
                    Most questions in this CSV resolve to <strong>{answerDistributionStats.maxSkewOption}</strong>. This indicates the CSV was scraped or generated with a default answer placeholder. Please verify answers before building the curriculum.
                  </p>
                  <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
                    <span className="px-2 py-0.5 bg-rose-100 rounded text-rose-800 font-semibold">A: {answerDistributionStats.percentages.A}%</span>
                    <span className="px-2 py-0.5 bg-rose-100 rounded text-rose-800 font-semibold">B: {answerDistributionStats.percentages.B}%</span>
                    <span className="px-2 py-0.5 bg-rose-100 rounded text-rose-800 font-semibold">C: {answerDistributionStats.percentages.C}%</span>
                    <span className="px-2 py-0.5 bg-rose-100 rounded text-rose-800 font-semibold">D: {answerDistributionStats.percentages.D}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Navigation Tabs */}
            <div className="px-6 border-b border-gray-200 flex gap-4 shrink-0 bg-white">
              <button
                onClick={() => setStagingTab('duplicates')}
                className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  stagingTab === 'duplicates'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <AlertTriangle
                  size={16}
                  className={
                    stagedRows.filter((r) => r.isDuplicate && r.status !== 'skipped').length > 0
                      ? 'text-amber-500'
                      : 'text-gray-400'
                  }
                />
                Duplicate Conflicts (
                {stagedRows.filter((r) => r.isDuplicate && r.status !== 'skipped').length})
              </button>

              <button
                onClick={() => setStagingTab('unique')}
                className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  stagingTab === 'unique'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <CheckCircle2 size={16} className="text-emerald-600" />
                Approved / Unique Questions ({hierarchyPreviewStats.questionsCount})
              </button>

              <button
                onClick={() => setStagingTab('hierarchy')}
                className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  stagingTab === 'hierarchy'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Layers size={16} className="text-purple-600" />
                Curriculum Blueprint Map
              </button>
            </div>

            {/* Modal Tab Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* TAB 1: DUPLICATES & CONFLICTS */}
              {stagingTab === 'duplicates' && (
                <div>
                  <div className="flex items-center justify-between mb-4 bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                    <div className="text-xs text-amber-900">
                      <strong>Anti-Repetition Protection:</strong> These questions already exist in your
                      database or repeat inside this CSV file. You can skip them or edit them into new questions.
                    </div>
                    {stagedRows.filter((r) => r.status === 'conflict_pending').length > 0 && (
                      <button
                        onClick={handleSkipAllDuplicates}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors shadow-sm"
                      >
                        Skip All Duplicates
                      </button>
                    )}
                  </div>

                  {stagedRows.filter((r) => r.isDuplicate).length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
                      <p className="font-semibold text-gray-700">Zero duplicates detected!</p>
                      <p className="text-xs text-gray-400 mt-1">
                        All questions in this CSV are 100% unique and safe to import.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stagedRows
                        .filter((r) => r.isDuplicate)
                        .map((row) => {
                          const isSkipped = row.status === 'skipped';
                          const isEdited = row.status === 'edited';
                          const isBeingEdited = editingRowId === row.id;

                          return (
                            <div
                              key={row.id}
                              className={`p-4 rounded-xl border transition-all ${
                                isSkipped
                                  ? 'bg-gray-50/60 border-gray-200 opacity-60'
                                  : isEdited
                                  ? 'bg-emerald-50/50 border-emerald-200 shadow-sm'
                                  : 'bg-white border-amber-200 shadow-sm'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">
                                    Row #{row.rowIndex}
                                  </span>

                                  {row.duplicateType === 'database' ? (
                                    <span className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                                      <AlertTriangle size={12} />
                                      Already in Supabase
                                    </span>
                                  ) : (
                                    <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                                      <RefreshCw size={12} />
                                      Duplicate in this CSV
                                    </span>
                                  )}

                                  {isSkipped && (
                                    <span className="text-[11px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md font-semibold">
                                      Skipped (Will not import)
                                    </span>
                                  )}

                                  {isEdited && (
                                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                                      <Check size={12} />
                                      Edited & Approved
                                    </span>
                                  )}
                                </div>

                                {/* Row Actions */}
                                <div className="flex items-center gap-2">
                                  {isSkipped ? (
                                    <button
                                      onClick={() => handleRestoreRow(row.id)}
                                      className="text-xs text-indigo-600 hover:underline font-medium"
                                    >
                                      Restore
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() =>
                                          setEditingRowId(isBeingEdited ? null : row.id)
                                        }
                                        className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors"
                                      >
                                        <Edit size={12} />
                                        {isBeingEdited ? 'Close Editor' : 'Edit Question'}
                                      </button>
                                      <button
                                        onClick={() => handleSkipDuplicate(row.id)}
                                        className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1 rounded-md font-medium transition-colors"
                                      >
                                        Skip
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Path & Conflict Location */}
                              <div className="text-[11px] text-gray-500 mb-2 flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-gray-700">Target:</span>
                                <span>{row.unitTitle}</span>
                                <ChevronRight size={10} className="text-gray-400" />
                                <span>{row.nodeTitle}</span>
                                <ChevronRight size={10} className="text-gray-400" />
                                <span>{row.lessonTitle}</span>
                                <span className="text-gray-300">|</span>
                                <span className="text-amber-800 font-medium">
                                  Found in: {row.existingLocation}
                                </span>
                              </div>

                              {/* Question Text */}
                              <div className="font-medium text-gray-900 text-sm mb-2">
                                {row.questionText}
                              </div>

                              {/* Options */}
                              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-1">
                                {row.options.map((opt, i) => (
                                  <div
                                    key={i}
                                    className={`p-1.5 rounded border ${
                                      opt === row.correctAnswer
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                                        : 'bg-gray-50 border-gray-100'
                                    }`}
                                  >
                                    <span className="font-bold mr-1">
                                      {String.fromCharCode(65 + i)}.
                                    </span>
                                    {opt}
                                  </div>
                                ))}
                              </div>

                              {/* INLINE QUESTION EDITOR */}
                              {isBeingEdited && (
                                <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                                  <div className="text-xs font-bold text-gray-700 uppercase">
                                    Edit Question to Make It Unique
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-medium text-gray-600 block mb-1">
                                      Question Text
                                    </label>
                                    <textarea
                                      value={row.editedText}
                                      onChange={(e) =>
                                        setStagedRows((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id ? { ...r, editedText: e.target.value } : r
                                          )
                                        )
                                      }
                                      className="w-full text-xs p-2.5 border border-gray-300 rounded-lg outline-none bg-white text-gray-900"
                                      rows={2}
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {[0, 1, 2, 3].map((optIdx) => (
                                      <div key={optIdx}>
                                        <label className="text-[10px] font-medium text-gray-500 uppercase block mb-0.5">
                                          Option {String.fromCharCode(65 + optIdx)}
                                        </label>
                                        <input
                                          type="text"
                                          value={row.editedOptions[optIdx] || ''}
                                          onChange={(e) => {
                                            const newOpts = [...row.editedOptions];
                                            newOpts[optIdx] = e.target.value;
                                            setStagedRows((prev) =>
                                              prev.map((r) =>
                                                r.id === row.id
                                                  ? { ...r, editedOptions: newOpts }
                                                  : r
                                              )
                                            );
                                          }}
                                          className="w-full text-xs p-1.5 border border-gray-300 rounded-lg bg-white text-gray-900"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-600">
                                        Correct Option:
                                      </span>
                                      <select
                                        value={
                                          row.editedOptions.indexOf(row.editedCorrectAnswer) >= 0
                                            ? row.editedOptions.indexOf(row.editedCorrectAnswer)
                                            : (() => {
                                                const trimmedLower = (row.editedCorrectAnswer || '').trim().toLowerCase();
                                                const lowerIdx = row.editedOptions.findIndex((o) => (o || '').trim().toLowerCase() === trimmedLower);
                                                if (lowerIdx >= 0) return lowerIdx;
                                                if (trimmedLower === 'a' || trimmedLower === '1') return 0;
                                                if (trimmedLower === 'b' || trimmedLower === '2') return 1;
                                                if (trimmedLower === 'c' || trimmedLower === '3') return 2;
                                                if (trimmedLower === 'd' || trimmedLower === '4') return 3;
                                                return 0;
                                              })()
                                        }
                                        onChange={(e) => {
                                          const idx = parseInt(e.target.value, 10);
                                          const newCorrect = row.editedOptions[idx] || '';
                                          setStagedRows((prev) =>
                                            prev.map((r) =>
                                              r.id === row.id
                                                ? { ...r, editedCorrectAnswer: newCorrect }
                                                : r
                                            )
                                          );
                                        }}
                                        className="text-xs border border-gray-300 rounded p-1 bg-white max-w-[200px] truncate"
                                      >
                                        <option value={0}>A: {row.editedOptions[0] ? (row.editedOptions[0].length > 25 ? row.editedOptions[0].slice(0, 25) + '...' : row.editedOptions[0]) : 'Empty'}</option>
                                        <option value={1}>B: {row.editedOptions[1] ? (row.editedOptions[1].length > 25 ? row.editedOptions[1].slice(0, 25) + '...' : row.editedOptions[1]) : 'Empty'}</option>
                                        <option value={2}>C: {row.editedOptions[2] ? (row.editedOptions[2].length > 25 ? row.editedOptions[2].slice(0, 25) + '...' : row.editedOptions[2]) : 'Empty'}</option>
                                        <option value={3}>D: {row.editedOptions[3] ? (row.editedOptions[3].length > 25 ? row.editedOptions[3].slice(0, 25) + '...' : row.editedOptions[3]) : 'Empty'}</option>
                                      </select>
                                    </div>
                                    <button
                                      onClick={() => handleSaveInlineEdit(row.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 rounded-lg font-semibold transition-colors"
                                    >
                                      Save & Validate
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: APPROVED / UNIQUE QUESTIONS */}
              {stagingTab === 'unique' && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 mb-2">
                    Showing all {hierarchyPreviewStats.questionsCount} questions verified to be
                    imported.
                  </div>
                  {stagedRows
                    .filter((r) => r.status === 'valid' || r.status === 'edited')
                    .map((row, idx) => (
                      <div
                        key={row.id}
                        className="p-3.5 bg-white border border-gray-200 rounded-xl text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-gray-400 font-bold">#{idx + 1}</span>
                          <span className="text-[11px] text-indigo-600 font-medium">
                            {row.unitTitle} &gt; {row.nodeTitle} &gt; {row.lessonTitle}
                          </span>
                        </div>
                        <div className="font-semibold text-gray-800 text-sm">{row.questionText}</div>
                        <div className="text-gray-500 flex gap-2">
                          <span className="font-medium text-emerald-600">
                            Answer: {row.correctAnswer}
                          </span>
                          {row.pyqYear && <span>• PYQ: {row.pyqYear}</span>}
                          {row.districtTag && <span>• District: {row.districtTag}</span>}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* TAB 3: CURRICULUM BLUEPRINT HIERARCHY */}
              {stagingTab === 'hierarchy' && (
                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 leading-relaxed">
                    <strong>Automated Structure Generation:</strong> The system will scan your database
                    and automatically create any missing Units, Nodes, and Lessons. Existing items with
                    matching names will be merged safely without deleting prior content.
                  </div>

                  {Array.from(
                    new Set(
                      stagedRows
                        .filter((r) => r.status === 'valid' || r.status === 'edited')
                        .map((r) => r.unitTitle)
                    )
                  ).map((uTitle) => {
                    const unitRows = stagedRows.filter(
                      (r) =>
                        r.unitTitle === uTitle && (r.status === 'valid' || r.status === 'edited')
                    );
                    const unitNodes = Array.from(new Set(unitRows.map((r) => r.nodeTitle)));
                    const existingUnit = units.find(
                      (u) => u.title.toLowerCase() === uTitle.toLowerCase()
                    );

                    return (
                      <div
                        key={uTitle}
                        className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm"
                      >
                        <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2 font-bold text-sm text-gray-800">
                            <Layers size={16} className="text-indigo-600" />
                            Unit: {uTitle}
                            {existingUnit ? (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-normal">
                                Merging into Existing Unit
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-normal">
                                New Unit will be created
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 font-medium">
                            {unitRows.length} questions
                          </span>
                        </div>

                        <div className="p-3 space-y-2">
                          {unitNodes.map((nTitle) => {
                            const nodeRows = unitRows.filter((r) => r.nodeTitle === nTitle);
                            const nodeLessons = Array.from(new Set(nodeRows.map((r) => r.lessonTitle)));

                            return (
                              <div
                                key={nTitle}
                                className="ml-4 pl-3 border-l-2 border-indigo-200 text-xs space-y-1"
                              >
                                <div className="font-semibold text-gray-700 flex items-center gap-1.5">
                                  <Target size={13} className="text-indigo-500" />
                                  Node: {nTitle}
                                  <span className="text-[10px] text-gray-400">
                                    ({nodeLessons.length} lessons)
                                  </span>
                                </div>
                                <div className="ml-5 space-y-0.5 text-gray-600">
                                  {nodeLessons.map((lTitle) => {
                                    const count = nodeRows.filter((r) => r.lessonTitle === lTitle).length;
                                    return (
                                      <div key={lTitle} className="flex items-center gap-1.5">
                                        <BookOpen size={11} className="text-gray-400" />
                                        <span>Lesson: {lTitle}</span>
                                        <span className="text-[10px] text-emerald-600 font-semibold">
                                          ({count} questions)
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Bottom Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <button
                onClick={() => setShowStagingModal(false)}
                className="px-4 py-2 text-sm text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmBuildCurriculum}
                disabled={actionLoading || hierarchyPreviewStats.questionsCount === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50 text-sm shadow-md"
              >
                {actionLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {importProgress || 'Building Curriculum...'}
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Confirm & Build Curriculum ({hierarchyPreviewStats.questionsCount} Questions)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD MODALS (Unit, Node, Lesson, Question) --- */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">
                {activeModal === 'question' && editingQuestionId
                  ? 'Edit Question'
                  : `Create New ${activeModal}`}
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {errorMsg && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-100">
                  {errorMsg}
                </div>
              )}

              {activeModal !== 'question' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={addForm.title}
                    onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 bg-white text-sm"
                    placeholder="e.g. Ancient India"
                  />
                </div>
              )}

              {activeModal === 'unit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Theme Color
                  </label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={addForm.theme_color}
                      onChange={(e) => setAddForm({ ...addForm, theme_color: e.target.value })}
                      className="h-10 w-10 rounded cursor-pointer border-0 p-0"
                    />
                    <input
                      type="text"
                      value={addForm.theme_color}
                      onChange={(e) => setAddForm({ ...addForm, theme_color: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-mono uppercase text-gray-900 w-28"
                    />
                  </div>
                </div>
              )}

              {activeModal === 'node' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Node Type
                    </label>
                    <select
                      value={addForm.node_type}
                      onChange={(e) => setAddForm({ ...addForm, node_type: e.target.value })}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white text-gray-900"
                    >
                      <option value="learning">Learning</option>
                      <option value="reward">Reward Chest</option>
                      <option value="boss">Boss Challenge</option>
                      <option value="milestone">Milestone Exam</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Animation
                    </label>
                    <select
                      value={addForm.animation_preset}
                      onChange={(e) =>
                        setAddForm({ ...addForm, animation_preset: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white text-gray-900"
                    >
                      <option value="heartbeat">Heartbeat</option>
                      <option value="bounce">Bounce</option>
                      <option value="glow">Glow</option>
                      <option value="float">Float</option>
                    </select>
                  </div>
                </div>
              )}

              {activeModal === 'question' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Question Text
                    </label>
                    <textarea
                      value={addQuestionForm.question_text}
                      onChange={(e) =>
                        setAddQuestionForm({ ...addQuestionForm, question_text: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none h-24 resize-none text-gray-900 bg-white text-sm"
                      placeholder="Enter the question..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {['a', 'b', 'c', 'd'].map((opt) => (
                      <div key={opt}>
                        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">
                          Option {opt}
                        </label>
                        <input
                          type="text"
                          value={(addQuestionForm as any)[`option_${opt}`]}
                          onChange={(e) =>
                            setAddQuestionForm({
                              ...addQuestionForm,
                              [`option_${opt}`]: e.target.value,
                            })
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 outline-none text-xs text-gray-900 bg-white"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Correct Option
                    </label>
                    <select
                      value={addQuestionForm.correct_option}
                      onChange={(e) =>
                        setAddQuestionForm({ ...addQuestionForm, correct_option: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm bg-white text-gray-900"
                    >
                      <option value="A">Option A</option>
                      <option value="B">Option B</option>
                      <option value="C">Option C</option>
                      <option value="D">Option D</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Explanation (Optional)
                    </label>
                    <textarea
                      value={addQuestionForm.explanation}
                      onChange={(e) =>
                        setAddQuestionForm({ ...addQuestionForm, explanation: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-xl px-4 py-2 outline-none h-18 resize-none text-xs text-gray-900 bg-white"
                      placeholder="Why is this correct?"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-sm text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAdd}
                disabled={actionLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {activeModal === 'question' && editingQuestionId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
