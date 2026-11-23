import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 minutes for extraction

interface ExtractedRawQuestion {
  questionNumber?: number;
  unitTitle?: string;
  nodeTitle?: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  correctAnswerText?: string;
  explanation: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const userApiKey = (formData.get('apiKey') as string | null)?.trim();
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Gemini API key is required. Please enter your Gemini API key in the UI settings or configure GEMINI_API_KEY in .env.local',
        },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'Please upload a PDF file.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();

    // Enforce 25MB maximum file upload limit to prevent memory exhaustion / DoS
    if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit of 25MB.' },
        { status: 413 }
      );
    }

    let pdfDoc: PDFDocument | null = null;
    let totalPages = 1;
    try {
      pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();
    } catch (e: any) {
      console.warn('Could not parse PDF pages via pdf-lib:', e?.message);
    }

    const action = formData.get('action') as string | null;
    if (action === 'get_info') {
      return NextResponse.json({
        success: true,
        totalPages,
        fileSize: arrayBuffer.byteLength,
        fileName: file.name,
      });
    }

    const requestedModel = (formData.get('model') as string) || 'gemini-3-flash-preview';
    const categorizeMode =
      (formData.get('categorizeMode') as 'exam_paper' | 'auto_syllabus' | 'manual') ||
      (formData.get('autoCategorize') === 'false' ? 'manual' : 'exam_paper');
    const targetUnit = (formData.get('targetUnit') as string)?.trim() || 'पोलीस भरती PYQ प्रश्नपत्रिका';
    const targetNode = (formData.get('targetNode') as string)?.trim() || 'पोलीस भरती संपूर्ण सराव प्रश्नपत्रिका';
    const districtTag = (formData.get('district') as string)?.trim() || null;
    const pyqYear = formData.get('pyqYear') ? parseInt(formData.get('pyqYear') as string, 10) : null;

    const extractionDepth = (formData.get('extractionDepth') as string) || 'bulk_unlimited';
    const startPageStr = formData.get('startPage') as string | null;
    const endPageStr = formData.get('endPage') as string | null;

    let base64Data = '';
    let isChunk = false;
    let chunkLabel = '';

    if (startPageStr && endPageStr && pdfDoc) {
      isChunk = true;
      const sPage = Math.max(1, parseInt(startPageStr, 10));
      const ePage = Math.min(totalPages, parseInt(endPageStr, 10));
      chunkLabel = `Pages ${sPage} to ${ePage} of ${totalPages}`;

      const chunkDoc = await PDFDocument.create();
      const pageIndices: number[] = [];
      for (let p = sPage - 1; p < ePage; p++) {
        pageIndices.push(p);
      }
      const copied = await chunkDoc.copyPages(pdfDoc, pageIndices);
      copied.forEach((p) => chunkDoc.addPage(p));
      const chunkBytes = await chunkDoc.save();
      base64Data = Buffer.from(chunkBytes).toString('base64');
    } else {
      base64Data = Buffer.from(arrayBuffer).toString('base64');
    }

    const baseSyllabusGuide =
      categorizeMode === 'exam_paper'
        ? `Assign every question to Unit: "${targetUnit || 'पोलीस भरती PYQ प्रश्नपत्रिका'}" and Node: the detected Exam Paper Name (e.g. "${targetNode}").`
        : categorizeMode === 'auto_syllabus'
        ? `Categorize each question into standard Maharashtra Police Bharti syllabus Units and Nodes:
    - Unit 'मराठी व्याकरण' -> Nodes: 'वर्णमाला व संधी', 'नाम, सर्वनाम व विशेषण', 'काळ व प्रयोग', 'समास व अलंकार', 'शब्दसंग्रह व म्हणी'
    - Unit 'सामान्य ज्ञान व चालू घडामोडी' -> Nodes: 'इतिहास व समाजसुधारक', 'महाराष्ट्र भूगोल व जिल्हे', 'सामान्य विज्ञान', 'चालू घडामोडी'
    - Unit 'राज्यशास्त्र व पोलीस प्रशासन' -> Nodes: 'भारतीय संविधान व हक्क', 'पोलीस प्रशासन व कायदे', 'पंचायत राज व स्थानिक स्वराज्य'
    - Unit 'अंकगणित व बुद्धिमत्ता चाचणी' -> Nodes: 'अंकगणित मूलभूत संकल्पना', 'शेकडेवारी व नफा-तोटा', 'काळ, काम व वेग', 'संख्यामाला व नातेसंबंध'`
        : `Assign every question to Unit: "${targetUnit}" and Node: "${targetNode}".`;

    // JSON schema for strict structured output
    const responseSchema = {
      type: 'OBJECT',
      properties: {
        examTitle: { type: 'STRING' },
        detectedYear: { type: 'INTEGER' },
        detectedDistrict: { type: 'STRING' },
        totalDetected: { type: 'INTEGER' },
        questions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              questionNumber: { type: 'INTEGER' },
              unitTitle: { type: 'STRING' },
              nodeTitle: { type: 'STRING' },
              questionText: { type: 'STRING' },
              optionA: { type: 'STRING' },
              optionB: { type: 'STRING' },
              optionC: { type: 'STRING' },
              optionD: { type: 'STRING' },
              correctOption: { type: 'STRING' },
              explanation: { type: 'STRING' },
            },
            required: ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption', 'explanation'],
          },
        },
      },
      required: ['questions'],
    };

    // Candidate models to try in priority order
    const candidateModels = Array.from(
      new Set([
        requestedModel,
        'gemini-3-flash-preview',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
      ])
    );

    // Resilient JSON Parser & Auto-Repair
    const parseAiJson = (text: string): any => {
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      // 1. Direct parse attempt
      try {
        return JSON.parse(cleaned);
      } catch {}

      // 2. Substring extraction between first { or [ and last } or ]
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');
      let startIdx = -1;
      let isArray = false;

      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        isArray = false;
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        isArray = true;
      }

      if (startIdx !== -1) {
        const lastClose = isArray ? cleaned.lastIndexOf(']') : cleaned.lastIndexOf('}');
        if (lastClose > startIdx) {
          const candidate = cleaned.substring(startIdx, lastClose + 1);
          try {
            return JSON.parse(candidate);
          } catch {}
        }

        // 3. Truncation repair: If the generation was cut off mid-stream,
        // backtrack to the last completed '}' and close the array/object
        const sub = cleaned.substring(startIdx);
        let searchPos = sub.length;
        while (searchPos > 0) {
          const lastObjEnd = sub.lastIndexOf('}', searchPos - 1);
          if (lastObjEnd === -1) break;

          const closingSuffix = isArray ? ']' : ']}';
          const testStr = sub.substring(0, lastObjEnd + 1) + closingSuffix;
          try {
            const recovered = JSON.parse(testStr);
            console.log(`[Auto-Repair] Successfully recovered truncated JSON at offset ${lastObjEnd}`);
            return recovered;
          } catch {
            searchPos = lastObjEnd;
          }
        }
      }

      throw new Error('Unable to parse valid JSON from AI output even after extraction and repair attempts.');
    };

    // Flexible extraction of questions array regardless of model naming quirks
    const locateQuestionsList = (payload: any): any[] => {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;

      const candidateKeys = [
        'questions',
        'Questions',
        'mcqs',
        'MCQs',
        'data',
        'items',
        'results',
        'questionList',
        'question_list',
        'examQuestions',
      ];

      for (const k of candidateKeys) {
        if (Array.isArray(payload[k])) return payload[k];
      }

      if (Array.isArray(payload.examPaper?.questions)) return payload.examPaper.questions;
      if (Array.isArray(payload.exam?.questions)) return payload.exam.questions;

      // Check all properties for an array of question-like objects
      for (const key of Object.keys(payload)) {
        const val = payload[key];
        if (Array.isArray(val) && val.length > 0) {
          const first = val[0];
          if (first && typeof first === 'object' && (first.questionText || first.question || first.text || first.optionA || first.options)) {
            return val;
          }
        }
      }

      // If questions were returned as an indexed object: { "1": {...}, "2": {...} }
      if (payload.questions && typeof payload.questions === 'object') {
        const list = Object.values(payload.questions);
        if (list.length > 0 && typeof list[0] === 'object') {
          return list as any[];
        }
      }

      return [];
    };

    // Helper to call Gemini REST API
    const callGeminiWithPrompt = async (promptText: string, modelName: string, useSchema: boolean = true) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const generationConfig: any = {
        response_mime_type: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 65536,
      };
      if (useSchema) {
        generationConfig.response_schema = responseSchema;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: base64Data,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          generationConfig,
        }),
      });
      return res;
    };

    // Execute request with automatic model fallback
    const executeGeminiRequest = async (promptText: string): Promise<string> => {
      let lastErr = '';
      for (const modelToTry of candidateModels) {
        try {
          let res = await callGeminiWithPrompt(promptText, modelToTry, true);
          if (res.ok) {
            const json = await res.json();
            const parts = json?.candidates?.[0]?.content?.parts || [];
            return parts.map((p: any) => p.text || '').join('').trim();
          } else if (res.status === 400) {
            res = await callGeminiWithPrompt(promptText, modelToTry, false);
            if (res.ok) {
              const json = await res.json();
              const parts = json?.candidates?.[0]?.content?.parts || [];
              return parts.map((p: any) => p.text || '').join('').trim();
            }
          }

          const errText = await res.text();
          let parsedErr: any = null;
          try {
            parsedErr = JSON.parse(errText);
          } catch {}
          lastErr = parsedErr?.error?.message || errText;
          console.warn(`Model ${modelToTry} returned ${res.status}: ${lastErr}. Retrying next candidate...`);
        } catch (e: any) {
          lastErr = e?.message || 'Network error';
        }
      }
      throw new Error(lastErr || 'All candidate Gemini models failed to process the request.');
    };

    let questionsList: any[] = [];
    let parsedPayload: any = {};

    if (isChunk || extractionDepth === 'bulk_unlimited') {
      console.log(`[Extract API] Extracting chunk/bulk questions (${chunkLabel || 'full'}) using ${requestedModel}...`);

      const chunkPrompt = `You are an expert Marathi exam paper analyst and high-precision question extraction engine.
${chunkLabel ? `DOCUMENT SLICE: ${chunkLabel}.` : 'This document contains an exam paper or question bank.'}
TASK: Extract ALL Multiple Choice Questions (MCQs) present in this document from start to finish.

CRITICAL MANDATES:
1. EXTRACT 100% OF QUESTIONS: Extract EVERY SINGLE question found in this document. Do NOT sample, do NOT stop early, and do NOT summarize or skip questions.
2. PRESERVE QUESTION NUMBERS: If questions are numbered in the document (e.g. 1, 2, ... 45, 101, 102), keep "questionNumber" matching that exact number.
3. CLEAN MARATHI DEVANAGARI: Keep clean Marathi text. Strip OCR noise, page headers, footers, watermarks, and option prefix labels like "(A)", "A)", "(1)", "1)", "१)", "A." from the option text.
4. 4 DISTINCT OPTIONS: Provide 4 clean options (optionA, optionB, optionC, optionD).
5. EXACT CORRECT OPTION: Set "correctOption" strictly to 'A', 'B', 'C', or 'D'.
6. MARATHI EXPLANATION: Write a clear 1-2 line Marathi explanation ('स्पष्टीकरण') explaining why the answer is correct.
7. ${baseSyllabusGuide}

Return a valid JSON object matching this schema:
{
  "examTitle": "Title of the exam paper",
  "detectedYear": 2024,
  "detectedDistrict": "District name if detected",
  "questions": [
    {
      "questionNumber": 1,
      "unitTitle": "Unit",
      "nodeTitle": "Node",
      "questionText": "Question text in Marathi",
      "optionA": "Option A",
      "optionB": "Option B",
      "optionC": "Option C",
      "optionD": "Option D",
      "correctOption": "A",
      "explanation": "स्पष्टीकरण"
    }
  ]
}`;

      const raw = await executeGeminiRequest(chunkPrompt);
      parsedPayload = parseAiJson(raw);
      questionsList = locateQuestionsList(parsedPayload);
      console.log(`[Extract API] ${chunkLabel || 'Bulk'} yielded ${questionsList.length} questions.`);
    } else if (extractionDepth === 'smart_100' || extractionDepth === 'weekly_test_100') {
      // 100-Question Smart Dual-Batch Execution (Only when explicitly running 100-Q Weekly Test)
      console.log('Running Smart Dual-Batch Extraction for 100 questions...');

      const promptBatch1 = `You are an expert Marathi exam paper analyst.
Extract Multiple Choice Questions strictly in the range: Questions 1 to 50 from this PDF exam paper.
CRITICAL MANDATES:
1. Extract ALL questions numbered 1 to 50 completely. Do NOT sample or summarize.
2. Clean Devanagari text, remove OCR noise and numbering prefixes from options.
3. 4 distinct options (Option A, Option B, Option C, Option D).
4. Correct option (strictly 'A', 'B', 'C', or 'D').
5. 1-2 line Marathi explanation ('स्पष्टीकरण').
6. ${baseSyllabusGuide}

Return a valid JSON object matching this schema:
{
  "examTitle": "Title detected from exam paper",
  "detectedYear": 2024,
  "detectedDistrict": "District name if detected",
  "questions": [
    {
      "questionNumber": 1,
      "unitTitle": "Unit",
      "nodeTitle": "Node",
      "questionText": "Question",
      "optionA": "Opt A",
      "optionB": "Opt B",
      "optionC": "Opt C",
      "optionD": "Opt D",
      "correctOption": "A",
      "explanation": "स्पष्टीकरण"
    }
  ]
}`;

      const promptBatch2 = `You are an expert Marathi exam paper analyst.
Extract Multiple Choice Questions strictly in the range: Questions 51 to 100 (and any questions to the end of the document) from this PDF exam paper.
CRITICAL MANDATES:
1. Extract ALL questions numbered 51 to 100 completely. Do NOT stop early.
2. Clean Devanagari text, remove OCR noise and numbering prefixes from options.
3. 4 distinct options (Option A, Option B, Option C, Option D).
4. Correct option (strictly 'A', 'B', 'C', or 'D').
5. 1-2 line Marathi explanation ('स्पष्टीकरण').
6. ${baseSyllabusGuide}

Return a valid JSON object matching this schema:
{
  "examTitle": "Title detected from exam paper",
  "detectedYear": 2024,
  "detectedDistrict": "District name if detected",
  "questions": [
    {
      "questionNumber": 51,
      "unitTitle": "Unit",
      "nodeTitle": "Node",
      "questionText": "Question",
      "optionA": "Opt A",
      "optionB": "Opt B",
      "optionC": "Opt C",
      "optionD": "Opt D",
      "correctOption": "A",
      "explanation": "स्पष्टीकरण"
    }
  ]
}`;

      try {
        const [rawText1, rawText2] = await Promise.all([
          executeGeminiRequest(promptBatch1),
          executeGeminiRequest(promptBatch2),
        ]);

        const parsed1 = parseAiJson(rawText1);
        const parsed2 = parseAiJson(rawText2);

        const list1 = locateQuestionsList(parsed1);
        const list2 = locateQuestionsList(parsed2);

        console.log(`Dual-batch results: Batch 1 yielded ${list1.length} Qs, Batch 2 yielded ${list2.length} Qs.`);

        parsedPayload = {
          examTitle: parsed1.examTitle || parsed2.examTitle,
          detectedYear: parsed1.detectedYear || parsed2.detectedYear,
          detectedDistrict: parsed1.detectedDistrict || parsed2.detectedDistrict,
        };

        // Combine and deduplicate
        const seen = new Set<string>();
        const combined = [...list1, ...list2];
        for (const q of combined) {
          const textKey = (q.questionText || q.question || '').trim();
          const numKey = q.questionNumber;
          const key = numKey ? `q_num_${numKey}` : textKey;
          if (key && !seen.has(key)) {
            seen.add(key);
            questionsList.push(q);
          }
        }

        // Sort ascending by questionNumber
        questionsList.sort((a, b) => {
          const numA = typeof a.questionNumber === 'number' ? a.questionNumber : 0;
          const numB = typeof b.questionNumber === 'number' ? b.questionNumber : 0;
          return numA - numB;
        });
      } catch (dualErr: any) {
        console.warn('Dual-batch extraction encountered error, attempting fallback:', dualErr?.message);
        const singlePrompt = `You are an expert Marathi exam paper analyst.
Extract ALL Multiple Choice Questions from this PDF document without summarizing.
Clean Marathi text, 4 options, correct answer, and Marathi explanation.
${baseSyllabusGuide}`;
        const rawSingle = await executeGeminiRequest(singlePrompt);
        parsedPayload = parseAiJson(rawSingle);
        questionsList = locateQuestionsList(parsedPayload);
      }
    } else {
      // Single pass extraction for small documents (< 30 Qs)
      const singlePrompt = `You are an expert Marathi exam paper analyst.
Extract ALL Multiple Choice Questions from this PDF document.
Clean Devanagari text, 4 options, correct option (A/B/C/D), and Marathi explanation.
${baseSyllabusGuide}`;
      const rawSingle = await executeGeminiRequest(singlePrompt);
      parsedPayload = parseAiJson(rawSingle);
      questionsList = locateQuestionsList(parsedPayload);
    }

    if (!questionsList || questionsList.length === 0) {
      console.error('No questions array found. Parsed payload keys:', Object.keys(parsedPayload || {}));
      return NextResponse.json(
        { error: 'No structured questions found in AI output. Please check the PDF content.' },
        { status: 422 }
      );
    }

    // Resolve common Unit and Node title for Exam Paper Mode
    const detectedExamTitle =
      parsedPayload.examTitle?.trim() ||
      targetNode ||
      file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

    const examUnitTitle =
      targetUnit && targetUnit !== 'सामान्य ज्ञान व चालू घडामोडी'
        ? targetUnit
        : 'पोलीस भरती PYQ प्रश्नपत्रिका';

    // Format and normalize questions into Prashnix structured format
    const formattedQuestions = questionsList.map((q: any, idx: number) => {
      const questionText = (q.questionText || q.question || q.text || q.prompt || '').trim();

      let optA = '';
      let optB = '';
      let optC = '';
      let optD = '';

      if (Array.isArray(q.options) && q.options.length > 0) {
        optA = String(q.options[0] || '').trim();
        optB = String(q.options[1] || '').trim();
        optC = String(q.options[2] || '').trim();
        optD = String(q.options[3] || '').trim();
      } else {
        optA = String(q.optionA || q.a || q.A || (q.options && q.options.A) || '').trim();
        optB = String(q.optionB || q.b || q.B || (q.options && q.options.B) || '').trim();
        optC = String(q.optionC || q.c || q.C || (q.options && q.options.C) || '').trim();
        optD = String(q.optionD || q.d || q.D || (q.options && q.options.D) || '').trim();
      }

      // Strip option prefix markers like "(A)", "A)", "1)", "१)", "A.", "1."
      const cleanPrefix = (str: string) =>
        str.replace(/^(\([A-D1-4१-४]\)|[A-D1-4१-४][\)\.]|\b[A-D]\b)\s*/i, '').trim();

      optA = cleanPrefix(optA);
      optB = cleanPrefix(optB);
      optC = cleanPrefix(optC);
      optD = cleanPrefix(optD);

      // Determine correct option
      const rawAns = String(
        q.correctOption || q.correct_option || q.answer || q.ans || q.correctAnswer || q.key || 'A'
      ).trim();

      let cleanOpt = 'A';
      const upper = rawAns.toUpperCase();
      if (upper.includes('B') || upper === '2' || upper === '२') cleanOpt = 'B';
      else if (upper.includes('C') || upper === '3' || upper === '३') cleanOpt = 'C';
      else if (upper.includes('D') || upper === '4' || upper === '४') cleanOpt = 'D';
      else if (upper.includes('A') || upper === '1' || upper === '१') cleanOpt = 'A';
      else {
        // Model returned the full text of the answer instead of A/B/C/D
        const ansLower = rawAns.toLowerCase();
        if (optB && optB.toLowerCase() === ansLower) cleanOpt = 'B';
        else if (optC && optC.toLowerCase() === ansLower) cleanOpt = 'C';
        else if (optD && optD.toLowerCase() === ansLower) cleanOpt = 'D';
        else if (optA && optA.toLowerCase() === ansLower) cleanOpt = 'A';
        else cleanOpt = 'A';
      }

      let correctText = optA;
      if (cleanOpt === 'B') correctText = optB;
      if (cleanOpt === 'C') correctText = optC;
      if (cleanOpt === 'D') correctText = optD;

      let resolvedUnit = (q.unitTitle || targetUnit).trim();
      let resolvedNode = (q.nodeTitle || targetNode).trim();

      if (categorizeMode === 'exam_paper') {
        resolvedUnit = examUnitTitle;
        resolvedNode = detectedExamTitle;
      } else if (categorizeMode === 'manual') {
        resolvedUnit = targetUnit;
        resolvedNode = targetNode;
      }

      return {
        id: `extracted_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        rowIndex: idx + 1,
        unitTitle: resolvedUnit,
        nodeTitle: resolvedNode,
        nodeType: 'learning',
        lessonTitle: 'Lesson 1',
        questionText,
        options: [optA, optB, optC, optD].filter((o) => o !== ''),
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        correctOption: cleanOpt,
        correctAnswer: correctText,
        explanation: (q.explanation || q.spashtikaran || q.reason || q.solution || '').trim(),
        pyqYear: pyqYear || parsedPayload.detectedYear || null,
        districtTag: districtTag || parsedPayload.detectedDistrict || null,
      };
    });

    return NextResponse.json({
      success: true,
      examTitle: parsedPayload.examTitle || file.name.replace(/\.[^/.]+$/, ''),
      detectedYear: parsedPayload.detectedYear,
      detectedDistrict: parsedPayload.detectedDistrict,
      totalCount: formattedQuestions.length,
      questions: formattedQuestions,
    });
  } catch (err: unknown) {
    console.error('PDF Extraction Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error while extracting PDF.' },
      { status: 500 }
    );
  }
}
