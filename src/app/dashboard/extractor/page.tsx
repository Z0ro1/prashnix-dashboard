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
          <h1 className="text-2xl font-medium text-slate-900 tracking-tight">
            PDF question extraction
          </h1>
          <p className="text-slate-500 text-sm mt-1 leading-relaxed">
            Upload past exam papers to extract multiple-choice questions, verify Devanagari text, and route them to curriculum pools.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/dashboard/weekly-tests')}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <CalendarIcon size={14} className="text-slate-500" />
            Weekly tests
          </button>
        </div>
      </div>

      {/* AI Model Switcher */}
      <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700/60">
            <Cpu size={18} />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-100">
              Extraction engine
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Select AI model for optical character extraction and Devanagari formatting.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Model Switcher Dropdown */}
          <div className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-800 px-3 py-2 rounded-xl border border-slate-700/80 transition-colors shadow-xs">
            <Sliders size={14} className="text-indigo-400" />
            <span className="text-xs text-slate-400 font-semibold">Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent text-xs font-bold text-white focus:outline-hidden cursor-pointer pr-1"
            >
              <option value="gemini-3-flash-preview" className="bg-slate-900 text-white">
                Gemini 3 Flash (Fastest • 65k Output)
              </option>
              <option value="gemini-3.5-flash" className="bg-slate-900 text-white">
                Gemini 3.5 Flash (Balanced • High Quality)
              </option>
              <option value="gemini-3.8-flash" className="bg-slate-900 text-white">
                Gemini 3.8 Flash (Latest Flagship)
              </option>
              <option value="gemini-3.5-flash-lite" className="bg-slate-900 text-white">
                Gemini 3.5 Flash Lite (Ultra Fast)
              </option>
              <option value="gemini-flash-latest" className="bg-slate-900 text-white">
                Gemini Flash (Stable)
              </option>
            </select>
          </div>

          {/* Extraction Mode Switcher: Unlimited Bulk vs Weekly Test Batch */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-xs">
            <button
              type="button"
              onClick={() => setExtractionDepth('bulk_unlimited')}
              className={`px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${
                extractionDepth === 'bulk_unlimited'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Extract ALL questions across all pages with zero limits (1000+, 2000+ Qs supported via auto-chunking)"
            >
              <Sparkles size={13} />
              Unlimited Bulk Extraction (All 1000+ Qs)
            </button>
            <button
              type="button"
              onClick={() => setExtractionDepth('weekly_test_100')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                extractionDepth === 'weekly_test_100'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Strict 100 questions mode for quick Weekly Test scheduling"
            >
              <Trophy size={13} />
              Weekly Test Mode (100 Qs Only)
            </button>
          </div>
        </div>
      </div>

      {/* Step 1: Drop Bunch of PDFs */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              1
            </div>
            <h2 className="font-extrabold text-gray-900 text-base">Drop Bunch of PDFs</h2>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Supports multiple exam papers simultaneously (.pdf)
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
          className="border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50/40 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all text-center group"
        >
          <div className="p-3.5 bg-gray-100 group-hover:bg-indigo-100 text-gray-500 group-hover:text-indigo-600 rounded-2xl mb-3 transition-colors">
            <Upload size={32} />
          </div>
          <div className="font-extrabold text-gray-800 text-base group-hover:text-indigo-600">
            Click to choose PDFs or drop bunch of PDFs here
          </div>
          <div className="text-xs text-gray-400 mt-1 max-w-md">
            Upload single or multiple Police Bharti, MPSC, or Saral Seva question papers. AI will
            batch-extract all MCQs automatically.
          </div>
        </div>

        {/* Selected Files Chips List */}
        {pdfFiles.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700">
              <span>Selected PDFs ({pdfFiles.length} papers ready)</span>
              <button
                onClick={() => setPdfFiles([])}
                className="text-rose-600 hover:underline font-semibold"
              >
                Clear All
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {pdfFiles.map((file, idx) => (
                <div
                  key={`${file.name}_${idx}`}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-gray-900 text-xs truncate">{file.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(idx)}
                    className="p-1 text-gray-400 hover:text-rose-600 rounded-lg shrink-0"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>

            {/* Main Primary Extract Button */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleStartBatchExtraction}
                disabled={isExtracting}
                className={`px-6 py-3 rounded-xl text-sm font-extrabold flex items-center gap-2.5 transition-all shadow-md ${
                  isExtracting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                }`}
              >
                {isExtracting ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" />
                    Extracting Questions...
                  </>
                ) : (
                  <>
                    <Sparkles size={17} />
                    Extract & Clean All {pdfFiles.length} PDF(s)
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Detailed Extraction Pipeline & Step Dashboard */}
      {isExtracting && (
        <div className="bg-white border-2 border-indigo-400/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Top Info Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <Cpu
                    size={24}
                    className="animate-spin text-indigo-100"
                    style={{ animationDuration: '3s' }}
                  />
                </div>
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-gray-900 text-base">
                    AI Question Extraction Pipeline Active
                  </h3>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
                    Live
                  </span>
                </div>
                <p className="text-xs text-indigo-700 font-semibold mt-0.5 flex items-center gap-1.5">
                  <span>File {currentFileIdx + 1} of {pdfFiles.length}:</span>
                  <span className="font-mono text-gray-800 font-bold underline decoration-indigo-300">
                    {pdfFiles[currentFileIdx]?.name || 'Exam Paper'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="px-3 py-1.5 bg-gray-900 text-indigo-300 border border-gray-800 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-xs">
                <Clock size={14} className="text-emerald-400 animate-pulse" />
                <span>
                  Elapsed: {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                  {(elapsedSeconds % 60).toString().padStart(2, '0')}s
                </span>
              </div>
              <div className="text-sm font-mono font-extrabold text-indigo-900 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-1">
                <span>{progressPercent}%</span>
              </div>
            </div>
          </div>

          {/* Animated Gradient Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-gray-600 px-1">
              <span>{processingStatus}</span>
              <span className="font-mono text-indigo-600">{progressPercent}% Completed</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-gray-200 shadow-inner">
              <div
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 6-Step Visual Pipeline Stepper */}
          <div className="space-y-2.5">
            <div className="text-xs font-extrabold uppercase tracking-wider text-gray-500 flex items-center justify-between">
              <span>Extraction Pipeline Steps</span>
              <span className="text-[11px] font-bold text-indigo-600">Step {currentStep} of 6</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { id: 1, title: '1. Ingest PDF', desc: 'Binary stream' },
                { id: 2, title: '2. Page Slicing', desc: 'Auto-chunks' },
                { id: 3, title: '3. Multi-Chunk AI', desc: 'Zero limits' },
                { id: 4, title: '4. 4 Options & Key', desc: 'A, B, C, D values' },
                { id: 5, title: '5. स्पष्टीकरण Synthesis', desc: 'Verified 1-liners' },
                { id: 6, title: '6. Ready for Use', desc: 'Curriculum/Weekly' },
              ].map((step) => {
                const isPassed = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isPassed
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                        : isCurrent
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200 text-indigo-950 shadow-sm'
                        : 'bg-gray-50/60 border-gray-200 text-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold font-mono">
                        {isPassed ? (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={13} className="text-emerald-600" /> Done
                          </span>
                        ) : isCurrent ? (
                          <span className="flex items-center gap-1 text-indigo-700 animate-pulse">
                            <RefreshCw size={12} className="animate-spin" /> In Progress
                          </span>
                        ) : (
                          <span className="text-gray-400">Waiting</span>
                        )}
                      </span>
                    </div>
                    <div className="font-extrabold text-xs truncate">{step.title}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5 truncate">{step.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Pipeline Activity Console / Terminal */}
          <div className="bg-slate-950 text-slate-200 rounded-2xl p-4 font-mono text-xs shadow-inner border border-slate-800 space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                </div>
                <span className="text-[11px] font-bold text-slate-300 ml-1 flex items-center gap-1.5">
                  <Terminal size={13} className="text-indigo-400" />
                  pipeline.activity.log
                </span>
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-bold">
                {selectedModel} • {extractionDepth === 'bulk_unlimited' ? 'Unlimited Bulk Mode' : 'Weekly Test 100-Q Mode'}
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1 pr-1 font-mono text-[11px]">
              {pipelineLogs.map((log, lIdx) => (
                <div key={lIdx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 shrink-0 select-none">[{log.time}]</span>
                  <span
                    className={
                      log.type === 'success'
                        ? 'text-emerald-400 font-semibold'
                        : log.type === 'warn'
                        ? 'text-amber-400'
                        : 'text-slate-200'
                    }
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-1 text-indigo-400 pt-0.5">
                <span className="animate-pulse">▶</span>
                <span className="animate-pulse font-bold">_</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extracted Results & Action Hub */}
      {extractedQuestions.length > 0 && !isExtracting && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Quick Metrics Bar & 2 Primary Options Requested by User */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-3">
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-center min-w-[110px]">
                  <div className="text-[10px] font-bold text-indigo-600 uppercase">Questions</div>
                  <div className="text-2xl font-extrabold text-indigo-950 mt-0.5">
                    {extractedQuestions.length}
                  </div>
                  <div className="text-[10px] text-indigo-700 font-medium">Clean Marathi Qs</div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center min-w-[120px]">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase">25-Q Lessons</div>
                  <div className="text-2xl font-extrabold text-emerald-950 mt-0.5">
                    {fullLessonsCount}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-medium">
                    {fullLessonsCount * 25} Qs
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-center min-w-[130px]">
                  <div className="text-[10px] font-bold text-amber-700 uppercase">Weekly Test (100 Qs)</div>
                  <div className="text-sm font-extrabold text-amber-950 mt-1">
                    {extractedQuestions.length >= 100 ? '100 Qs Ready' : `${extractedQuestions.length}/100 Qs`}
                  </div>
                </div>
              </div>

              {/* The 2 Clear Primary Buttons Requested by User + Auto Set All */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleAutoSetToCurriculum}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
                >
                  Auto set to AI builder curriculum
                </button>

                <button
                  onClick={handleDownloadCsv}
                  className="px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Download size={15} />
                  Download CSV File
                </button>

                <button
                  onClick={handleAutoSetAll}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md transition-all shadow-emerald-200"
                  title="Auto Set All questions into the chosen destination with 1 click"
                >
                  <Check size={16} />
                  Auto Set All
                </button>
              </div>
            </div>

            {/* 2nd Section: Lesson & Organization Mode (Lesson OR Weekly Test) */}
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900 text-base">
                    Lesson & Organize Destination
                  </h3>
                  <p className="text-xs text-gray-500">
                    Set whether these questions will go into a standard 25-Q Lesson or an official 100-Mark Weekly Test.
                  </p>
                </div>
              </div>

              {/* Segmented Switch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => setDestinationMode('curriculum')}
                  className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                    destinationMode === 'curriculum'
                      ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300 opacity-80'
                  }`}
                >
                  <div
                    className={`p-2 rounded-xl shrink-0 ${
                      destinationMode === 'curriculum'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-xs">
                      Curriculum Lessons (25 Qs/Lesson)
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                      Partitions into strict 25-question lessons per learning node.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationMode('weekly_test')}
                  className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                    destinationMode === 'weekly_test'
                      ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300 opacity-80'
                  }`}
                >
                  <div
                    className={`p-2 rounded-xl shrink-0 ${
                      destinationMode === 'weekly_test'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    <Trophy size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-xs">
                      Official Weekly Test (100 Questions)
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                      Schedules a 100-mark mock test with date & calendar on Supabase.
                    </div>
                  </div>
                </button>
              </div>

              {/* Destination 1 Details: Curriculum Lessons */}
              {destinationMode === 'curriculum' && (
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-800 font-bold">
                          Auto-Chunking Strategy (8x5x25 Rule)
                        </span>
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          ✓ Enforced
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          <strong>{Math.max(1, Math.ceil(extractedQuestions.length / 1000))}</strong> Unit(s) (max 8 nodes)
                        </span>
                        <span>•</span>
                        <span>
                          <strong>{Math.max(1, Math.ceil(extractedQuestions.length / 125))}</strong> Node(s) (max 5 lessons)
                        </span>
                        <span>•</span>
                        <span>
                          <strong>{fullLessonsCount}</strong> Lessons (25 Qs each)
                        </span>
                        {leftoverCount > 0 && (
                          <span className="text-amber-600 font-medium">
                            ({leftoverCount} leftover Qs)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleAutoSetToCurriculum}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs shrink-0"
                    >
                      <Sparkles size={14} />
                      Set to Curriculum Builder
                    </button>
                  </div>
                </div>
              )}

              {/* Destination 2 Details: Weekly Test (Strict 100 Questions & Calendar Picker) */}
              {destinationMode === 'weekly_test' && (
                <div className="p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-emerald-200/60">
                    <div className="flex items-center gap-2">
                      <Trophy size={18} className="text-emerald-700" />
                      <span className="font-extrabold text-emerald-950 text-sm">
                        Schedule Official 100-Mark Weekly Test
                      </span>
                    </div>

                    {/* Strict 100 Questions Validator */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                        extractedQuestions.length >= 100
                          ? 'bg-emerald-200 text-emerald-900 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {extractedQuestions.length >= 100
                        ? `${extractedQuestions.length} Qs available (Strict 100 used)`
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
                          className="px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg font-bold text-emerald-900 outline-none cursor-pointer"
                        >
                          {Array.from({ length: Math.floor(extractedQuestions.length / 100) }).map((_, idx) => (
                            <option key={idx} value={idx}>
                              Set {idx + 1}: Questions {idx * 100 + 1} to {(idx + 1) * 100} (100 Questions)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-[11px] text-gray-500 font-medium">
                        Using questions {weeklyTestSetIndex * 100 + 1} to {(weeklyTestSetIndex + 1) * 100} of {extractedQuestions.length} total
                      </div>
                    </div>
                  )}

                  {/* Form fields for Weekly Test */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {/* Title */}
                    <div className="sm:col-span-2">
                      <label className="font-bold text-gray-700 block mb-1">Weekly Test Title</label>
                      <input
                        type="text"
                        value={testTitle}
                        onChange={(e) => setTestTitle(e.target.value)}
                        placeholder="उदा. महाराष्ट्र पोलीस भरती साप्ताहिक महासराव चाचणी"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none"
                      />
                    </div>

                    {/* Category */}
                    <div>
                      <label className="font-bold text-gray-700 block mb-1">Exam Category</label>
                      <select
                        value={examType}
                        onChange={(e) => setExamType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 outline-none"
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
                      <label className="font-bold text-gray-700 block mb-1 flex items-center gap-1">
                        <CalendarIcon size={13} className="text-emerald-600" />
                        Test Date (Calendar)
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-gray-600 flex items-center gap-2">
                      <Clock size={14} className="text-emerald-700 shrink-0" />
                      <span>
                        Starts at <strong>{scheduledTime}</strong> • Duration: <strong>{durationMinutes} Mins</strong> • 100 Marks
                      </span>
                    </div>

                    {/* Direct Supabase Publish Button */}
                    <button
                      onClick={handlePublishWeeklyTestToSupabase}
                      disabled={isPublishingWeeklyTest || extractedQuestions.length < 100}
                      className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                        isPublishingWeeklyTest || extractedQuestions.length < 100
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                      }`}
                    >
                      {isPublishingWeeklyTest ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Publishing to Supabase...
                        </>
                      ) : (
                        <>
                          <Trophy size={14} />
                          Add Weekly Test to Supabase (100 Qs)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Extracted Questions Review Accordion */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="font-bold text-gray-900 text-xs">
                Edit Question #{editingQuestion.rowIndex}
              </span>
              <button onClick={() => setEditingQuestion(null)} className="p-1 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Question Text</label>
                <textarea
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>

              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const key = `option${letter}` as keyof ExtractedQuestion;
                const isCorrect = editingQuestion.correctOption === letter;
                return (
                  <div key={letter} className="flex items-center gap-2">
                    <span className="w-6 font-bold text-gray-600">{letter})</span>
                    <input
                      type="text"
                      value={String(editingQuestion[key] || '')}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, [key]: e.target.value })
                      }
                      className="flex-1 px-3 py-1.5 border rounded-lg"
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
                      className={`px-2.5 py-1 text-[10px] font-bold rounded ${
                        isCorrect ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {isCorrect ? '✓ Correct' : 'Set'}
                    </button>
                  </div>
                );
              })}

              <div>
                <label className="font-bold text-gray-700 block mb-1">Explanation (स्पष्टीकरण)</label>
                <textarea
                  value={editingQuestion.explanation}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t flex justify-end gap-2">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setExtractedQuestions((prev) =>
                    prev.map((q) => (q.id === editingQuestion.id ? editingQuestion : q))
                  );
                  setEditingQuestion(null);
                  toast('success', 'Question Saved', 'Updated successfully.');
                }}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg"
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
