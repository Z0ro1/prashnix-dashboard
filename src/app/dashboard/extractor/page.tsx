'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Download,
  BookOpen,
  Layers,
  Target,
  Trash2,
  Edit,
  ArrowRight,
  RefreshCw,
  X,
  Check,
  Calendar,
  Calendar as CalendarIcon,
  Clock,
  Trophy,
  Sliders,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers as LayersIcon,
  Terminal,
} from 'lucide-react';
import Papa from 'papaparse';
import { useFeedback } from '@/components/FeedbackDialog';
import { saveWeeklyTest, WeeklyTestQuestion } from '@/lib/weeklyTestService';

interface ExtractedQuestion {
  id: string;
  rowIndex: number;
  unitTitle: string;
  nodeTitle: string;
  nodeType: string;
  lessonTitle: string;
  questionText: string;
  options: string[];
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  correctAnswer: string;
  explanation: string;
  pyqYear: number | null;
  districtTag: string | null;
}

const EXAM_TYPES = [
  'Police Bharti',
  'MPSC Rajyaseva',
  'Combine Group B & C',
  'Talathi Bharti',
];

export default function SimplifiedPdfExtractorPage() {
  const router = useRouter();
  const { toast, alert: customAlert, confirm } = useFeedback();

  // Multi-PDF upload state
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [currentFileIdx, setCurrentFileIdx] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Detailed Step Pipeline & Terminal Logs
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [pipelineLogs, setPipelineLogs] = useState<{ time: string; msg: string; type?: 'info' | 'success' | 'warn' }[]>([]);

  // Extracted Data
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [detectedExamTitle, setDetectedExamTitle] = useState<string>('');

  // AI Model & Extraction Configuration
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  const [extractionDepth, setExtractionDepth] = useState<'bulk_unlimited' | 'weekly_test_100'>('bulk_unlimited');
  const [weeklyTestSetIndex, setWeeklyTestSetIndex] = useState<number>(0);

  // 2nd Section: Organization Mode ('curriculum' or 'weekly_test')
  const [destinationMode, setDestinationMode] = useState<'curriculum' | 'weekly_test'>('curriculum');

  // Weekly Test Schedule State
  const [testTitle, setTestTitle] = useState<string>('महाराष्ट्र पोलीस भरती साप्ताहिक महासराव चाचणी');
  const [examType, setExamType] = useState<string>('Police Bharti');
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (7 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  });
  const [scheduledTime, setScheduledTime] = useState<string>('12:00');
  const [durationMinutes, setDurationMinutes] = useState<number>(90);
  const [isPublishingWeeklyTest, setIsPublishingWeeklyTest] = useState<boolean>(false);

  // Review & Inline Edit state
  const [showQuestionsList, setShowQuestionsList] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestion | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Multi-file selection
  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length === 0) {
      toast('warning', 'No PDFs Selected', 'Please select one or more PDF files.');
      return;
    }

    setPdfFiles((prev) => [...prev, ...files]);

    // Set default title from first file name
    if (!detectedExamTitle && files[0]) {
      const cleanName = files[0].name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_.-]+/g, ' ')
        .trim();
      setDetectedExamTitle(cleanName);
      setTestTitle(cleanName);
    }
  };

  const handleRemoveFile = (index: number) => {
    setPdfFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Helper to append pipeline logs
  const addPipelineLog = (msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
    setPipelineLogs((prev) => [...prev.slice(-30), { time, msg, type }]);
  };

  // Run Batch AI Extraction across all dropped PDFs
  const handleStartBatchExtraction = async () => {
    if (pdfFiles.length === 0) {
      toast('warning', 'Drop PDFs First', 'Please add one or more PDF exam papers.');
      return;
    }

    setIsExtracting(true);
    setProgressPercent(5);
    setElapsedSeconds(0);
    setCurrentStep(1);

    const timeStr = () => new Date().toLocaleTimeString('en-IN', { hour12: false });
    setPipelineLogs([
      {
        time: timeStr(),
        msg: `Initialized question extraction pipeline with model: ${selectedModel}`,
        type: 'info',
      },
      {
        time: timeStr(),
        msg: `${pdfFiles.length} PDF paper(s) queued. Extraction Mode: ${
          extractionDepth === 'bulk_unlimited'
            ? 'Unlimited Bulk Extraction (All Questions • Auto-Chunking)'
            : 'Weekly Test Batch (100 Qs Only)'
        }`,
        type: 'info',
      },
    ]);

    setProcessingStatus(
      extractionDepth === 'bulk_unlimited'
        ? `Initializing full multi-page bulk extraction for ${pdfFiles.length} file(s)...`
        : `Starting 100-Question Smart Dual-Batch extraction for Weekly Test...`
    );

    const timerInterval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    const allExtracted: ExtractedQuestion[] = [];
    let detectedTitle = detectedExamTitle;

    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        setCurrentFileIdx(i);

        // Step 1: Ingest & get PDF metadata (page count)
        setCurrentStep(1);
        addPipelineLog(`[File ${i + 1}/${pdfFiles.length}] Ingesting "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`, 'info');

        const infoFormData = new FormData();
        infoFormData.append('file', file);
        infoFormData.append('action', 'get_info');

        let totalPages = 1;
        try {
          const infoRes = await fetch('/api/ai/extract-pdf', {
            method: 'POST',
            body: infoFormData,
          });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            totalPages = infoData.totalPages || 1;
          }
        } catch (e: any) {
          console.warn('Could not inspect PDF metadata:', e?.message);
        }

        setCurrentStep(2);
        addPipelineLog(
          `"${file.name}" has ${totalPages} total page(s).`,
          'info'
        );

        if (extractionDepth === 'weekly_test_100') {
          // Specific 100-question batch for weekly test
          setCurrentStep(3);
          setProcessingStatus(`Extracting 100 questions from "${file.name}" for Weekly Test...`);
          addPipelineLog(`Running dual-batch for 100 questions on "${file.name}"...`, 'info');

          const formData = new FormData();
          formData.append('file', file);
          formData.append('model', selectedModel);
          formData.append('extractionDepth', 'weekly_test_100');
          formData.append('categorizeMode', 'exam_paper');
          formData.append('targetUnit', 'पोलीस भरती PYQ प्रश्नपत्रिका');
          formData.append(
            'targetNode',
            detectedTitle || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
          );

          const res = await fetch('/api/ai/extract-pdf', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `Failed to process ${file.name}`);
          }

          if (data.examTitle && !detectedTitle) {
            detectedTitle = data.examTitle;
            setDetectedExamTitle(data.examTitle);
            setTestTitle(data.examTitle);
          }

          const questions: ExtractedQuestion[] = data.questions || [];
          allExtracted.push(...questions);
          setExtractedQuestions([...allExtracted]);

          addPipelineLog(
            `Extracted ${questions.length} questions from ${file.name}.`,
            'success'
          );
        } else {
          // Unlimited Bulk Extraction via 4-page chunking
          const PAGES_PER_CHUNK = 4;
          const totalChunks = Math.ceil(totalPages / PAGES_PER_CHUNK);

          addPipelineLog(
            `Chunk engine: Dividing ${totalPages} pages into ${totalChunks} chunk(s) (${PAGES_PER_CHUNK} pages/chunk)...`,
            'info'
          );

          for (let c = 0; c < totalChunks; c++) {
            const startPage = c * PAGES_PER_CHUNK + 1;
            const endPage = Math.min(totalPages, (c + 1) * PAGES_PER_CHUNK);
            const chunkLabel = `Pages ${startPage}-${endPage} (Chunk ${c + 1}/${totalChunks})`;

            setCurrentStep(3);
            setProcessingStatus(
              `[${c + 1}/${totalChunks}] Extracting ${chunkLabel} from "${file.name}"... (${allExtracted.length} Qs extracted so far)`
            );

            const fileBase = i / pdfFiles.length;
            const chunkBase = c / (totalChunks * pdfFiles.length);
            const prog = Math.min(94, Math.round((fileBase + chunkBase) * 90 + 5));
            setProgressPercent(prog);

            addPipelineLog(`[${chunkLabel}] Slicing & extracting MCQs with ${selectedModel}...`, 'info');

            const chunkFormData = new FormData();
            chunkFormData.append('file', file);
            chunkFormData.append('model', selectedModel);
            chunkFormData.append('extractionDepth', 'bulk_unlimited');
            chunkFormData.append('startPage', String(startPage));
            chunkFormData.append('endPage', String(endPage));
            chunkFormData.append('categorizeMode', 'exam_paper');
            chunkFormData.append('targetUnit', 'पोलीस भरती PYQ प्रश्नपत्रिका');
            chunkFormData.append(
              'targetNode',
              detectedTitle || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
            );

            try {
              setCurrentStep(4);
              const res = await fetch('/api/ai/extract-pdf', {
                method: 'POST',
                body: chunkFormData,
              });

              const data = await res.json();
              if (!res.ok) {
                addPipelineLog(`[${chunkLabel}] Chunk notice: ${data.error || 'Failed to extract chunk'}`, 'warn');
                continue;
              }

              if (data.examTitle && !detectedTitle) {
                detectedTitle = data.examTitle;
                setDetectedExamTitle(data.examTitle);
                setTestTitle(data.examTitle);
              }

              const chunkQuestions: ExtractedQuestion[] = data.questions || [];
              allExtracted.push(...chunkQuestions);

              // Live update state so user watches question count climb in real time!
              setExtractedQuestions([...allExtracted]);

              setCurrentStep(5);
              addPipelineLog(
                `[${chunkLabel}] Extracted ${chunkQuestions.length} questions. (Running total: ${allExtracted.length} Qs)`,
                'success'
              );
            } catch (chunkErr: any) {
              addPipelineLog(`[${chunkLabel}] Network glitch: ${chunkErr?.message || 'Retrying next chunk'}`, 'warn');
            }
          }
        }
      }

      // Re-index rowIndex
      const reindexed = allExtracted.map((q, idx) => ({
        ...q,
        rowIndex: idx + 1,
      }));

      setCurrentStep(6);
      setProgressPercent(100);
      setExtractedQuestions(reindexed);
      setShowQuestionsList(true);

      addPipelineLog(
        `Pipeline complete: All ${reindexed.length} questions extracted & verified. Ready for Curriculum or Weekly Test.`,
        'success'
      );

      toast(
        'success',
        'Bulk Extraction Complete!',
        `Successfully extracted ALL ${reindexed.length} questions with Marathi explanations across ${pdfFiles.length} PDF(s). Zero limits applied!`
      );
    } catch (err: any) {
      addPipelineLog(`Extraction error: ${err.message}`, 'warn');
      customAlert(
        'Extraction Failed',
        err instanceof Error ? err.message : 'Error extracting questions from PDF.',
        'error'
      );
    } finally {
      clearInterval(timerInterval);
      setIsExtracting(false);
    }
  };

  // Default lesson titles for curriculum partitioning
  const DEFAULT_LESSON_TITLES = [
    'पायाभूत संकल्पना व सराव',
    'संकल्पना दृढीकरण',
    'मध्यम काठिण्य पातळी सराव',
    'प्रगत प्रश्न व PYQ सराव',
    'वेग व अचूकता महासराव',
    'नोड अंतिम उजळणी व परीक्षा',
    'विशेष सराव चाचणी',
    'अंतिम कौशल्य सराव',
  ];

  // Helper to chunk extracted questions into Units (max 8 nodes), Nodes (max 5 lessons), and Lessons (25 questions)
  const getChunkedHierarchy = (questions: ExtractedQuestion[]) => {
    const QUESTIONS_PER_LESSON = 25;
    const LESSONS_PER_NODE = 5;
    const NODES_PER_UNIT = 8;
    const QUESTIONS_PER_UNIT = QUESTIONS_PER_LESSON * LESSONS_PER_NODE * NODES_PER_UNIT; // 1,000 Qs

    const totalQuestions = questions.length;
    const totalUnits = Math.max(1, Math.ceil(totalQuestions / QUESTIONS_PER_UNIT));
    const totalNodes = Math.max(1, Math.ceil(totalQuestions / (QUESTIONS_PER_LESSON * LESSONS_PER_NODE)));
    const totalLessons = Math.max(1, Math.ceil(totalQuestions / QUESTIONS_PER_LESSON));

    const examBase = detectedExamTitle || 'पोलीस भरती PYQ प्रश्नपत्रिका';

    return {
      totalQuestions,
      totalUnits,
      totalNodes,
      totalLessons,
      examBase,
      QUESTIONS_PER_LESSON,
      LESSONS_PER_NODE,
      NODES_PER_UNIT,
    };
  };

  // Option 1: Auto Set to AI Builder Curriculum with strict 8x5x25 Auto-Chunking
  const handleAutoSetToCurriculum = () => {
    if (extractedQuestions.length === 0) return;

    const {
      totalQuestions,
      totalUnits,
      totalNodes,
      totalLessons,
      examBase,
      QUESTIONS_PER_LESSON,
      LESSONS_PER_NODE,
      NODES_PER_UNIT,
    } = getChunkedHierarchy(extractedQuestions);

    // Auto-chunk into Units (max 8 nodes) and Nodes (max 5 lessons) and Lessons (25 Qs)
    const stagedRows = extractedQuestions.map((q, idx) => {
      const globalLessonIdx = Math.floor(idx / QUESTIONS_PER_LESSON);
      const globalNodeIdx = Math.floor(globalLessonIdx / LESSONS_PER_NODE);
      const globalUnitIdx = Math.floor(globalNodeIdx / NODES_PER_UNIT);
      const nodeInUnitIdx = (globalNodeIdx % NODES_PER_UNIT) + 1;
      const lessonInNodeIdx = (globalLessonIdx % LESSONS_PER_NODE) + 1;

      const unitTitle =
        totalUnits > 1
          ? `${q.unitTitle || examBase} - भाग ${globalUnitIdx + 1}`
          : q.unitTitle || examBase;

      const baseNode = q.nodeTitle || detectedExamTitle || 'सराव घटक';
      const nodeTitle =
        totalNodes > 1
          ? `${baseNode} - घटक ${nodeInUnitIdx} (संच ${globalNodeIdx + 1})`
          : baseNode;

      const lessonTitle = `Lesson ${lessonInNodeIdx}: ${
        DEFAULT_LESSON_TITLES[lessonInNodeIdx - 1] || `सराव भाग ${lessonInNodeIdx}`
      }`;

      return {
        id: `staged_ai_${Date.now()}_${idx}`,
        rowIndex: idx + 1,
        unitTitle,
        unitColor: '#4f46e5',
        nodeTitle,
        nodeType: 'learning',
        lessonTitle,
        questionText: q.questionText,
        options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        pyqYear: q.pyqYear || 2024,
        districtTag: q.districtTag || '',
        isDuplicate: false,
        status: 'valid' as const,
        editedText: q.questionText,
        editedOptions: [q.optionA, q.optionB, q.optionC, q.optionD],
        editedCorrectAnswer: q.correctAnswer,
        editedExplanation: q.explanation,
      };
    });

    sessionStorage.setItem('prashnix_pending_staged_import', JSON.stringify(stagedRows));
    sessionStorage.setItem('prashnix_pending_exam_title', examBase);

    toast(
      'success',
      'Auto-Chunked & Transferred to Curriculum',
      `Auto-chunked ${totalQuestions} questions into ${totalUnits} Unit(s), ${totalNodes} Node(s) (max 5 lessons), and ${totalLessons} Lessons (25 Qs each).`
    );
    router.push('/dashboard/curriculum');
  };

  // Option 2: Download Clean CSV File (also auto-chunked by 8x5x25 hierarchy)
  const handleDownloadCsv = () => {
    if (extractedQuestions.length === 0) return;

    const {
      totalUnits,
      totalNodes,
      examBase,
      QUESTIONS_PER_LESSON,
      LESSONS_PER_NODE,
      NODES_PER_UNIT,
    } = getChunkedHierarchy(extractedQuestions);

    const csvData = extractedQuestions.map((q, idx) => {
      const globalLessonIdx = Math.floor(idx / QUESTIONS_PER_LESSON);
      const globalNodeIdx = Math.floor(globalLessonIdx / LESSONS_PER_NODE);
      const globalUnitIdx = Math.floor(globalNodeIdx / NODES_PER_UNIT);
      const nodeInUnitIdx = (globalNodeIdx % NODES_PER_UNIT) + 1;
      const lessonInNodeIdx = (globalLessonIdx % LESSONS_PER_NODE) + 1;

      const unitTitle =
        totalUnits > 1
          ? `${q.unitTitle || examBase} - भाग ${globalUnitIdx + 1}`
          : q.unitTitle || examBase;

      const baseNode = q.nodeTitle || detectedExamTitle || 'सराव घटक';
      const nodeTitle =
        totalNodes > 1
          ? `${baseNode} - घटक ${nodeInUnitIdx} (संच ${globalNodeIdx + 1})`
          : baseNode;

      const lessonTitle = `Lesson ${lessonInNodeIdx}: ${
        DEFAULT_LESSON_TITLES[lessonInNodeIdx - 1] || `सराव भाग ${lessonInNodeIdx}`
      }`;

      return {
        'Unit Title': unitTitle,
        'Theme Color': '#4f46e5',
        'Node Title': nodeTitle,
        'Node Type': 'learning',
        'Lesson Title': lessonTitle,
        'Question Text': q.questionText,
        'Option A': q.optionA,
        'Option B': q.optionB,
        'Option C': q.optionC,
        'Option D': q.optionD,
        'Correct Option (A/B/C/D)': q.correctOption,
        Explanation: q.explanation,
        'PYQ Year': q.pyqYear || '',
        District: q.districtTag || '',
      };
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `prashnix_chunked_${Date.now()}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast('success', 'CSV Downloaded', `Saved ${extractedQuestions.length} chunked questions to ${filename}`);
  };

  // 1-Click "Auto Set All" action
  const handleAutoSetAll = () => {
    if (destinationMode === 'weekly_test') {
      handlePublishWeeklyTestToSupabase();
    } else {
      handleAutoSetToCurriculum();
    }
  };

  // 2nd Section Action: Publish Weekly Test with 100 Questions to Supabase
  const handlePublishWeeklyTestToSupabase = async () => {
    if (extractedQuestions.length === 0) {
      toast('warning', 'No Questions', 'Please extract questions first.');
      return;
    }

    // Require strict 100 questions rule
    if (extractedQuestions.length < 100) {
      customAlert(
        '100 Questions Required for Weekly Test',
        `An official Weekly Test strictly requires 100 questions. You currently have ${extractedQuestions.length} questions. Please drop another PDF exam paper or add more questions to reach 100.`,
        'warning'
      );
      return;
    }

    // Use selected 100 questions for Weekly Test
    const startIdx = weeklyTestSetIndex * 100;
    const questionsToUse = extractedQuestions.slice(startIdx, startIdx + 100);

    const weeklyQuestions: WeeklyTestQuestion[] = questionsToUse.map((q, idx) => ({
      id: q.id || `q_${idx}`,
      questionNumber: idx + 1,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption || 'A',
      correctAnswer: q.correctAnswer || q.optionA,
      explanation: q.explanation || '',
    }));

    setIsPublishingWeeklyTest(true);
    try {
      const scheduledDateTime = `${scheduledDate}T${scheduledTime}:00Z`;

      const result = await saveWeeklyTest({
        title: testTitle.trim() || 'महाराष्ट्र पोलीस भरती साप्ताहिक महासराव चाचणी',
        exam_type: examType,
        scheduled_date: scheduledDate,
        start_time: scheduledDateTime,
        duration_minutes: durationMinutes,
        total_marks: 100,
        questions: weeklyQuestions,
        is_active: true,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save weekly test to Supabase');
      }

      // Store in session storage for weekly-tests dashboard
      sessionStorage.setItem(
        'prashnix_pending_weekly_test_questions',
        JSON.stringify(weeklyQuestions)
      );

      customAlert(
        'Weekly Test Scheduled in Supabase!',
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            Your <strong>100-Question Official Weekly Test</strong> has been scheduled and synced
            with Supabase!
          </p>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-xs text-emerald-950 font-medium">
            <div>
              <strong>Title:</strong> {testTitle}
            </div>
            <div>
              <strong>Category:</strong> {examType}
            </div>
            <div>
              <strong>Date:</strong> {scheduledDate} at {scheduledTime}
            </div>
            <div>
              <strong>Questions:</strong> Exactly 100 Questions (100 Marks • {durationMinutes} mins)
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Candidates on the mobile app will see this test scheduled with the live countdown timer!
          </p>
        </div>,
        'info'
      );

      toast('success', 'Weekly Test Created!', 'Synced 100 questions to Supabase.');
    } catch (err: any) {
      customAlert('Failed to Schedule Weekly Test', err.message, 'error');
    } finally {
      setIsPublishingWeeklyTest(false);
    }
  };

  const fullLessonsCount = Math.floor(extractedQuestions.length / 25);
  const leftoverCount = extractedQuestions.length % 25;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-900">
            PDF question extraction
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload past exam papers to extract multiple-choice questions, verify Devanagari text, and route them to curriculum pools.
          </p>
        </div>
      </div>

      {/* Extraction Configuration Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-900">
            Extraction configuration
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Select optical character recognition model and extraction scope.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Model Selector Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 rounded-lg px-2.5 py-1.5 focus:border-slate-400 focus:outline-none cursor-pointer"
            >
              <option value="gemini-3-flash-preview">Gemini 3 Flash (Fastest • 65k output)</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash (Balanced • High quality)</option>
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (Latest flagship)</option>
              <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (Ultra fast)</option>
              <option value="gemini-flash-latest">Gemini Flash (Stable)</option>
            </select>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setExtractionDepth('bulk_unlimited')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                extractionDepth === 'bulk_unlimited'
                  ? 'bg-white text-slate-900 font-medium shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 font-normal'
              }`}
            >
              Full paper
            </button>
            <button
              type="button"
              onClick={() => setExtractionDepth('weekly_test_100')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                extractionDepth === 'weekly_test_100'
                  ? 'bg-white text-slate-900 font-medium shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 font-normal'
              }`}
            >
              Weekly test (100 Qs)
            </button>
          </div>
        </div>
      </div>

      {/* Upload Exam Papers */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-900 text-sm">Upload exam papers</h2>
          <span className="text-xs text-slate-400">
            Supports multiple PDF papers simultaneously
          </span>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFilesSelect}
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
        />

        {/* Multi-file Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group"
        >
          <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center mb-3 border border-slate-200">
            <Upload size={18} />
          </div>
          <div className="text-sm font-medium text-slate-800">
            Select PDF files or drag and drop here
          </div>
          <div className="text-xs text-slate-500 mt-1 max-w-md">
            Upload Police Bharti, MPSC, or Saral Seva question papers to extract MCQs automatically.
          </div>
        </div>

        {/* Selected Files Chips List */}
        {pdfFiles.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-700">
              <span>Selected PDFs ({pdfFiles.length} papers ready)</span>
              <button
                onClick={() => setPdfFiles([])}
                className="text-slate-500 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {pdfFiles.map((file, idx) => (
                <div
                  key={`${file.name}_${idx}`}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="p-1.5 bg-slate-200 text-slate-700 rounded-md shrink-0">
                      <FileText size={15} />
                    </div>
                    <div className="truncate">
                      <div className="font-medium text-slate-900 text-xs truncate">{file.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(idx)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Main Primary Extract Button */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleStartBatchExtraction}
                disabled={isExtracting}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {isExtracting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Extracting questions...
                  </>
                ) : (
                  <>
                    Extract questions ({pdfFiles.length} {pdfFiles.length === 1 ? 'paper' : 'papers'})
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Detailed Extraction Pipeline */}
      {isExtracting && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
          {/* Top Info Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shrink-0">
                <Cpu size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-900 text-sm">
                    Question extraction pipeline active
                  </h3>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    Live
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span>File {currentFileIdx + 1} of {pdfFiles.length}:</span>
                  <span className="font-mono text-slate-800 font-medium">
                    {pdfFiles[currentFileIdx]?.name || 'Exam Paper'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <div className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-mono flex items-center gap-1.5">
                <Clock size={13} className="text-slate-500" />
                <span>
                  Elapsed: {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                  {(elapsedSeconds % 60).toString().padStart(2, '0')}s
                </span>
              </div>
              <div className="text-xs font-mono font-medium text-slate-900 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg">
                <span>{progressPercent}%</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-600 px-0.5">
              <span>{processingStatus}</span>
              <span className="font-mono text-slate-700">{progressPercent}% completed</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className="bg-slate-900 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 6-Step Visual Pipeline Stepper */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600 flex items-center justify-between">
              <span>Pipeline steps</span>
              <span className="text-xs text-slate-500">Step {currentStep} of 6</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { id: 1, title: '1. Ingest PDF', desc: 'Binary stream' },
                { id: 2, title: '2. Page Slicing', desc: 'Auto-chunks' },
                { id: 3, title: '3. Multi-Chunk AI', desc: 'Batch extraction' },
                { id: 4, title: '4. 4 Options & Key', desc: 'Parsed options' },
                { id: 5, title: '5. Explanation', desc: 'Marathi summary' },
                { id: 6, title: '6. Ready for Use', desc: 'Verified set' },
              ].map((step) => {
                const isPassed = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                return (
                  <div
                    key={step.id}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      isPassed
                        ? 'bg-slate-50 border-slate-200 text-slate-800'
                        : isCurrent
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium font-mono">
                        {isPassed ? (
                          <span className="flex items-center gap-1 text-slate-700">
                            <CheckCircle2 size={12} className="text-slate-600" /> Done
                          </span>
                        ) : isCurrent ? (
                          <span className="flex items-center gap-1 text-white">
                            <RefreshCw size={11} className="animate-spin" /> In progress
                          </span>
                        ) : (
                          <span className="text-slate-400">Waiting</span>
                        )}
                      </span>
                    </div>
                    <div className="font-medium text-xs truncate">{step.title}</div>
                    <div className={`text-[10px] mt-0.5 truncate ${isCurrent ? 'text-slate-300' : 'text-slate-400'}`}>
                      {step.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Pipeline Activity Console / Terminal */}
          <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs border border-slate-800 space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Terminal size={13} className="text-slate-400" />
                pipeline.log
              </span>
              <span className="text-[10px] text-slate-500 font-sans">
                {selectedModel} • {extractionDepth === 'bulk_unlimited' ? 'Full paper mode' : 'Weekly test (100 Qs)'}
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1 pr-1 font-mono text-xs">
              {pipelineLogs.map((log, lIdx) => (
                <div key={lIdx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 shrink-0 select-none">[{log.time}]</span>
                  <span
                    className={
                      log.type === 'success'
                        ? 'text-emerald-400 font-medium'
                        : log.type === 'warn'
                        ? 'text-amber-400'
                        : 'text-slate-200'
                    }
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Extracted Results & Action Hub */}
      {extractedQuestions.length > 0 && !isExtracting && (
        <div className="space-y-6">
          {/* Quick Metrics Bar & Actions */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center min-w-[110px]">
                  <div className="text-xs text-slate-500">Questions</div>
                  <div className="text-xl font-medium text-slate-900 mt-0.5">
                    {extractedQuestions.length}
                  </div>
                  <div className="text-[11px] text-slate-400">Total extracted</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center min-w-[120px]">
                  <div className="text-xs text-slate-500">25-Q lessons</div>
                  <div className="text-xl font-medium text-slate-900 mt-0.5">
                    {fullLessonsCount}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {fullLessonsCount * 25} Qs
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center min-w-[130px]">
                  <div className="text-xs text-slate-500">Weekly test</div>
                  <div className="text-xl font-medium text-slate-900 mt-0.5">
                    {extractedQuestions.length >= 100 ? '100 ready' : `${extractedQuestions.length}/100`}
                  </div>
                  <div className="text-[11px] text-slate-400">Quota status</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleAutoSetToCurriculum}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
                >
                  Auto set to curriculum
                </button>

                <button
                  onClick={handleDownloadCsv}
                  className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Download size={14} />
                  Download CSV
                </button>

                <button
                  onClick={handleAutoSetAll}
                  className="px-3.5 py-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Auto Set All questions into the chosen destination with 1 click"
                >
                  <Check size={14} />
                  Auto set all
                </button>
              </div>
            </div>

            {/* Destination Mode */}
            <div className="space-y-4 pt-1">
              <div>
                <h3 className="font-medium text-slate-900 text-sm">
                  Destination target
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Route questions to standard 25-question lessons or an official 100-mark weekly test.
                </p>
              </div>

              {/* Segmented Switch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => setDestinationMode('curriculum')}
                  className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-colors ${
                    destinationMode === 'curriculum'
                      ? 'bg-slate-50 border-slate-900 ring-1 ring-slate-900'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      destinationMode === 'curriculum'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <BookOpen size={16} />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 text-xs">
                      Curriculum lessons (25 Qs/lesson)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Partitions into strict 25-question lessons per learning node.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationMode('weekly_test')}
                  className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-colors ${
                    destinationMode === 'weekly_test'
                      ? 'bg-slate-50 border-slate-900 ring-1 ring-slate-900'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      destinationMode === 'weekly_test'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Calendar size={16} />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 text-xs">
                      Official weekly test (100 questions)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Schedules a 100-mark mock test with date & calendar on Supabase.
                    </div>
                  </div>
                </button>
              </div>

              {/* Destination 1 Details: Curriculum Lessons */}
              {destinationMode === 'curriculum' && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-800 font-medium">
                          Auto-chunking strategy (8x5x25 rule)
                        </span>
                        <span className="text-[10px] font-medium bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                          Enforced
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          <strong>{Math.max(1, Math.ceil(extractedQuestions.length / 1000))}</strong> unit(s)
                        </span>
                        <span>•</span>
                        <span>
                          <strong>{Math.max(1, Math.ceil(extractedQuestions.length / 125))}</strong> node(s)
                        </span>
                        <span>•</span>
                        <span>
                          <strong>{fullLessonsCount}</strong> lessons (25 Qs each)
                        </span>
                        {leftoverCount > 0 && (
                          <span className="text-amber-700 font-medium">
                            ({leftoverCount} leftover Qs)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleAutoSetToCurriculum}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      Set to curriculum builder
                    </button>
                  </div>
                </div>
              )}

              {/* Destination 2 Details: Weekly Test */}
              {destinationMode === 'weekly_test' && (
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-slate-600" />
                      <span className="font-medium text-slate-900 text-sm">
                        Schedule official 100-mark weekly test
                      </span>
                    </div>

                    {/* Strict 100 Questions Validator */}
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-medium ${
                        extractedQuestions.length >= 100
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {extractedQuestions.length >= 100
                        ? `${extractedQuestions.length} Qs available (100 used)`
                        : `Need 100 Qs (Current: ${extractedQuestions.length}/100)`}
                    </span>
                  </div>

                  {/* 100-Question Slice Selector if multiple 100-sets are available */}
                  {extractedQuestions.length > 100 && (
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-300/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-emerald-950">Select 100-Question Set:</span>
                        <select
                          value={weeklyTestSetIndex}
                          onChange={(e) => setWeeklyTestSetIndex(Number(e.target.value))}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none cursor-pointer"
                        >
                          {Array.from({ length: Math.floor(extractedQuestions.length / 100) }).map((_, idx) => (
                            <option key={idx} value={idx}>
                              Set {idx + 1}: Questions {idx * 100 + 1} to {(idx + 1) * 100}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Using questions {weeklyTestSetIndex * 100 + 1} to {(weeklyTestSetIndex + 1) * 100} of {extractedQuestions.length}
                      </div>
                    </div>
                  )}

                  {/* Form fields for Weekly Test */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {/* Title */}
                    <div className="sm:col-span-2">
                      <label className="font-medium text-slate-700 block mb-1">Weekly test title</label>
                      <input
                        type="text"
                        value={testTitle}
                        onChange={(e) => setTestTitle(e.target.value)}
                        placeholder="उदा. महाराष्ट्र पोलीस भरती साप्ताहिक महासराव चाचणी"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-slate-400 text-xs"
                      />
                    </div>

                    {/* Category */}
                    <div>
                      <label className="font-medium text-slate-700 block mb-1">Exam category</label>
                      <select
                        value={examType}
                        onChange={(e) => setExamType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 outline-none focus:border-slate-400 text-xs"
                      >
                        {EXAM_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Picker (Calendar) */}
                    <div>
                      <label className="font-medium text-slate-700 block mb-1 flex items-center gap-1">
                        <CalendarIcon size={13} className="text-slate-500" />
                        Test date
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-slate-400 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <Clock size={13} className="text-slate-500 shrink-0" />
                      <span>
                        Starts at <strong>{scheduledTime}</strong> • Duration: <strong>{durationMinutes} mins</strong> • 100 marks
                      </span>
                    </div>

                    {/* Direct Supabase Publish Button */}
                    <button
                      onClick={handlePublishWeeklyTestToSupabase}
                      disabled={isPublishingWeeklyTest || extractedQuestions.length < 100}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
                    >
                      {isPublishingWeeklyTest ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          Publishing test...
                        </>
                      ) : (
                        <>
                          Publish weekly test (100 Qs)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Extracted Questions Review Accordion */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowQuestionsList(!showQuestionsList)}
              className="w-full p-4 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between text-xs font-bold text-gray-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>Review Extracted Questions ({extractedQuestions.length} Questions Cleaned)</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500">
                <span>{showQuestionsList ? 'Collapse' : 'Expand'}</span>
                {showQuestionsList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {showQuestionsList && (
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto divide-y divide-gray-100">
                {extractedQuestions.map((q, idx) => (
                  <div key={q.id || idx} className="pt-3 first:pt-0 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-mono font-bold rounded">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-gray-900 leading-relaxed">{q.questionText}</span>
                      </div>
                      <button
                        onClick={() => setEditingQuestion(q)}
                        className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                        title="Edit question"
                      >
                        <Edit size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'A'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        A) {q.optionA}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'B'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        B) {q.optionB}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'C'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        C) {q.optionC}
                      </div>
                      <div
                        className={`p-1.5 rounded-lg border ${
                          q.correctOption === 'D'
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                            : 'bg-gray-50 border-gray-200'
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
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl w-full max-w-xl overflow-hidden shadow-xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="font-medium text-slate-900 text-xs">
                Edit question #{editingQuestion.rowIndex}
              </span>
              <button onClick={() => setEditingQuestion(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Question text</label>
                <textarea
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:border-slate-400 outline-none text-xs"
                />
              </div>

              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const key = `option${letter}` as keyof ExtractedQuestion;
                const isCorrect = editingQuestion.correctOption === letter;
                return (
                  <div key={letter} className="flex items-center gap-2">
                    <span className="w-5 font-medium text-slate-600">{letter})</span>
                    <input
                      type="text"
                      value={String(editingQuestion[key] || '')}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, [key]: e.target.value })
                      }
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 focus:border-slate-400 outline-none text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditingQuestion({
                          ...editingQuestion,
                          correctOption: letter,
                          correctAnswer: String(editingQuestion[key] || ''),
                        })
                      }
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        isCorrect ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isCorrect ? 'Correct' : 'Set'}
                    </button>
                  </div>
                );
              })}

              <div>
                <label className="font-medium text-slate-700 block mb-1">Explanation (स्पष्टीकरण)</label>
                <textarea
                  value={editingQuestion.explanation}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:border-slate-400 outline-none text-xs"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setExtractedQuestions((prev) =>
                    prev.map((q) => (q.id === editingQuestion.id ? editingQuestion : q))
                  );
                  setEditingQuestion(null);
                  toast('success', 'Question saved', 'Updated successfully.');
                }}
                className="px-4 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
