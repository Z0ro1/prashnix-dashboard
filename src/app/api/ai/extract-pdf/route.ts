import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for large PDFs

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

    const requestedModel = (formData.get('model') as string) || 'gemini-3.5-flash';
    const autoCategorize = formData.get('autoCategorize') !== 'false';
    const targetUnit = (formData.get('targetUnit') as string)?.trim() || 'सामान्य ज्ञान व चालू घडामोडी';
    const targetNode = (formData.get('targetNode') as string)?.trim() || 'सर्वसाधारण सराव चाचणी';
    const districtTag = (formData.get('district') as string)?.trim() || null;
    const pyqYear = formData.get('pyqYear') ? parseInt(formData.get('pyqYear') as string, 10) : null;

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `You are an expert Marathi exam paper analyst specializing in Maharashtra competitive exams (Maharashtra Police Bharti, MPSC, Saral Seva, Talathi).
Analyze the provided PDF exam paper / question bank and extract all Multiple Choice Questions (MCQs).

Strict Extraction & Formatting Rules:
1. Question Text: Clean, grammatically correct Marathi in Devanagari script. Fix any OCR noise, broken ligatures, random symbols, or misprints.
2. Options: Extract exactly 4 distinct options (Option A, Option B, Option C, Option D). Clean any numbering or prefixes (like 1), 2), A), B)) from the option text.
3. Correct Answer:
   - Identify the correct option (strictly 'A', 'B', 'C', or 'D').
   - If the PDF has an answer key (उदा. उत्तरपत्रिका, उत्तरतालिका, answer key at the bottom or marked answer), use it.
   - If not explicitly provided, determine the accurate and verified answer according to Maharashtra state board / standard exam references.
4. One-Liner Marathi Explanation:
   - Provide a concise, clear 1-2 sentence Marathi explanation ('स्पष्टीकरण') explaining WHY that answer is correct.
5. Syllabus Categorization:
   ${
     autoCategorize
       ? `Categorize each question into standard Maharashtra Police Bharti syllabus Units and Nodes:
   - Unit 'मराठी व्याकरण' -> Nodes: 'वर्णमाला व संधी', 'नाम, सर्वनाम व विशेषण', 'काळ व प्रयोग', 'समास व अलंकार', 'शब्दसंग्रह व म्हणी'
   - Unit 'सामान्य ज्ञान व चालू घडामोडी' -> Nodes: 'इतिहास व समाजसुधारक', 'महाराष्ट्र भूगोल व जिल्हे', 'सामान्य विज्ञान', 'चालू घडामोडी'
   - Unit 'राज्यशास्त्र व पोलीस प्रशासन' -> Nodes: 'भारतीय संविधान व हक्क', 'पोलीस प्रशासन व कायदे', 'पंचायत राज व स्थानिक स्वराज्य'
   - Unit 'अंकगणित व बुद्धिमत्ता चाचणी' -> Nodes: 'अंकगणित मूलभूत संकल्पना', 'शेकडेवारी व नफा-तोटा', 'काळ, काम व वेग', 'संख्यामाला व नातेसंबंध'`
       : `Assign every question to Unit: "${targetUnit}" and Node: "${targetNode}".`
   }

Return a valid JSON object matching this schema:
{
  "examTitle": "Title or Header detected from the exam paper",
  "detectedYear": 2023,
  "detectedDistrict": "District name if detected, else null",
  "questions": [
    {
      "questionNumber": 1,
      "unitTitle": "Unit name",
      "nodeTitle": "Node name",
      "questionText": "Cleaned Marathi Question Text",
      "optionA": "Text for Option A",
      "optionB": "Text for Option B",
      "optionC": "Text for Option C",
      "optionD": "Text for Option D",
      "correctOption": "A",
      "explanation": "संक्षिप्त आणि अचूक मराठी स्पष्टीकरण (1-2 lines)"
    }
  ]
}`;

    // Helper to call Gemini REST API
    const callGemini = async (modelName: string) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
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
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.2,
          },
        }),
      });
      return res;
    };

    // Candidate models to try in priority order
    const candidateModels = Array.from(
      new Set([
        requestedModel,
        'gemini-3.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest',
      ])
    );

    let geminiRes: Response | null = null;
    let lastError = '';

    for (const modelToTry of candidateModels) {
      try {
        const res = await callGemini(modelToTry);
        if (res.ok) {
          geminiRes = res;
          break;
        } else {
          const errText = await res.text();
          let parsedErr: any = null;
          try {
            parsedErr = JSON.parse(errText);
          } catch {}
          lastError = parsedErr?.error?.message || errText;
          console.warn(`Model ${modelToTry} returned ${res.status}: ${lastError}. Retrying next candidate...`);
        }
      } catch (e: any) {
        lastError = e?.message || 'Network error';
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      return NextResponse.json(
        { error: lastError || 'All candidate Gemini models failed to process the request.' },
        { status: 502 }
      );
    }

    const json = await geminiRes.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: 'Gemini returned an empty response.' }, { status: 500 });
    }

    let parsedPayload: {
      examTitle?: string;
      detectedYear?: number;
      detectedDistrict?: string;
      questions: ExtractedRawQuestion[];
    };

    try {
      parsedPayload = JSON.parse(rawText);
    } catch {
      // If wrapped in markdown ```json ... ```, strip it
      const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      parsedPayload = JSON.parse(cleaned);
    }

    if (!parsedPayload.questions || !Array.isArray(parsedPayload.questions)) {
      return NextResponse.json(
        { error: 'No structured questions found in AI output. Please check the PDF content.' },
        { status: 422 }
      );
    }

    // Format questions into Prashnix structured format
    const formattedQuestions = parsedPayload.questions.map((q, idx) => {
      const optA = (q.optionA || '').trim();
      const optB = (q.optionB || '').trim();
      const optC = (q.optionC || '').trim();
      const optD = (q.optionD || '').trim();

      const cleanOpt = (q.correctOption || 'A').toUpperCase().replace(/[^ABCD]/g, '') || 'A';
      let correctText = optA;
      if (cleanOpt === 'B') correctText = optB;
      if (cleanOpt === 'C') correctText = optC;
      if (cleanOpt === 'D') correctText = optD;

      return {
        id: `extracted_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        rowIndex: idx + 1,
        unitTitle: (q.unitTitle || targetUnit).trim(),
        nodeTitle: (q.nodeTitle || targetNode).trim(),
        nodeType: 'learning',
        lessonTitle: 'Lesson 1',
        questionText: (q.questionText || '').trim(),
        options: [optA, optB, optC, optD].filter((o) => o !== ''),
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        correctOption: cleanOpt,
        correctAnswer: correctText,
        explanation: (q.explanation || '').trim(),
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
