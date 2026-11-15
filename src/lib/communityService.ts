import { supabase } from './supabase';

export interface CommunityMessage {
  id: string;
  user_id?: string;
  username: string;
  avatar_url?: string;
  league_tier?: string;
  message: string;
  created_at: string;
}

export interface CommunityItem {
  id: string;
  type: 'image' | 'notice' | 'announcement' | 'study_tip';
  title: string;
  content: string;
  image_url?: string;
  badge_tag?: string;
  action_url?: string;
  is_pinned: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const LOCAL_STORAGE_ITEMS_KEY = 'prashnix_community_items_fallback';
const LOCAL_STORAGE_MESSAGES_KEY = 'prashnix_community_messages_fallback';

export const COMMUNITY_SQL_MIGRATION = `-- ==============================================================================
-- Prashnix Community Schema Migration (Copy & Run in Supabase SQL Editor)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT NOT NULL DEFAULT 'स्पर्धक',
  avatar_url TEXT,
  league_tier TEXT DEFAULT 'bronze',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_length_check CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_community_messages_created_at 
ON public.community_messages(created_at DESC);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view community messages"
ON public.community_messages FOR SELECT USING ( TRUE );

CREATE POLICY "Enable insert for community_messages"
ON public.community_messages FOR INSERT WITH CHECK ( TRUE );

CREATE POLICY "Enable delete for community_messages"
ON public.community_messages FOR DELETE USING ( TRUE );

CREATE TABLE IF NOT EXISTS public.community_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('image', 'notice', 'announcement', 'study_tip')),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  image_url TEXT,
  badge_tag TEXT DEFAULT 'नवीन',
  action_url TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_items_type_active 
ON public.community_items(type, is_active, is_pinned DESC, created_at DESC);

ALTER TABLE public.community_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active community items"
ON public.community_items FOR SELECT USING ( TRUE );

CREATE POLICY "Enable insert for community_items"
ON public.community_items FOR INSERT WITH CHECK ( TRUE );

CREATE POLICY "Enable update for community_items"
ON public.community_items FOR UPDATE USING ( TRUE ) WITH CHECK ( TRUE );

CREATE POLICY "Enable delete for community_items"
ON public.community_items FOR DELETE USING ( TRUE );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'community_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
`;

// Helper: initial seed items for realistic mock & initial data
export const INITIAL_COMMUNITY_SEEDS: CommunityItem[] = [
  {
    id: 'seed-img-1',
    type: 'image',
    title: 'महाराष्ट्र पोलीस भरती २०२६ मैदानी चाचणी निकष व गुण तक्ता',
    content: '१६०० मीटर धावणे, १०० मीटर धावणे आणि गोळाफेक याचे संपूर्ण गुण वाटप चार्ट. दररोज सकाळी सराव करा!',
    image_url: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=1200&q=80',
    badge_tag: 'मैदानी चाचणी',
    is_pinned: true,
    is_active: true,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'seed-img-2',
    type: 'image',
    title: 'भारतीय राज्यघटना - महत्त्वाची कलमे व भाग एका दृष्टीक्षेपात',
    content: 'पोलीस उपनिरीक्षक व कॉन्स्टेबल परीक्षेसाठी सर्वाधिक वारंवार विचारली जाणारी मूलभूत हक्क व मार्गदर्शक तत्त्वे कलमे.',
    image_url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=1200&q=80',
    badge_tag: 'राज्यघटना सूत्रे',
    is_pinned: false,
    is_active: true,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'seed-notice-1',
    type: 'notice',
    title: 'पोलीस शिपाई भरती लेखी परीक्षा हॉल तिकीट प्रसिद्धीबाबत',
    content: 'ज्या उमेदवारांचे अर्ज स्वीकारले गेले आहेत त्यांचे प्रवेशपत्र अधिकृत पोर्टलवर उपलब्ध झाले आहेत. परीक्षेच्या २ तास आधी केंद्रावर पोहोचावे.',
    badge_tag: 'अति महत्त्वाचे',
    action_url: 'https://policerecruitment2024.mahait.org',
    is_pinned: true,
    is_active: true,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'seed-announcement-1',
    type: 'announcement',
    title: 'रविवार १०० गुणांची राज्यस्तरीय मेगा मॉक टेस्ट',
    content: 'या रविवारी सकाळी १०:०० वाजता प्रशांतिक्स ॲपवर विशेष पोलीस भरती १०० गुणांची थेट टेस्ट होणार आहे. सर्वोत्कृष्ट १० विद्यार्थ्यांना प्रमाणपत्र व बॅज मिळेल.',
    badge_tag: 'साप्ताहिक टेस्ट',
    action_url: '',
    is_pinned: true,
    is_active: true,
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
  {
    id: 'seed-tip-1',
    type: 'study_tip',
    title: 'आजची चालू घडामोडी: महाराष्ट्रातील नवीन औद्योगिक धोरण २०२६',
    content: 'नवीन उद्योग व रोजगार निर्मितीसाठी राज्य शासनाने ५ नवीन लॉजिस्टिक्स पार्क स्थापन करण्याची घोषणा केली आहे.',
    badge_tag: 'चालू घडामोडी',
    action_url: '',
    is_pinned: false,
    is_active: true,
    created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
];

export async function checkCommunityTablesExist(): Promise<{ messagesTable: boolean; itemsTable: boolean }> {
  let messagesTable = false;
  let itemsTable = false;

  try {
    const { error: msgErr } = await supabase.from('community_messages').select('id').limit(1);
    messagesTable = !msgErr;
  } catch {
    messagesTable = false;
  }

  try {
    const { error: itemErr } = await supabase.from('community_items').select('id').limit(1);
    itemsTable = !itemErr;
  } catch {
    itemsTable = false;
  }

  return { messagesTable, itemsTable };
}

// -----------------------------------------------------------------------------
// COMMUNITY ITEMS CRUD
// -----------------------------------------------------------------------------

export async function fetchCommunityItems(typeFilter?: string): Promise<CommunityItem[]> {
  try {
    let query = supabase.from('community_items').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    if (typeFilter && typeFilter !== 'all') {
      query = query.eq('type', typeFilter);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return data as CommunityItem[];
  } catch (err) {
    console.warn('Falling back to local cache for community items:', err);
  }

  // Fallback to local storage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LOCAL_STORAGE_ITEMS_KEY);
    if (saved) {
      try {
        const items: CommunityItem[] = JSON.parse(saved);
        if (typeFilter && typeFilter !== 'all') {
          return items.filter((i) => i.type === typeFilter);
        }
        return items;
      } catch (e) {
        console.error(e);
      }
    }
    // Initialize with seeds if empty
    localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(INITIAL_COMMUNITY_SEEDS));
    return typeFilter && typeFilter !== 'all'
      ? INITIAL_COMMUNITY_SEEDS.filter((i) => i.type === typeFilter)
      : INITIAL_COMMUNITY_SEEDS;
  }

  return INITIAL_COMMUNITY_SEEDS;
}

export async function saveCommunityItem(item: Partial<CommunityItem>): Promise<CommunityItem> {
  const isUpdate = !!item.id && !item.id.startsWith('temp-') && !item.id.startsWith('seed-');
  const now = new Date().toISOString();

  // Try saving to Supabase
  try {
    if (isUpdate) {
      const { data, error } = await supabase
        .from('community_items')
        .update({
          type: item.type,
          title: item.title,
          content: item.content ?? '',
          image_url: item.image_url ?? null,
          badge_tag: item.badge_tag ?? 'नवीन',
          action_url: item.action_url ?? null,
          is_pinned: item.is_pinned ?? false,
          is_active: item.is_active ?? true,
          updated_at: now,
        })
        .eq('id', item.id)
        .select()
        .single();
      if (error) throw error;
      return data as CommunityItem;
    } else {
      const { data, error } = await supabase
        .from('community_items')
        .insert({
          type: item.type,
          title: item.title,
          content: item.content ?? '',
          image_url: item.image_url ?? null,
          badge_tag: item.badge_tag ?? 'नवीन',
          action_url: item.action_url ?? null,
          is_pinned: item.is_pinned ?? false,
          is_active: item.is_active ?? true,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CommunityItem;
    }
  } catch (err) {
    console.warn('Saving to local storage fallback due to:', err);
    // Local storage fallback
    const existing = await fetchCommunityItems();
    let updatedList: CommunityItem[];
    const newItem: CommunityItem = {
      id: item.id || `item-${Date.now()}`,
      type: item.type || 'image',
      title: item.title || '',
      content: item.content || '',
      image_url: item.image_url,
      badge_tag: item.badge_tag || 'नवीन',
      action_url: item.action_url,
      is_pinned: !!item.is_pinned,
      is_active: item.is_active !== undefined ? item.is_active : true,
      created_at: item.created_at || now,
      updated_at: now,
    };

    if (item.id && existing.some((i) => i.id === item.id)) {
      updatedList = existing.map((i) => (i.id === item.id ? newItem : i));
    } else {
      updatedList = [newItem, ...existing];
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(updatedList));
    }
    return newItem;
  }
}

export async function deleteCommunityItem(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('community_items').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.warn('Falling back to local storage delete:', err);
  }

  if (typeof window !== 'undefined') {
    const existing = await fetchCommunityItems();
    const updated = existing.filter((i) => i.id !== id);
    localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(updated));
  }
}

export async function toggleCommunityItemActive(id: string, is_active: boolean): Promise<void> {
  try {
    const { error } = await supabase.from('community_items').update({ is_active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.warn('Falling back to local storage toggle:', err);
  }

  if (typeof window !== 'undefined') {
    const existing = await fetchCommunityItems();
    const updated = existing.map((i) => (i.id === id ? { ...i, is_active } : i));
    localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(updated));
  }
}

// -----------------------------------------------------------------------------
// LIVE 30-MINUTE CHAT OPERATIONS & MODERATION
// -----------------------------------------------------------------------------

export async function fetchRecentMessages(minutesWindow: number = 30): Promise<CommunityMessage[]> {
  const cutoffTime = new Date(Date.now() - minutesWindow * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (data) return data as CommunityMessage[];
  } catch (err) {
    console.warn('Falling back to local storage messages:', err);
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LOCAL_STORAGE_MESSAGES_KEY);
    if (saved) {
      try {
        const msgs: CommunityMessage[] = JSON.parse(saved);
        // Evict expired messages older than 30 mins
        const fresh = msgs.filter((m) => new Date(m.created_at).getTime() >= Date.now() - minutesWindow * 60 * 1000);
        return fresh;
      } catch (e) {
        console.error(e);
      }
    }
  }

  return [];
}

export function validateMessageContent(text: string): { valid: boolean; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Message cannot be empty.' };
  }
  if (trimmed.length > 300) {
    return { valid: false, reason: 'Message cannot exceed 300 characters.' };
  }
  // Reject URLs/links
  if (/https?:\/\/|www\.|\.com|\.in|\.org|\.net/i.test(trimmed)) {
    return { valid: false, reason: 'Links and URLs are not allowed in the live chat.' };
  }
  // Reject HTML tags
  if (/<[^>]*>/i.test(trimmed)) {
    return { valid: false, reason: 'HTML or code tags are not allowed.' };
  }

  return { valid: true };
}

export async function sendCommunityMessage(message: string, username: string = 'Prashnix Admin 🛡️', leagueTier: string = 'champion'): Promise<CommunityMessage> {
  const validation = validateMessageContent(message);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const payload = {
    username,
    league_tier: leagueTier,
    message: message.trim(),
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from('community_messages').insert(payload).select().single();
    if (error) throw error;
    return data as CommunityMessage;
  } catch (err) {
    console.warn('Falling back to local storage for message sending:', err);
    const fallbackMsg: CommunityMessage = {
      id: `msg-${Date.now()}`,
      username: payload.username,
      league_tier: payload.league_tier,
      message: payload.message,
      created_at: payload.created_at,
    };

    if (typeof window !== 'undefined') {
      const existing = await fetchRecentMessages();
      const updated = [...existing, fallbackMsg];
      localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(updated));
    }
    return fallbackMsg;
  }
}

export async function deleteCommunityMessage(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('community_messages').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.warn('Falling back to local message delete:', err);
  }

  if (typeof window !== 'undefined') {
    const existing = await fetchRecentMessages();
    const updated = existing.filter((m) => m.id !== id);
    localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(updated));
  }
}
