'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Image as ImageIcon,
  Bell,
  Megaphone,
  Lightbulb,
  Plus,
  Trash2,
  Edit,
  ExternalLink,
  Pin,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Power,
  X,
  Send,
  Clock,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { useFeedback } from '@/components/FeedbackDialog';
import {
  CommunityItem,
  CommunityMessage,
  COMMUNITY_SQL_MIGRATION,
  checkCommunityTablesExist,
  fetchCommunityItems,
  saveCommunityItem,
  deleteCommunityItem,
  toggleCommunityItemActive,
  fetchRecentMessages,
  sendCommunityMessage,
  deleteCommunityMessage,
} from '@/lib/communityService';
import { supabase } from '@/lib/supabase';

type TabType = 'images' | 'notices' | 'announcements' | 'tips' | 'chat';

const BADGE_SUGGESTIONS = [
  'New',
  'Important',
  'Exam Date',
  'Physical Test',
  'Current Affairs',
  'Weekly Test',
  'Results Announced',
];

export default function CommunityPage() {
  const { toast, confirm } = useFeedback();

  const [activeTab, setActiveTab] = useState<TabType>('images');
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState({ messagesTable: false, itemsTable: false });
  const [copiedSql, setCopiedSql] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Item Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CommunityItem | null>(null);
  const [itemType, setItemType] = useState<'image' | 'notice' | 'announcement' | 'study_tip'>('image');
  const [itemTitle, setItemTitle] = useState('');
  const [itemContent, setItemContent] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemBadgeTag, setItemBadgeTag] = useState('New');
  const [itemActionUrl, setItemActionUrl] = useState('');
  const [itemIsPinned, setItemIsPinned] = useState(false);
  const [itemIsActive, setItemIsActive] = useState(true);
  const [savingItem, setSavingItem] = useState(false);

  // Chat input state
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  const loadItems = async () => {
    try {
      const data = await fetchCommunityItems();
      setItems(data);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const loadMessages = async () => {
    try {
      const msgs = await fetchRecentMessages(30);
      setMessages(msgs);
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const exists = await checkCommunityTablesExist();
      setTablesExist(exists);
      await Promise.all([loadItems(), loadMessages()]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'Failed to load community data', errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    // Auto-refresh chat every 15 seconds to sync and drop messages older than 30 mins
    const interval = setInterval(() => {
      loadMessages();
    }, 15000);

    // Subscribe to realtime messages if available
    const channel = supabase
      .channel('admin-community-chat')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_messages' },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCopySql = () => {
    navigator.clipboard.writeText(COMMUNITY_SQL_MIGRATION);
    setCopiedSql(true);
    toast('success', 'SQL Copied!', 'Paste and run in your Supabase SQL Editor.');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Open Modal for Create
  const handleOpenCreateModal = (defaultType?: 'image' | 'notice' | 'announcement' | 'study_tip') => {
    setEditingItem(null);
    let resolvedType: 'image' | 'notice' | 'announcement' | 'study_tip' = 'image';
    if (defaultType) resolvedType = defaultType;
    else if (activeTab === 'images') resolvedType = 'image';
    else if (activeTab === 'notices') resolvedType = 'notice';
    else if (activeTab === 'announcements') resolvedType = 'announcement';
    else if (activeTab === 'tips') resolvedType = 'study_tip';

    setItemType(resolvedType);
    setItemTitle('');
    setItemContent('');
    setItemImageUrl('');
    setItemBadgeTag('New');
    setItemActionUrl('');
    setItemIsPinned(false);
    setItemIsActive(true);
    setShowItemModal(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (item: CommunityItem) => {
    setEditingItem(item);
    setItemType(item.type);
    setItemTitle(item.title);
    setItemContent(item.content || '');
    setItemImageUrl(item.image_url || '');
    setItemBadgeTag(item.badge_tag || 'New');
    setItemActionUrl(item.action_url || '');
    setItemIsPinned(item.is_pinned);
    setItemIsActive(item.is_active);
    setShowItemModal(true);
  };

  // Save Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim()) {
      toast('error', 'Title is required', 'Please provide a title for this item.');
      return;
    }
    if (itemType === 'image' && !itemImageUrl.trim()) {
      toast('error', 'Image URL is required', 'Please provide a valid image URL.');
      return;
    }

    setSavingItem(true);
    try {
      await saveCommunityItem({
        id: editingItem?.id,
        type: itemType,
        title: itemTitle.trim(),
        content: itemContent.trim(),
        image_url: itemImageUrl.trim() || undefined,
        badge_tag: itemBadgeTag.trim() || 'New',
        action_url: itemActionUrl.trim() || undefined,
        is_pinned: itemIsPinned,
        is_active: itemIsActive,
      });

      toast('success', editingItem ? 'Post updated successfully!' : 'New post created!', itemTitle);
      setShowItemModal(false);
      await loadItems();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'Failed to save post', errMsg);
    } finally {
      setSavingItem(false);
    }
  };

  // Delete Item
  const handleDeleteItem = (item: CommunityItem) => {
    confirm({
      title: 'Delete Post?',
      message: `Are you sure you want to permanently delete "${item.title}"?`,
      confirmText: 'Yes, Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteCommunityItem(item.id);
          toast('success', 'Post deleted successfully', item.title);
          await loadItems();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toast('error', 'Failed to delete post', errMsg);
        }
      },
    });
  };

  // Toggle Active
  const handleToggleActive = async (item: CommunityItem) => {
    try {
      await toggleCommunityItemActive(item.id, !item.is_active);
      toast('info', item.is_active ? 'Post deactivated' : 'Post activated', item.title);
      await loadItems();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'Failed to update status', errMsg);
    }
  };

  // Send Admin Chat Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setSendingMsg(true);
    try {
      await sendCommunityMessage(chatInput, 'Prashnix Admin 🛡️', 'champion');
      setChatInput('');
      toast('success', 'Message sent', 'Visible in the live 30-minute chat feed.');
      await loadMessages();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'Failed to send message', errMsg);
    } finally {
      setSendingMsg(false);
    }
  };

  // Delete Chat Message
  const handleDeleteMessage = (msg: CommunityMessage) => {
    confirm({
      title: 'Delete Message?',
      message: `Delete message from "${msg.username}"?`,
      confirmText: 'Yes, Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteCommunityMessage(msg.id);
          toast('success', 'Message removed', 'The message has been removed from all student feeds.');
          await loadMessages();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toast('error', 'Failed to remove message', errMsg);
        }
      },
    });
  };

  // Quick Emoji adder
  const addEmoji = (emoji: string) => {
    setChatInput((prev) => prev + emoji);
  };

  // Helper for remaining minutes
  const getRemainingMinutes = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    const diffMs = 30 * 60 * 1000 - (Date.now() - created);
    if (diffMs <= 0) return 'Expired';
    const mins = Math.ceil(diffMs / (60 * 1000));
    return `${mins}m left`;
  };

  // Filtered items
  const filteredItems = items
    .filter((i) => {
      if (activeTab === 'images') return i.type === 'image';
      if (activeTab === 'notices') return i.type === 'notice';
      if (activeTab === 'announcements') return i.type === 'announcement';
      if (activeTab === 'tips') return i.type === 'study_tip';
      return true;
    })
    .filter((i) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        i.title.toLowerCase().includes(q) ||
        (i.content && i.content.toLowerCase().includes(q)) ||
        (i.badge_tag && i.badge_tag.toLowerCase().includes(q))
      );
    });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <MessageSquare size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Community Hub</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Manage 30-minute live chat moderation, study posters, official notices, and announcements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleCopySql}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              copiedSql
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {copiedSql ? <Check size={16} /> : <Copy size={16} />}
            {copiedSql ? 'SQL Copied!' : 'Copy Supabase SQL'}
          </button>

          <button
            onClick={loadAllData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {activeTab !== 'chat' && (
            <button
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all"
            >
              <Plus size={18} />
              Create Post
            </button>
          )}
        </div>
      </div>

      {/* Storage Mode Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Storage Mode:{' '}
            <strong className="text-slate-900">
              {tablesExist.itemsTable ? 'Supabase Table (community_items & messages)' : 'Local Resilient Fallback Active'}
            </strong>
          </span>
          <span className="text-slate-400">• 30-Minute Auto-Expiry Live Chat Active</span>
        </div>
        {!tablesExist.itemsTable && (
          <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold">
            Tip: Run &apos;Copy Supabase SQL&apos; in Supabase SQL editor to create persistent cloud tables.
          </span>
        )}
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('images')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'images'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ImageIcon size={18} />
          Study Charts ({items.filter((i) => i.type === 'image').length})
        </button>

        <button
          onClick={() => setActiveTab('notices')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'notices'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bell size={18} />
          Notices ({items.filter((i) => i.type === 'notice').length})
        </button>

        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'announcements'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Megaphone size={18} />
          Announcements ({items.filter((i) => i.type === 'announcement').length})
        </button>

        <button
          onClick={() => setActiveTab('tips')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'tips'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lightbulb size={18} />
          Study Tips ({items.filter((i) => i.type === 'study_tip').length})
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'chat'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare size={18} />
          Live Chat Monitor ({messages.length})
        </button>
      </div>

      {/* TAB CONTENT: CHAT MONITOR */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Stream */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[650px]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-indigo-600" />
                <span className="font-bold text-slate-800 text-sm">Live 30-Minute Chat Stream</span>
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                  {messages.length} active
                </span>
              </div>
              <span className="text-xs text-slate-400">Auto-expires after 30 minutes</span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                  <MessageSquare size={48} className="mb-2 text-slate-300 stroke-[1.5]" />
                  <p className="font-medium text-slate-600">No active messages right now.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Messages automatically clear 30 minutes after they are sent.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="group flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-bold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                        {msg.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">{msg.username}</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            {msg.league_tier || 'Aspirant'}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                            <Clock size={11} />
                            {getRemainingMinutes(msg.created_at)}
                          </span>
                        </div>
                        <p className="text-slate-800 text-sm mt-1 break-words">{msg.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteMessage(msg)}
                      title="Delete Message"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick Emoji Toolbar & Chat Input */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
              <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-lg">
                <span className="text-xs text-slate-400 mr-1 font-medium">Quick Emojis:</span>
                {['👍', '🔥', '🎯', '👮‍♂️', '🇮🇳', '📚', '💪', '💯', '👏', '🙌'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmoji(emoji)}
                    className="p-1 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type an admin broadcast or response (text & emojis only)..."
                  maxLength={300}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !chatInput.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm transition-all"
                >
                  <Send size={16} />
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Chat Rules / Moderation Guide */}
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                <ShieldAlert size={18} className="text-amber-500" />
                Moderation Rules & Guidelines
              </h3>
              <ul className="text-xs text-slate-600 space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span><strong>30-Minute Auto-Expiry:</strong> All messages automatically clear after 30 minutes.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Text & Emojis Only:</strong> Media links, file uploads, and scripts are strictly rejected.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Admin Purge Control:</strong> Inappropriate or spam messages can be deleted instantly.</span>
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-5 rounded-2xl border border-indigo-100 text-xs text-slate-700">
              <h4 className="font-bold text-indigo-900 text-sm mb-2">💡 Admin Tip</h4>
              <p className="leading-relaxed">
                Use this channel to address candidate questions, provide quick study motivations, and share daily drill reminders in real time.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: POSTS / ITEMS (Images, Notices, Announcements, Tips) */}
      {activeTab !== 'chat' && (
        <div className="space-y-4">
          {/* Search bar & count */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search by title or badge tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium self-end sm:self-auto">
              Total items: {filteredItems.length}
            </div>
          </div>

          {/* IMAGES GRID */}
          {activeTab === 'images' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col ${
                    item.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
                  }`}
                >
                  <div className="relative h-48 bg-slate-100 overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ImageIcon size={40} />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                      <span className="bg-indigo-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shadow-sm">
                        {item.badge_tag || 'Chart'}
                      </span>
                      {item.is_pinned && (
                        <span className="bg-violet-600 text-white font-bold text-[11px] px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                          <Pin size={11} /> Pinned
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base line-clamp-2">{item.title}</h3>
                      {item.content && (
                        <p className="text-slate-500 text-xs mt-1.5 line-clamp-3 leading-relaxed">
                          {item.content}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() => handleToggleActive(item)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                          item.is_active
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Power size={13} />
                        {item.is_active ? 'Active' : 'Inactive'}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* NOTICES, ANNOUNCEMENTS, TIPS LIST */}
          {activeTab !== 'images' && (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white p-5 rounded-2xl border hover:border-indigo-200 transition-all shadow-sm flex flex-col sm:flex-row items-start justify-between gap-4 ${
                    item.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
                  }`}
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-bold text-xs px-2.5 py-0.5 rounded-md">
                        {item.badge_tag || 'Notice'}
                      </span>
                      {item.is_pinned && (
                        <span className="bg-violet-50 text-violet-700 border border-violet-200 font-bold text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Pin size={11} /> Pinned
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-medium">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('en-US') : ''}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>

                    {item.content && (
                      <p className="text-slate-600 text-sm leading-relaxed">{item.content}</p>
                    )}

                    {item.action_url && (
                      <a
                        href={item.action_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-1"
                      >
                        Learn more / external link <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      onClick={() => handleToggleActive(item)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                        item.is_active
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Power size={13} />
                      {item.is_active ? 'Active' : 'Inactive'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredItems.length === 0 && !loading && (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-sm">No items found in this section.</p>
              <button
                onClick={() => handleOpenCreateModal()}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-all shadow-sm"
              >
                + Create First Post
              </button>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h2 className="font-bold text-slate-900 text-lg">
                {editingItem ? 'Edit Community Post' : 'Create Community Post'}
              </h2>
              <button
                onClick={() => setShowItemModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Post Type</label>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  <option value="image">Study Chart / Poster (Image)</option>
                  <option value="notice">Official Notice</option>
                  <option value="announcement">Announcement</option>
                  <option value="study_tip">Study Tip / Quick Formula</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Maharashtra Police Bharti Syllabus Map"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {itemType === 'image' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Image URL *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/poster.jpg"
                    value={itemImageUrl}
                    onChange={(e) => setItemImageUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  {itemImageUrl && (
                    <div className="mt-2 h-36 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                      <img src={itemImageUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Content / Description</label>
                <textarea
                  rows={3}
                  placeholder="Detailed description, instructions, or exam guidelines..."
                  value={itemContent}
                  onChange={(e) => setItemContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Badge Tag</label>
                <input
                  type="text"
                  placeholder="e.g., Important"
                  value={itemBadgeTag}
                  onChange={(e) => setItemBadgeTag(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {BADGE_SUGGESTIONS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setItemBadgeTag(tag)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition-all font-medium border border-transparent hover:border-indigo-200"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Action / External URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={itemActionUrl}
                  onChange={(e) => setItemActionUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={itemIsPinned}
                    onChange={(e) => setItemIsPinned(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  Pin to Top
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={itemIsActive}
                    onChange={(e) => setItemIsActive(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  Keep Active (Visible to students)
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                >
                  {savingItem ? 'Saving...' : 'Save Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
