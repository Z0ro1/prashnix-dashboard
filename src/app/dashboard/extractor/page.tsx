'use client';

import { useState, useEffect, useRef } from 'react';
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
  Key,
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

export default function PdfExtractorPage() {
  const router = useRouter();
  const { toast, alert: customAlert, confirm } = useFeedback();

  // Gemini API Key management
  const [apiKey, setApiKey] = useState<string>('');
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>('');

  // Upload & Config State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [model, setModel] = useState<string>('gemini-3.5-flash');
  const [autoCategorize, setAutoCategorize] = useState<boolean>(true);
  const [targetUnit, setTargetUnit] = useState<string>('सामान्य ज्ञान व चालू घडामोडी');
  const [targetNode, setTargetNode] = useState<string>('सर्वसाधारण सराव चाचणी');
  const [districtTag, setDistrictTag] = useState<string>('');
  const [pyqYear, setPyqYear] = useState<string>('2024');

  // Execution State
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractStep, setExtractStep] = useState<string>('');
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [examMeta, setExamMeta] = useState<{ title?: string; year?: number; district?: string }>({});

  // Editing Modal State
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestion | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API key from localStorage or env on mount
  useEffect(() => {
    const savedKey =
      localStorage.getItem('prashnix_gemini_api_key') ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';
    if (savedKey) {
      setApiKey(savedKey);
      setTempApiKey(savedKey);
    }
  }, []);

  const handleSaveApiKey = () => {
    const clean = tempApiKey.trim();
    if (!clean) {
      localStorage.removeItem('prashnix_gemini_api_key');
      setApiKey('');
      toast('info', 'API Key Removed', 'Gemini API key was cleared.');
    } else {
      localStorage.setItem('prashnix_gemini_api_key', clean);
      setApiKey(clean);
      toast('success', 'API Key Saved', 'Gemini API key has been stored locally.');
    }
    setShowKeyModal(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast('error', 'Invalid File Type', 'Please upload a PDF file.');
        return;
      }
      setPdfFile(file);
      // Auto-extract year or district from filename if present
      const name = file.name;
      const yearMatch = name.match(/20\d{2}/);
      if (yearMatch && !pyqYear) {
        setPyqYear(yearMatch[0]);
      }
    }
  };

  // Run AI Extraction
  const handleStartExtraction = async () => {
    if (!pdfFile) {
      toast('warning', 'Missing PDF', 'Please upload a PDF exam paper first.');
      return;
    }
    if (!apiKey) {
      setShowKeyModal(true);
      toast('warning', 'API Key Needed', 'Please enter your Gemini API key to start extraction.');
      return;
    }

    setIsExtracting(true);
    setExtractStep('Uploading PDF to Gemini AI...');

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('apiKey', apiKey);
      formData.append('model', model);
      formData.append('autoCategorize', String(autoCategorize));
      formData.append('targetUnit', targetUnit);
      formData.append('targetNode', targetNode);
      if (districtTag) formData.append('district', districtTag);
      if (pyqYear) formData.append('pyqYear', pyqYear);

      setExtractStep('Analyzing PDF structure, Devanagari text, and MCQs...');

      const res = await fetch('/api/ai/extract-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract PDF');
      }

      setExtractStep('Formatting questions and generating Marathi explanations...');
      setExtractedQuestions(data.questions || []);
      setExamMeta({
        title: data.examTitle,
        year: data.detectedYear,
        district: data.detectedDistrict,
      });

      toast(
        'success',
        'Extraction Complete!',
        `Successfully extracted ${data.questions?.length || 0} questions with clean Marathi text & one-liner explanations.`
      );
    } catch (err: unknown) {
      customAlert(
        'Extraction Failed',
        err instanceof Error ? err.message : 'Unknown error occurred while processing PDF.',
        'error'
      );
    } finally {
      setIsExtracting(false);
      setExtractStep('');
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

        <button
          onClick={() => {
            setTempApiKey(apiKey);
            setShowKeyModal(true);
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
            apiKey
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 animate-pulse'
          }`}
        >
          <Key size={15} />
          {apiKey ? 'Gemini Key Configured' : 'Configure Gemini API Key'}
        </button>
      </div>

      {/* Step 1: Upload & Configuration Card */}
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

        {/* Configuration Options */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="font-bold text-gray-900 text-base mb-1 flex items-center gap-2">
              <Sliders size={18} className="text-indigo-600" />
              2. Categorization Rules
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Configure how questions are categorized into Units & Nodes.
            </p>

            <div className="space-y-4 text-xs">
              {/* Allocation Strategy */}
              <div>
                <label className="font-bold text-gray-700 block mb-1.5">Categorization Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoCategorize(true)}
                    className={`p-2.5 rounded-xl border text-left font-semibold transition-all ${
                      autoCategorize
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 ring-1 ring-indigo-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-600" />
                      Auto-Syllabus
                    </div>
                    <div className="text-[10px] text-gray-500 font-normal mt-0.5">
                      Classifies into Grammar, GK, Polity, etc.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAutoCategorize(false)}
                    className={`p-2.5 rounded-xl border text-left font-semibold transition-all ${
                      !autoCategorize
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 ring-1 ring-indigo-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Target size={14} className="text-indigo-600" />
                      Manual Target
                    </div>
                    <div className="text-[10px] text-gray-500 font-normal mt-0.5">
                      All questions go to one specific Unit/Node.
                    </div>
                  </button>
                </div>
              </div>

              {/* Manual Fields if active */}
              {!autoCategorize && (
                <div className="space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <label className="font-medium text-gray-600 block mb-1">Target Unit Title</label>
                    <input
                      type="text"
                      value={targetUnit}
                      onChange={(e) => setTargetUnit(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800"
                      placeholder="उदा. महाराष्ट्र भूगोल व पर्यावरण"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-gray-600 block mb-1">Target Node Title</label>
                    <input
                      type="text"
                      value={targetNode}
                      onChange={(e) => setTargetNode(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800"
                      placeholder="उदा. नद्या व धरणे विशेष सराव"
                    />
                  </div>
                </div>
              )}

              {/* District & Year Tags */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1 flex items-center gap-1">
                    <MapPin size={12} className="text-indigo-500" />
                    District Tag
                  </label>
                  <input
                    type="text"
                    value={districtTag}
                    onChange={(e) => setDistrictTag(e.target.value)}
                    placeholder="उदा. पुणे, ठाणे, मुंबई"
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1 flex items-center gap-1">
                    <Calendar size={12} className="text-indigo-500" />
                    PYQ Year
                  </label>
                  <input
                    type="number"
                    value={pyqYear}
                    onChange={(e) => setPyqYear(e.target.value)}
                    placeholder="2024"
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Model Choice */}
              <div>
                <label className="font-semibold text-gray-700 block mb-1">AI Model Engine</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-medium text-gray-700"
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Flagship, High Accuracy)</option>
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (Ultra Fast)</option>
                  <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (Lightweight)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
            <span>Strict 25 questions per lesson rule will apply automatically during curriculum build.</span>
          </div>
        </div>
      </div>

      {/* Progress Banner while extracting */}
      {isExtracting && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw size={28} className="animate-spin text-indigo-600" />
          <div className="font-bold text-gray-900 text-base">{extractStep}</div>
          <div className="text-xs text-indigo-700 max-w-md">
            Gemini Flash is parsing the PDF layout, cleaning Devanagari ligatures, extracting
            options, and composing Marathi one-line explanations...
          </div>
        </div>
      )}

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

      {/* Gemini API Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Key size={16} className="text-indigo-600" />
                Configure Google Gemini API Key
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-gray-600 leading-relaxed">
                Enter your free Google Gemini API key to extract questions from PDFs. The key will be
                stored securely in your browser's local storage.
              </p>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Gemini API Key</label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-xs"
                />
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 leading-relaxed">
                <strong>Need a free API key?</strong>
                <div className="mt-1">
                  You can generate a 100% free API key from{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-indigo-600 font-bold"
                  >
                    Google AI Studio
                  </a>{' '}
                  in 30 seconds.
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
