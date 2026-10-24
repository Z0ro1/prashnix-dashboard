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
  HelpCircle,
  MapPin,
  Calendar,
  Eye,
  Sliders,
  Clock,
  Cpu,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import Papa from 'papaparse';
import { useFeedback } from '@/components/FeedbackDialog';

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

const EXTRACTION_STAGES = [
  {
    id: 1,
    label: 'Document Ingestion & Layout Analysis',
    detail: 'Reading binary stream, pages, and typography metadata',
  },
  {
    id: 2,
    label: 'Devanagari OCR & Conjunct Normalization',
    detail: 'Scanning Marathi text, conjuncts (जोडाक्षरे), and repairing broken ligatures',
  },
  {
    id: 3,
    label: 'MCQ & Options Pattern Segmentation',
    detail: 'Identifying question statements and isolating 4 distinct options (A-D)',
  },
  {
    id: 4,
    label: 'Official Answer Key Cross-Checking',
    detail: 'Verifying answer key & standard syllabus references for verified answers',
  },
  {
    id: 5,
    label: 'AI Marathi Explanation Synthesis',
    detail: 'Composing concise 1-2 sentence verified Marathi explanations (स्पष्टीकरण)',
  },
  {
    id: 6,
    label: 'Prashnix 25-Question Blueprint Packaging',
    detail: 'Formatting strictly into 25-question lessons ready for curriculum build',
  },
];

