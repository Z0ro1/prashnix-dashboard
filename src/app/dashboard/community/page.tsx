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
  checkCommunityTablesExist,
  fetchCommunityItems,
  saveCommunityItem,
  deleteCommunityItem,
  toggleCommunityItemActive,
  fetchRecentMessages,
  sendCommunityMessage,
  deleteCommunityMessage,
  uploadCommunityImage,
} from '@/lib/communityService';
import ImageUploadCrop, { FitMode } from '@/components/ImageUploadCrop';
import { supabase } from '@/lib/supabase';

type TabType = 'images' | 'notices' | 'announcements' | 'tips' | 'chat';

const BADGE_SUGGESTIONS = [
  'मकर संक्रांत',
  'शिवजयंती',
  'होळी',
  'महाराष्ट्र दिन',
  'दिवाळी',
  'पोलीस भरती',
  'दैनिक सराव',
  'परीक्षेची तारीख',
  'महत्त्वाची सूचना',
  'चालू घडामोडी',
];

export default function CommunityPage() {
  const { toast, confirm } = useFeedback();

  const [activeTab, setActiveTab] = useState<TabType>('images');
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState({ messagesTable: false, itemsTable: false });
  const [searchQuery, setSearchQuery] = useState('');

  // Item Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CommunityItem | null>(null);
  const [itemType, setItemType] = useState<'image' | 'notice' | 'announcement' | 'study_tip'>('image');
  const [itemTitle, setItemTitle] = useState('');
  const [itemContent, setItemContent] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [selectedFileBlob, setSelectedFileBlob] = useState<Blob | null>(null);
  const [itemFitMode, setItemFitMode] = useState<FitMode>('cover');
  const [itemBadgeTag, setItemBadgeTag] = useState('मकर संक्रांत');
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
    setSelectedFileBlob(null);
    setItemFitMode('cover');
    setItemBadgeTag('मकर संक्रांत');
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
    setSelectedFileBlob(null);
    setItemFitMode((item.fit_mode as FitMode) || 'cover');
    setItemBadgeTag(item.badge_tag || 'नवीन');
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
    if (itemType === 'image' && !itemImageUrl.trim() && !selectedFileBlob) {
      toast('error', 'Image is required', 'Please select or upload an image file from your computer or provide a URL.');
      return;
    }

    setSavingItem(true);
    try {
      let finalImageUrl = itemImageUrl.trim();

      // If user uploaded a computer file or cropped blob, upload it now
      if (itemType === 'image' && selectedFileBlob) {
        finalImageUrl = await uploadCommunityImage(selectedFileBlob);
      }

      await saveCommunityItem({
        id: editingItem?.id,
        type: itemType,
        title: itemTitle.trim(),
        content: itemContent.trim(),
        image_url: finalImageUrl || undefined,
        badge_tag: itemBadgeTag.trim() || 'नवीन',
        action_url: itemActionUrl.trim() || undefined,
        fit_mode: itemFitMode,
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
      await sendCommunityMessage(chatInput, 'Prashnix admin', 'champion');
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
      title: 'Delete message',
      message: `Delete message from "${msg.username}"?`,
      confirmText: 'Delete',
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
      {/* Community v2 Under Active Development Banner */}
      <div className="bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-slate-500 shrink-0" size={18} />
          <span className="text-sm">
            Community moderation v2 in progress. Features are currently restricted while student permissions are upgraded.
          </span>
        </div>
        <span className="text-xs bg-slate-200 text-slate-700 font-medium px-2 py-0.5 rounded">v2 In Progress</span>
      </div>

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium text-slate-900">Community moderation</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              Live sync
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Manage live chat moderation, study posters, official notices, and announcements.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={loadAllData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {activeTab !== 'chat' && (
            <button
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              <Plus size={16} />
              Create post
            </button>
          )}
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('images')}
          className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'images'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ImageIcon size={16} />
          Community feed ({items.filter((i) => i.type === 'image').length})
        </button>

        <button
          onClick={() => setActiveTab('notices')}
          className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'notices'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Bell size={16} />
          Notices ({items.filter((i) => i.type === 'notice').length})
        </button>

        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'announcements'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Megaphone size={16} />
          Announcements ({items.filter((i) => i.type === 'announcement').length})
        </button>

        <button
          onClick={() => setActiveTab('tips')}
          className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'tips'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Lightbulb size={16} />
          Study tips ({items.filter((i) => i.type === 'study_tip').length})
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'chat'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <MessageSquare size={16} />
          Live chat ({messages.length})
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
                          <span className="font-medium text-sm text-slate-900">{msg.username}</span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {msg.league_tier || 'Aspirant'}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock size={11} />
                            {getRemainingMinutes(msg.created_at)}
                          </span>
                        </div>
                        <p className="text-slate-800 text-sm mt-1 break-words">{msg.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteMessage(msg)}
                      title="Delete message"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1 rounded transition-colors flex-shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-slate-200 bg-white rounded-b-xl">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type an admin broadcast or announcement..."
                  maxLength={300}
                  className="flex-1 px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-slate-400 text-sm bg-white"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !chatInput.trim()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                >
                  <Send size={15} />
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Chat Rules / Moderation Guide */}
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <h3 className="font-medium text-slate-900 text-sm flex items-center gap-2 mb-3">
                <ShieldAlert size={16} className="text-slate-600" />
                Moderation rules and guidelines
              </h3>
              <ul className="text-xs text-slate-600 space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <span><strong>30-minute auto-expiry:</strong> All messages automatically clear after 30 minutes.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Text-only:</strong> Media links, file uploads, and scripts are strictly rejected.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Admin purge control:</strong> Inappropriate or spam messages can be deleted instantly.</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-xs text-slate-600">
              <h4 className="font-medium text-slate-900 text-sm mb-1.5">Administrative note</h4>
              <p className="leading-relaxed">
                Use this channel to address candidate questions, provide study updates, and share daily drill reminders in real time.
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
                  <div className="relative h-56 bg-slate-900 overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className={`w-full h-full ${
                          item.fit_mode === 'contain' ? 'object-contain' : 'object-cover'
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ImageIcon size={40} />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                      <span className="bg-indigo-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shadow-sm">
                        {item.badge_tag || 'Feed'}
                      </span>
                      {item.fit_mode && (
                        <span className="bg-black/70 backdrop-blur-sm text-white font-semibold text-[10px] px-2 py-0.5 rounded-md border border-white/20">
                          {item.fit_mode === 'contain' ? 'Fit (Contain)' : 'Fill (Cover)'}
                        </span>
                      )}
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
          <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400 bg-white"
                >
                  <option value="image">Community feed (posters and greetings)</option>
                  <option value="notice">Official notice</option>
                  <option value="announcement">Announcement</option>
                  <option value="study_tip">Study tip / formula</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder={
                    itemType === 'image'
                      ? 'e.g., मकर संक्रांतीच्या हार्दिक शुभेच्छा'
                      : 'e.g., Maharashtra Police Bharti syllabus map'
                  }
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>

              {itemType === 'image' && (
                <ImageUploadCrop
                  initialImageUrl={itemImageUrl}
                  initialFitMode={itemFitMode}
                  onImageChange={({ blob, previewUrl, fitMode }) => {
                    setSelectedFileBlob(blob);
                    setItemImageUrl(previewUrl);
                    setItemFitMode(fitMode);
                  }}
                />
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Content / Description</label>
                <textarea
                  rows={3}
                  placeholder="Detailed description, instructions, or exam guidelines..."
                  value={itemContent}
                  onChange={(e) => setItemContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Badge tag</label>
                <input
                  type="text"
                  placeholder="e.g., Important"
                  value={itemBadgeTag}
                  onChange={(e) => setItemBadgeTag(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
                />
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {BADGE_SUGGESTIONS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setItemBadgeTag(tag)}
                      className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-medium"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Action / External URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={itemActionUrl}
                  onChange={(e) => setItemActionUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={itemIsPinned}
                    onChange={(e) => setItemIsPinned(e.target.checked)}
                    className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-400"
                  />
                  Pin to top
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={itemIsActive}
                    onChange={(e) => setItemIsActive(e.target.checked)}
                    className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-400"
                  />
                  Active (visible to students)
                </label>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {savingItem ? 'Saving...' : 'Save post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
