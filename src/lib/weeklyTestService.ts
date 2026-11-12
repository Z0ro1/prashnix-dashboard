import { supabase } from './supabase';

export interface WeeklyTestQuestion {
  id: string;
  questionNumber: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string; // 'A' | 'B' | 'C' | 'D'
  correctAnswer: string;
  explanation: string;
  subjectTag?: string;
}

export interface WeeklyTest {
  id: string;
  title: string;
  description?: string;
  exam_type: string;
  scheduled_date: string; // 'YYYY-MM-DD'
  start_time?: string; // ISO string or 'HH:mm'
  end_time?: string;
  duration_minutes: number;
  total_marks: number;
  total_questions: number;
  questions: WeeklyTestQuestion[];
  is_active: boolean;
  created_at?: string;
  source?: 'table' | 'nodes';
}

const WEEKLY_TESTS_UNIT_TITLE = 'साप्ताहिक महासराव परीक्षा';

/**
 * Checks if the public.weekly_tests table exists and is accessible.
 */
export async function checkWeeklyTestsTableExists(): Promise<boolean> {
  try {
    const { error } = await supabase.from('weekly_tests').select('id').limit(1);
    if (!error) return true;
    if (error.code === 'PGRST205' || error.message?.includes('not find the table')) {
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fetches all scheduled weekly tests from Supabase.
 * Checks the dedicated weekly_tests table first; if not present, falls back to nodes.
 */
export async function fetchWeeklyTests(): Promise<WeeklyTest[]> {
  const tableExists = await checkWeeklyTestsTableExists();

  if (tableExists) {
    try {
      const { data, error } = await supabase
        .from('weekly_tests')
        .select('*')
        .order('scheduled_date', { ascending: false });

      if (!error && data) {
        return data.map((item) => ({
          ...item,
          questions: Array.isArray(item.questions) ? item.questions : [],
          source: 'table' as const,
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch from weekly_tests table, falling back to nodes:', err);
    }
  }

  // Fallback: Query nodes with node_type = 'weekly_test'
  try {
    const { data: nodesData, error: nodesError } = await supabase
      .from('nodes')
      .select('*, lessons(*, questions(*))')
      .eq('node_type', 'weekly_test')
      .order('created_at', { ascending: false });

    if (nodesError || !nodesData) return [];

    return nodesData.map((node) => {
      let meta: any = {};
      try {
        if (node.info_note && node.info_note.startsWith('{')) {
          meta = JSON.parse(node.info_note);
        }
      } catch {}

      // Collect questions from linked lessons
      const nodeQuestions: WeeklyTestQuestion[] = [];
      const lessons = node.lessons || [];
      lessons.forEach((l: any) => {
        const qList = l.questions || [];
        qList.forEach((q: any, qIdx: number) => {
          const content = q.content || {};
          const opts = content.options || [];
          nodeQuestions.push({
            id: q.id || `q_${qIdx}`,
            questionNumber: nodeQuestions.length + 1,
            questionText: content.text || '',
            optionA: opts[0] || '',
            optionB: opts[1] || '',
            optionC: opts[2] || '',
            optionD: opts[3] || '',
            correctOption: q.correct_answer || 'A',
            correctAnswer: q.correct_answer || opts[0] || '',
            explanation: content.explanation || '',
          });
        });
      });

      return {
        id: node.id,
        title: node.title,
        description: meta.description || '',
        exam_type: meta.exam_type || 'Police Bharti',
        scheduled_date: meta.scheduled_date || new Date().toISOString().split('T')[0],
        start_time: meta.start_time,
        end_time: meta.end_time,
        duration_minutes: meta.duration_minutes || 90,
        total_marks: meta.total_marks || 100,
        total_questions: nodeQuestions.length || meta.total_questions || 100,
        questions: nodeQuestions.length > 0 ? nodeQuestions : (meta.questions || []),
        is_active: meta.is_active !== undefined ? meta.is_active : true,
        created_at: node.created_at,
        source: 'nodes' as const,
      };
    });
  } catch (err) {
    console.error('Error fetching weekly tests fallback:', err);
    return [];
  }
}

/**
 * Creates or updates a Weekly Test in Supabase with exact 100 questions.
 */
export async function saveWeeklyTest(test: {
  id?: string;
  title: string;
  description?: string;
  exam_type: string;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  total_marks?: number;
  questions: WeeklyTestQuestion[];
  is_active?: boolean;
}): Promise<{ success: boolean; id: string; error?: string; source: 'table' | 'nodes' }> {
  if (test.questions.length !== 100) {
    return {
      success: false,
      id: '',
      error: `Weekly Test requires exactly 100 questions (Provided: ${test.questions.length}).`,
      source: 'table',
    };
  }

  const tableExists = await checkWeeklyTestsTableExists();

  const payload = {
    title: test.title.trim(),
    description: test.description?.trim() || '',
    exam_type: test.exam_type,
    scheduled_date: test.scheduled_date,
    start_time: test.start_time || `${test.scheduled_date}T12:00:00Z`,
    end_time: test.end_time || null,
    duration_minutes: test.duration_minutes || 90,
    total_marks: test.total_marks || 100,
    total_questions: 100,
    questions: test.questions,
    is_active: test.is_active !== undefined ? test.is_active : true,
  };

  if (tableExists) {
    if (test.id) {
      const { error } = await supabase.from('weekly_tests').update(payload).eq('id', test.id);
      if (error) throw error;
      return { success: true, id: test.id, source: 'table' };
    } else {
      const { data, error } = await supabase.from('weekly_tests').insert(payload).select('id').single();
      if (error) throw error;
      return { success: true, id: data.id, source: 'table' };
    }
  }

  // Fallback: Save to nodes table
  // 1. Ensure Weekly Tests unit exists
  let unitId = '';
  const { data: existingUnit } = await supabase
    .from('units')
    .select('id')
    .eq('title', WEEKLY_TESTS_UNIT_TITLE)
    .limit(1);

  if (existingUnit && existingUnit.length > 0) {
    unitId = existingUnit[0].id;
  } else {
    const { data: newUnit, error: unitErr } = await supabase
      .from('units')
      .insert({
        display_id: 'unit_weekly_tests',
        title: WEEKLY_TESTS_UNIT_TITLE,
        theme_color: '#f59e0b',
        order_index: 999,
      })
      .select('id')
      .single();

    if (unitErr || !newUnit) throw unitErr || new Error('Failed to create Weekly Tests unit');
    unitId = newUnit.id;
  }

  // 2. Insert Node
  const metaNote = JSON.stringify({
    exam_type: test.exam_type,
    scheduled_date: test.scheduled_date,
    start_time: test.start_time || `${test.scheduled_date}T12:00:00Z`,
    duration_minutes: test.duration_minutes || 90,
    total_marks: test.total_marks || 100,
    total_questions: 100,
    is_active: test.is_active !== undefined ? test.is_active : true,
    questions_count: test.questions.length,
    description: test.description || '',
  });

  const nodeDisplayId = `node_wt_${Date.now()}`;
  const { data: newNode, error: nodeErr } = await supabase
    .from('nodes')
    .insert({
      unit_id: unitId,
      display_id: nodeDisplayId,
      title: test.title,
      node_type: 'weekly_test',
      icon_name: 'trophy',
      animation_preset: 'bounce',
      info_note: metaNote,
      order_index: 0,
    })
    .select('id')
    .single();

  if (nodeErr || !newNode) throw nodeErr || new Error('Failed to create weekly test node');

  // 3. Create Lesson to hold the 100 questions
  const lessonDisplayId = `${nodeDisplayId}.l1`;
  const { data: newLesson, error: lessonErr } = await supabase
    .from('lessons')
    .insert({
      node_id: newNode.id,
      display_id: lessonDisplayId,
      title: 'साप्ताहिक महासराव १०० प्रश्न चाचणी',
      order_index: 0,
    })
    .select('id')
    .single();

  if (lessonErr || !newLesson) throw lessonErr || new Error('Failed to create weekly test lesson');

  // 4. Batch Insert 100 questions
  const questionPayloads = test.questions.map((q, idx) => ({
    lesson_id: newLesson.id,
    display_id: `${lessonDisplayId}.q_${idx + 1}`,
    is_global_pool: false,
    question_type: 'multiple_choice',
    content: {
      text: q.questionText,
      options: [q.optionA, q.optionB, q.optionC, q.optionD],
      explanation: q.explanation,
      pyq_year: 2026,
      district_tag: test.exam_type,
    },
    correct_answer: q.correctAnswer || q.correctOption,
  }));

  const CHUNK_SIZE = 50;
  for (let i = 0; i < questionPayloads.length; i += CHUNK_SIZE) {
    const chunk = questionPayloads.slice(i, i + CHUNK_SIZE);
    const { error: qErr } = await supabase.from('questions').insert(chunk);
    if (qErr) throw qErr;
  }

  return { success: true, id: newNode.id, source: 'nodes' };
}

/**
 * Deletes a weekly test by ID (from either table or nodes).
 */
export async function deleteWeeklyTest(id: string, source: 'table' | 'nodes' = 'table'): Promise<void> {
  if (source === 'table') {
    const { error } = await supabase.from('weekly_tests').delete().eq('id', id);
    if (!error) return;
  }
  // Also try deleting from nodes if needed
  await supabase.from('nodes').delete().eq('id', id);
}

/**
 * Toggles active state of a weekly test.
 */
export async function toggleWeeklyTestActive(id: string, isActive: boolean, source: 'table' | 'nodes' = 'table'): Promise<void> {
  if (source === 'table') {
    const { error } = await supabase.from('weekly_tests').update({ is_active: isActive }).eq('id', id);
    if (!error) return;
  }

  // Update in nodes
  const { data } = await supabase.from('nodes').select('info_note').eq('id', id).single();
  if (data?.info_note) {
    try {
      const meta = JSON.parse(data.info_note);
      meta.is_active = isActive;
      await supabase.from('nodes').update({ info_note: JSON.stringify(meta) }).eq('id', id);
    } catch {}
  }
}