export default function PdfExtractorPage() {
  const router = useRouter();
  const { toast, alert: customAlert, confirm } = useFeedback();

  // Upload & Config State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [model, setModel] = useState<string>('gemini-3.5-flash');
  const [categorizeMode, setCategorizeMode] = useState<'exam_paper' | 'auto_syllabus' | 'manual'>('exam_paper');
  const [targetUnit, setTargetUnit] = useState<string>('पोलीस भरती PYQ प्रश्नपत्रिका');
  const [targetNode, setTargetNode] = useState<string>('पोलीस भरती सराव प्रश्नपत्रिका');
  const [districtTag, setDistrictTag] = useState<string>('');
  const [pyqYear, setPyqYear] = useState<string>('2024');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Execution & Real-time Progress State
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentStageIdx, setCurrentStageIdx] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [examMeta, setExamMeta] = useState<{ title?: string; year?: number; district?: string }>({});

  // Editing Modal State
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestion | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast('error', 'Invalid File Type', 'Please upload a PDF file.');
        return;
      }
      setPdfFile(file);

      // Auto-populate clean Exam Title from filename
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanName) {
        setTargetNode(cleanName);
      }

      // Auto-extract year if present
      const yearMatch = file.name.match(/20\d{2}/);
      if (yearMatch) {
        setPyqYear(yearMatch[0]);
      }

      // Auto-detect known Maharashtra districts from filename
      const knownDistricts = [
        'पुणे', 'मुंबई', 'ठाणे', 'नागपूर', 'नाशिक', 'औरंगाबाद', 'छत्रपती संभाजीनगर',
        'कोल्हापूर', 'सोलापूर', 'अमरावती', 'नांदेड', 'जळगाव', 'सातारा', 'रायगड',
        'सिंधुदुर्ग', 'रत्नागिरी', 'अहमदनगर', 'धुळे', 'नंदुरबार', 'सांगली', 'बीड',
        'जालना', 'उस्मानाबाद', 'धाराशिव', 'लातूर', 'परभणी', 'हिंगोली', 'बुलढाणा',
        'अकोला', 'वाशीम', 'यवतमाळ', 'वर्धा', 'भंडारा', 'गोंदिया', 'चंद्रपूर', 'गडचिरोली'
      ];
      for (const d of knownDistricts) {
        if (file.name.includes(d)) {
          setDistrictTag(d);
          break;
        }
      }
    }
  };

  // Run AI Extraction with live progress pipeline
  const handleStartExtraction = async () => {
    if (!pdfFile) {
      toast('warning', 'Missing PDF', 'Please upload a PDF exam paper first.');
      return;
    }

    setIsExtracting(true);
    setProgressPercent(10);
    setCurrentStageIdx(0);
    setElapsedSeconds(0);

    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);

      // Realistic progressive curve through the 6 stages
      setProgressPercent((prev) => {
        let next = prev;
        if (elapsed < 3) {
          next = Math.min(22, prev + 3);
          setCurrentStageIdx(0);
        } else if (elapsed < 7) {
          next = Math.min(44, prev + 2.5);
          setCurrentStageIdx(1);
        } else if (elapsed < 14) {
          next = Math.min(68, prev + 2);
          setCurrentStageIdx(2);
        } else if (elapsed < 22) {
          next = Math.min(84, prev + 1.2);
          setCurrentStageIdx(3);
        } else if (elapsed < 30) {
          next = Math.min(94, prev + 0.8);
          setCurrentStageIdx(4);
        } else {
          next = Math.min(98, prev + 0.2);
          setCurrentStageIdx(5);
        }
        return Math.round(next);
      });
    }, 400);

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('model', model);
      formData.append('categorizeMode', categorizeMode);
      formData.append('autoCategorize', String(categorizeMode === 'auto_syllabus'));
      formData.append('targetUnit', targetUnit);
      formData.append('targetNode', targetNode);
      if (districtTag) formData.append('district', districtTag);
      if (pyqYear) formData.append('pyqYear', pyqYear);

      const res = await fetch('/api/ai/extract-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract PDF');
      }

      clearInterval(timerInterval);
      setProgressPercent(100);
      setCurrentStageIdx(5);

      setExtractedQuestions(data.questions || []);
      setExamMeta({
        title: data.examTitle,
        year: data.detectedYear,
        district: data.detectedDistrict,
      });

      // Brief delay to showcase 100% completion before revealing studio
      await new Promise((r) => setTimeout(r, 600));

      toast(
        'success',
        'Extraction Complete!',
        `Successfully extracted ${data.questions?.length || 0} questions with clean Marathi text & one-liner explanations.`
      );
    } catch (err: unknown) {
      clearInterval(timerInterval);
      customAlert(
        'Extraction Failed',
        err instanceof Error ? err.message : 'Unknown error occurred while processing PDF.',
        'error'
      );
    } finally {
      clearInterval(timerInterval);
      setIsExtracting(false);
    }
  };

  // Delete single question
  const handleDeleteQuestion = (id: string) => {
    setExtractedQuestions((prev) => prev.filter((q) => q.id !== id));
    toast('info', 'Question Removed', 'Question was removed from the list.');
  };

  // Save Inline Edit
  const handleSaveEdit = () => {
    if (!editingQuestion) return;
    setExtractedQuestions((prev) =>
      prev.map((q) => (q.id === editingQuestion.id ? editingQuestion : q))
    );
    setEditingQuestion(null);
    toast('success', 'Question Updated', 'Changes saved successfully.');
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (extractedQuestions.length === 0) return;

    const csvData = extractedQuestions.map((q) => ({
      'Unit Title': q.unitTitle,
      'Theme Color': '#4f46e5',
      'Node Title': q.nodeTitle,
      'Node Type': 'learning',
      'Lesson Title': q.lessonTitle || 'Lesson 1',
      'Question Text': q.questionText,
      'Option A': q.optionA,
      'Option B': q.optionB,
      'Option C': q.optionC,
      'Option D': q.optionD,
      'Correct Option (A/B/C/D)': q.correctOption,
      Explanation: q.explanation,
      'PYQ Year': q.pyqYear || '',
      District: q.districtTag || '',
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = `prashnix_${(examMeta.title || 'extracted_questions').toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast('success', 'CSV Downloaded', `Saved ${extractedQuestions.length} questions to ${filename}`);
  };

  // Consolidate all extracted questions into 1 Exam Node (4x25 Lessons)
  const handleConsolidateAllToExam = () => {
    if (extractedQuestions.length === 0) return;
    const examName =
      examMeta.title?.trim() ||
      targetNode?.trim() ||
      pdfFile?.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') ||
      'पोलीस भरती संपूर्ण सराव प्रश्नपत्रिका';

    const examUnit =
      targetUnit && targetUnit !== 'सामान्य ज्ञान व चालू घडामोडी'
        ? targetUnit
        : 'पोलीस भरती PYQ प्रश्नपत्रिका';

    setExtractedQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        unitTitle: examUnit,
        nodeTitle: examName,
      }))
    );

    const fullLessons = Math.floor(extractedQuestions.length / 25);
    toast(
      'success',
      'Consolidated into 1 Exam Node!',
      `All ${extractedQuestions.length} questions merged into "${examName}" (forms ${fullLessons} complete 25-question lessons).`
    );
  };

  // Send directly to Curriculum Builder (Strict 25 Qs/Lesson Rule)
  const handleSendToCurriculumBuilder = () => {
    if (extractedQuestions.length === 0) return;

    confirm({
      title: 'Send to Curriculum Builder?',
      message: `This will transfer all ${extractedQuestions.length} questions directly to the Curriculum Staging Engine. They will automatically be partitioned into strict 25-question lessons per node, and any incomplete leftover lesson (< 25 Qs) will be aborted. Proceed?`,
      confirmText: 'Yes, Open Curriculum Builder',
      onConfirm: () => {
        // Map to StagedImportRow format
        const stagedRows = extractedQuestions.map((q, idx) => ({
          id: `staged_ai_${Date.now()}_${idx}`,
          rowIndex: idx + 1,
          unitTitle: q.unitTitle,
          unitColor: '#4f46e5',
          nodeTitle: q.nodeTitle,
          nodeType: 'learning',
          lessonTitle: q.lessonTitle || 'Lesson 1',
          questionText: q.questionText,
          options: [q.optionA, q.optionB, q.optionC, q.optionD].filter((o) => o !== ''),
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          pyqYear: q.pyqYear,
          districtTag: q.districtTag,
          isDuplicate: false,
          status: 'valid',
          editedText: q.questionText,
          editedOptions: [q.optionA, q.optionB, q.optionC, q.optionD],
          editedCorrectAnswer: q.correctAnswer,
          editedExplanation: q.explanation,
        }));

        sessionStorage.setItem('prashnix_pending_staged_import', JSON.stringify(stagedRows));
        sessionStorage.setItem(
          'prashnix_pending_exam_title',
          examMeta.title || targetNode || 'पोलीस भरती संपूर्ण सराव प्रश्नपत्रिका'
        );
        router.push('/dashboard/curriculum');
      },
    });
  };

  // Calculate 25-question breakdown preview
  const nodeGrouping = extractedQuestions.reduce((acc, q) => {
    const key = `${q.unitTitle}:::${q.nodeTitle}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let totalLessonsFormed = 0;
  let totalAbortedLeftover = 0;

  Object.values(nodeGrouping).forEach((count) => {
    const full = Math.floor(count / 25);
    totalLessonsFormed += full;
    totalAbortedLeftover += count % 25;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Sparkles size={22} />
            </span>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              AI PDF Question Extractor
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Gemini Flash
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1.5 leading-relaxed">
            Upload Marathi PDF exam papers to automatically extract MCQs, clean Devanagari text,
            generate 1-liner Marathi explanations, and auto-allocate into strict 25-question lessons.
          </p>
        </div>

        {/* Live Badges - No Key Button Needed */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Devanagari OCR Ready
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Sparkles size={13} />
            Strict 25 Qs/Lesson
          </span>
        </div>
      </div>

      {/* Real-time Multi-Stage Progress Monitor */}
      {isExtracting && (
        <div className="bg-white border-2 border-indigo-300 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-300">
          {/* Header with Live Status & Digital Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
                  <Cpu size={24} className="animate-pulse" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-gray-900 text-lg">
                    AI PDF Extraction & Analysis Pipeline
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 animate-pulse">
                    LIVE
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Analyzing <strong className="text-gray-800">{pdfFile?.name}</strong> ({(pdfFile ? (pdfFile.size / (1024 * 1024)).toFixed(2) : '0')} MB) with Devanagari OCR & Gemini AI
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <div className="px-3.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-700 flex items-center gap-1.5 shadow-2xs">
                <Clock size={13} className="text-indigo-600" />
                <span>Elapsed: {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:{(elapsedSeconds % 60).toString().padStart(2, '0')}s</span>
              </div>
              <div className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-extrabold shadow-sm min-w-[50px] text-center">
                {progressPercent}%
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-gray-500 pt-0.5">
              <span className="flex items-center gap-1.5 text-indigo-700 font-bold">
                <Loader2 size={13} className="animate-spin text-indigo-600 shrink-0" />
                {EXTRACTION_STAGES[currentStageIdx]?.label}
              </span>
              <span className="font-mono text-gray-400">Step {currentStageIdx + 1} of {EXTRACTION_STAGES.length}</span>
            </div>
          </div>

          {/* Real-time Operations Checklist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXTRACTION_STAGES.map((stg, i) => {
              const isCompleted = i < currentStageIdx || progressPercent === 100;
              const isActive = i === currentStageIdx && progressPercent < 100;

              return (
                <div
                  key={stg.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isCompleted
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-2xs'
                      : isActive
                      ? 'bg-indigo-50/90 border-indigo-300 ring-2 ring-indigo-500/20 shadow-sm'
                      : 'bg-gray-50/40 border-gray-200 text-gray-400 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : isActive ? (
                        <Loader2 size={16} className="animate-spin text-indigo-600" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center text-[9px] font-bold text-gray-400">
                          {stg.id}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-xs font-bold truncate ${
                          isCompleted
                            ? 'text-emerald-900'
                            : isActive
                            ? 'text-indigo-950 font-extrabold'
                            : 'text-gray-500'
                        }`}
                      >
                        {stg.label}
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 line-clamp-2 leading-relaxed ${
                          isCompleted
                            ? 'text-emerald-700'
                            : isActive
                            ? 'text-indigo-700 font-medium'
                            : 'text-gray-400'
                        }`}
                      >
                        {stg.detail}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 1 & 2 Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PDF File Dropzone */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="font-bold text-gray-900 text-base mb-1 flex items-center gap-2">
              <FileText size={18} className="text-indigo-600" />
              1. Upload Exam Paper PDF
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Select or drop a Police Bharti, MPSC, or Maharashtra competitive exam paper PDF.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,application/pdf"
              className="hidden"
            />

            {!pdfFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50/40 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all text-center group"
              >
                <div className="p-3 bg-gray-100 group-hover:bg-indigo-100 text-gray-500 group-hover:text-indigo-600 rounded-full mb-3 transition-colors">
                  <Upload size={28} />
                </div>
                <div className="font-bold text-gray-800 text-sm group-hover:text-indigo-600">
                  Click to choose PDF or drag and drop here
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Supports Police Bharti question papers, PYQ booklets, practice sets (.pdf)
                </div>
              </div>
            ) : (
              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3 truncate mr-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shrink-0">
                    <FileText size={22} />
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-gray-900 text-sm truncate">{pdfFile.name}</div>
                    <div className="text-xs text-indigo-700">
                      {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    Change File
                  </button>
                  <button
                    onClick={() => setPdfFile(null)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Remove file"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">
              Powered by Google Gemini Multimodal Devanagari OCR & Analysis
            </span>
            <button
              onClick={handleStartExtraction}
              disabled={!pdfFile || isExtracting}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${
                !pdfFile || isExtracting
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
              }`}
            >
              {isExtracting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Extracting Questions...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Extract & Structure Questions
                </>
              )}
            </button>
          </div>
        </div>

        {/* Step 2: Categorization & Organization Rules (Clean, Spacious UI) */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <div className="font-bold text-gray-900 text-base flex items-center gap-2">
                <Sliders size={18} className="text-indigo-600" />
                2. Lesson & Question Organization
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Choose how questions will be structured into your curriculum nodes.
              </p>
            </div>

            {/* Clean Segmented Tab Switcher */}
            <div className="grid grid-cols-3 p-1 bg-gray-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCategorizeMode('exam_paper')}
                className={`py-2 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                  categorizeMode === 'exam_paper'
                    ? 'bg-white text-indigo-900 shadow-xs font-bold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Target size={14} className={categorizeMode === 'exam_paper' ? 'text-indigo-600' : 'text-gray-400'} />
                Exam Paper
              </button>

              <button
                type="button"
                onClick={() => setCategorizeMode('auto_syllabus')}
                className={`py-2 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                  categorizeMode === 'auto_syllabus'
                    ? 'bg-white text-indigo-900 shadow-xs font-bold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Layers size={14} className={categorizeMode === 'auto_syllabus' ? 'text-indigo-600' : 'text-gray-400'} />
                By Subject
              </button>

              <button
                type="button"
                onClick={() => setCategorizeMode('manual')}
                className={`py-2 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                  categorizeMode === 'manual'
                    ? 'bg-white text-indigo-900 shadow-xs font-bold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sliders size={14} className={categorizeMode === 'manual' ? 'text-indigo-600' : 'text-gray-400'} />
                Custom
              </button>
            </div>

            {/* Mode 1: Exam Paper Mode (Default & Recommended) */}
            {categorizeMode === 'exam_paper' && (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                  <Sparkles size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Recommended for Exam Papers:</strong> 100 questions stay in 1 Exam Node, creating <strong>4 complete 25-question lessons</strong> with zero aborted questions.
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Exam Paper Title (Node Name)
                  </label>
                  <input
                    type="text"
                    value={targetNode}
                    onChange={(e) => setTargetNode(e.target.value)}
                    placeholder="उदा. SRPF गट २ पुणे पोलीस भरती पेपर २०२४"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <span className="text-[10px] text-gray-400 block mt-1">
                    Auto-populated from filename or PDF header.
                  </span>
                </div>
              </div>
            )}

            {/* Mode 2: By Subject */}
            {categorizeMode === 'auto_syllabus' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-start gap-2.5">
                  <Layers size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Subject Syllabus Split:</strong> Questions will automatically be classified into:
                    <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] font-semibold text-indigo-800">
                      <span>• मराठी व्याकरण</span>
                      <span>• सामान्य ज्ञान व घडामोडी</span>
                      <span>• राज्यशास्त्र व पोलीस प्रशासन</span>
                      <span>• अंकगणित व बुद्धिमत्ता</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mode 3: Custom Node */}
            {categorizeMode === 'manual' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Target Unit Title</label>
                  <input
                    type="text"
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value)}
                    placeholder="उदा. पोलीस भरती PYQ प्रश्नपत्रिका"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Target Node Title</label>
                  <input
                    type="text"
                    value={targetNode}
                    onChange={(e) => setTargetNode(e.target.value)}
                    placeholder="उदा. विशेष सराव संच"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Clean District & Year Metadata Card */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1 flex items-center gap-1.5">
                  <MapPin size={13} className="text-indigo-600" />
                  District Tag
                </label>
                <input
                  type="text"
                  value={districtTag}
                  onChange={(e) => setDistrictTag(e.target.value)}
                  placeholder="उदा. पुणे, मुंबई"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1 flex items-center gap-1.5">
                  <Calendar size={13} className="text-indigo-600" />
                  PYQ Year
                </label>
                <input
                  type="number"
                  value={pyqYear}
                  onChange={(e) => setPyqYear(e.target.value)}
                  placeholder="2024"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Advanced Settings Accordion */}
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-gray-500 hover:text-indigo-600 font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Sliders size={13} />
                <span>{showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings (AI Model)'}</span>
                {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-3 animate-in fade-in duration-200">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1 flex items-center gap-1">
                      <Cpu size={13} className="text-indigo-600" />
                      AI Model Engine
                    </label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 outline-none"
                    >
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash (Flagship, High Accuracy)</option>
                      <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (Ultra Fast)</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (Lightweight)</option>
                    </select>
                  </div>
                  {categorizeMode === 'exam_paper' && (
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">Unit Title Override</label>
                      <input
                        type="text"
                        value={targetUnit}
                        onChange={(e) => setTargetUnit(e.target.value)}
                        placeholder="पोलीस भरती PYQ प्रश्नपत्रिका"
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Guarantee */}
          <div className="text-[11px] text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-200 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>Guaranteed strict 25 questions per lesson rule applied automatically.</span>
          </div>
        </div>
      </div>

      {/* Extracted Questions Review Studio */}
      {extractedQuestions.length > 0 && !isExtracting && (
        <div className="space-y-4">
          {/* Action & Metric Bar */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-center min-w-[100px]">
                <div className="text-[10px] font-bold text-indigo-600 uppercase">Questions</div>
                <div className="text-xl font-extrabold text-indigo-950 mt-0.5">
                  {extractedQuestions.length}
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center min-w-[120px]">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">25-Q Lessons</div>
                <div className="text-xl font-extrabold text-emerald-950 mt-0.5">
                  {totalLessonsFormed} Lessons
                </div>
                <div className="text-[10px] font-medium text-emerald-700">
                  {totalLessonsFormed * 25} Questions
                </div>
              </div>
              {totalAbortedLeftover > 0 && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-center min-w-[120px]">
                  <div className="text-[10px] font-bold text-rose-600 uppercase">Leftover Aborted</div>
                  <div className="text-xl font-extrabold text-rose-950 mt-0.5">
                    {totalAbortedLeftover} Qs
                  </div>
                  <div className="text-[10px] font-medium text-rose-600">
                    &lt; 25 Qs/lesson rule
                  </div>
                </div>
              )}
              {examMeta.title && (
                <div className="text-xs text-gray-500 max-w-xs pl-2">
                  <div className="font-bold text-gray-800 truncate">{examMeta.title}</div>
                  <div>
                    {examMeta.district && <span>{examMeta.district} • </span>}
                    {examMeta.year && <span>{examMeta.year}</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleConsolidateAllToExam}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                title="Consolidates all questions into 1 Exam Node to form 4 lessons of 25 questions each"
              >
                <Sparkles size={14} className="text-indigo-600" />
                Format as 1 Exam Node (4x25 Qs)
              </button>

              <button
                onClick={handleExportCsv}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Download size={15} />
                Download Clean CSV
              </button>

              <button
                onClick={handleSendToCurriculumBuilder}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
              >
                <Sparkles size={16} />
                Send to Curriculum Builder (25 Qs/Lesson)
                <ArrowRight size={15} />
              </button>
            </div>
          </div>

          {/* Questions Grid / Table */}
          <div className="space-y-3">
            {extractedQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="bg-white border border-gray-200 hover:border-indigo-300 rounded-2xl p-4 transition-all shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100/60">
                      {q.unitTitle} &gt; {q.nodeTitle}
                    </span>
                    {q.districtTag && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                        {q.districtTag}
                      </span>
                    )}
                    {q.pyqYear && (
                      <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                        {q.pyqYear}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingQuestion({ ...q })}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit Question"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Question"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Question Text */}
                <div className="font-bold text-gray-900 text-sm leading-relaxed">
                  {q.questionText}
                </div>

                {/* 4 Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { letter: 'A', text: q.optionA },
                    { letter: 'B', text: q.optionB },
                    { letter: 'C', text: q.optionC },
                    { letter: 'D', text: q.optionD },
                  ].map((opt) => {
                    const isCorrect = q.correctOption === opt.letter;
                    return (
                      <div
                        key={opt.letter}
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          isCorrect
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold'
                            : 'bg-gray-50 border-gray-200 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isCorrect ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {opt.letter}
                          </span>
                          <span>{opt.text}</span>
                        </div>
                        {isCorrect && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                            Correct
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* One-Liner Marathi Explanation */}
                {q.explanation && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed flex items-start gap-2">
                    <span className="font-bold text-amber-700 shrink-0">स्पष्टीकरण:</span>
                    <span>{q.explanation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom Action Footer */}
          <div className="p-5 bg-white border border-gray-200 rounded-2xl flex items-center justify-between shadow-xs">
            <span className="text-xs text-gray-500 font-medium">
              Review completed? You can transfer all questions into the Curriculum Builder with 1 click.
            </span>
            <button
              onClick={handleSendToCurriculumBuilder}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
            >
              <Sparkles size={16} />
              Send to Curriculum Builder (25 Qs/Lesson)
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Edit size={16} className="text-indigo-600" />
                Edit Question #{editingQuestion.rowIndex}
              </div>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Question Text (Marathi)</label>
                <textarea
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-medium text-gray-900"
                />
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                  const key = `option${letter}` as keyof ExtractedQuestion;
                  const isCorrect = editingQuestion.correctOption === letter;
                  return (
                    <div key={letter}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-gray-700">Option {letter}</label>
                        <button
                          type="button"
                          onClick={() => {
                            const optText = String(editingQuestion[key] || '');
                            setEditingQuestion({
                              ...editingQuestion,
                              correctOption: letter,
                              correctAnswer: optText,
                            });
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {isCorrect ? '✓ Correct Answer' : 'Set as Correct'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={String(editingQuestion[key] || '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingQuestion({
                            ...editingQuestion,
                            [key]: val,
                            ...(isCorrect ? { correctAnswer: val } : {}),
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Explanation */}
              <div>
                <label className="font-bold text-gray-700 block mb-1">One-Liner Explanation (स्पष्टीकरण)</label>
                <textarea
                  value={editingQuestion.explanation}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-medium text-gray-900"
                />
              </div>

              {/* Hierarchy */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Unit Title</label>
                  <input
                    type="text"
                    value={editingQuestion.unitTitle}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, unitTitle: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Node Title</label>
                  <input
                    type="text"
                    value={editingQuestion.nodeTitle}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, nodeTitle: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
