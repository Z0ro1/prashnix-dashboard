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
  fit_mode?: 'cover' | 'contain';
  is_pinned: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function uploadCommunityImage(file: File | Blob): Promise<string> {
  const fileExt = (file instanceof File ? file.name.split('.').pop() : 'jpg') || 'jpg';
  const fileName = `community_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `posters/${fileName}`;

  try {
    const { data, error } = await supabase.storage
      .from('community-media')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (!error && data) {
      const { data: publicUrlData } = supabase.storage
        .from('community-media')
        .getPublicUrl(filePath);
      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
  } catch (err) {
    console.warn('Supabase storage upload failed, converting to data URL fallback:', err);
  }

  // Fallback: Convert to Base64 Data URL so user can always save without breaking!
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    if (data && data.length === 0) return [];
  } catch (err) {
    console.warn('Falling back to local cache for community items:', err);
  }

  // Fallback to local storage (only real user-created items)
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LOCAL_STORAGE_ITEMS_KEY);
    if (saved) {
      try {
        const items: CommunityItem[] = JSON.parse(saved);
        // Clean out any legacy mock seed items from previous sessions
        const realItems = items.filter((i) => !i.id.startsWith('seed-'));
        if (realItems.length !== items.length) {
          localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(realItems));
        }
        if (typeFilter && typeFilter !== 'all') {
          return realItems.filter((i) => i.type === typeFilter);
        }
        return realItems;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  }

  return [];
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
          fit_mode: item.fit_mode ?? 'cover',
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
          fit_mode: item.fit_mode ?? 'cover',
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
      fit_mode: item.fit_mode || 'cover',
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

export async function sendCommunityMessage(message: string, username: string = 'Prashnix Admin', leagueTier: string = 'champion'): Promise<CommunityMessage> {
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
