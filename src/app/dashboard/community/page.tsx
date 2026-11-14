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
  'नवीन',
  'अति महत्त्वाचे',
  'परीक्षेची तारीख',
  'मैदानी चाचणी',
  'चालू घडामोडी',
  'साप्ताहिक टेस्ट',
  'निकाल जाहीर',
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
  const [itemBadgeTag, setItemBadgeTag] = useState('नवीन');
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
      toast('error', 'डेटा लोड करण्यास त्रुटी', errMsg);
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
    toast('success', 'SQL कॉपी झाले!', 'Supabase SQL Editor मध्ये पेस्ट करून Run करा.');
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
    setItemBadgeTag('नवीन');
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
      toast('error', 'शीर्षक आवश्यक आहे', 'कृपया शीर्षकाची नोंद करा.');
      return;
    }
    if (itemType === 'image' && !itemImageUrl.trim()) {
      toast('error', 'इमेज URL आवश्यक आहे', 'कृपया प्रतिमेची URL प्रविष्ट करा.');
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
        badge_tag: itemBadgeTag.trim() || 'नवीन',
        action_url: itemActionUrl.trim() || undefined,
        is_pinned: itemIsPinned,
        is_active: itemIsActive,
      });

      toast('success', editingItem ? 'बदल जतन झाले!' : 'नवीन पोस्ट तयार झाली!', itemTitle);
      setShowItemModal(false);
      await loadItems();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'जतन करण्यास त्रुटी', errMsg);
    } finally {
      setSavingItem(false);
    }
  };

  // Delete Item
  const handleDeleteItem = (item: CommunityItem) => {
    confirm({
      title: 'काढून टाकावे का?',
      message: `"${item.title}" कायमचे काढून टाकायचे आहे का?`,
      confirmText: 'होय, काढून टाका',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteCommunityItem(item.id);
          toast('success', 'यशस्वीरित्या काढून टाकले', item.title);
          await loadItems();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toast('error', 'काढून टाकण्यास त्रुटी', errMsg);
        }
      },
    });
  };

  // Toggle Active
  const handleToggleActive = async (item: CommunityItem) => {
    try {
      await toggleCommunityItemActive(item.id, !item.is_active);
      toast('info', item.is_active ? 'निष्क्रिय केले' : 'सक्रिय केले', item.title);
      await loadItems();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'स्थिती बदलण्यात त्रुटी', errMsg);
    }
  };

  // Send Admin Chat Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setSendingMsg(true);
    try {
      await sendCommunityMessage(chatInput, 'प्रशांतिक्स ॲडमिन 🛡️', 'champion');
      setChatInput('');
      toast('success', 'संदेश पाठवला', 'लाइव्ह चॅटमध्ये ३० मिनिटे दिसेल.');
      await loadMessages();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast('error', 'संदेश पाठवता आला नाही', errMsg);
    } finally {
      setSendingMsg(false);
    }
  };

  // Delete Chat Message
  const handleDeleteMessage = (msg: CommunityMessage) => {
    confirm({
      title: 'संदेश हटवावा का?',
      message: `"${msg.username}" चा संदेश चॅटमधून काढून टाकायचा आहे का?`,
      confirmText: 'होय, हटवा',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteCommunityMessage(msg.id);
          toast('success', 'संदेश हटवला', 'हा संदेश आता विद्यार्थ्यांना दिसणार नाही.');
          await loadMessages();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toast('error', 'संदेश हटवण्यात त्रुटी', errMsg);
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
    if (diffMs <= 0) return 'कालबाह्य';
    const mins = Math.ceil(diffMs / (60 * 1000));
    return `${mins} मि शिल्लक`;
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-pink-100 text-pink-700 rounded-xl">
              <MessageSquare size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">समुदाय केंद्र (Community Hub)</h1>
              <p className="text-gray-500 text-sm">
                थेट ३० मिनिटे लाइव्ह चॅट, अभ्यास चित्रे, अधिकृत सूचना आणि घोषणा व्यवस्थापन.
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
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {copiedSql ? <Check size={16} /> : <Copy size={16} />}
            {copiedSql ? 'SQL कॉपी झाले' : 'Copy Supabase SQL'}
          </button>

          <button
            onClick={loadAllData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            रिफ्रेश
          </button>

          {activeTab !== 'chat' && (
            <button
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-pink-600 text-white hover:bg-pink-700 shadow-sm transition-all"
            >
              <Plus size={18} />
              नवीन जोडा
            </button>
          )}
        </div>
      </div>

      {/* Storage Mode Notice */}
      <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-3 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Storage Mode:{' '}
            <strong className="text-gray-900">
              {tablesExist.itemsTable ? 'Supabase Table (community_items & messages)' : 'Local Resilient Fallback Active'}
            </strong>
          </span>
          <span className="text-gray-400">• ३०-मिनिटे ऑटो-एक्सपायरी चॅट सक्रिय</span>
        </div>
        {!tablesExist.itemsTable && (
          <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold">
            टीप: Supabase मध्ये टेबल तयार करण्यासाठी वरील &apos;Copy Supabase SQL&apos; बटण दाबा.
          </span>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('images')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'images'
              ? 'border-pink-600 text-pink-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ImageIcon size={18} />
          चित्रे व पोस्टर्स ({items.filter((i) => i.type === 'image').length})
        </button>

        <button
          onClick={() => setActiveTab('notices')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'notices'
              ? 'border-pink-600 text-pink-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Bell size={18} />
          सूचना ({items.filter((i) => i.type === 'notice').length})
        </button>

        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'announcements'
              ? 'border-pink-600 text-pink-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Megaphone size={18} />
          घोषणा ({items.filter((i) => i.type === 'announcement').length})
        </button>

        <button
          onClick={() => setActiveTab('tips')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'tips'
              ? 'border-pink-600 text-pink-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Lightbulb size={18} />
          चालू घडामोडी / टिप्स ({items.filter((i) => i.type === 'study_tip').length})
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'chat'
              ? 'border-pink-600 text-pink-600'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <MessageSquare size={18} />
          थेट चॅट नियंत्रण ({messages.length})
        </button>
      </div>

      {/* TAB CONTENT: CHAT MONITOR */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Stream */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 shadow-sm flex flex-col h-[650px]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-pink-600" />
                <span className="font-bold text-gray-800 text-sm">३०-मिनिटे थेट चॅट संदेश प्रवाह</span>
                <span className="bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                  {messages.length} सक्रिय संदेश
                </span>
              </div>
              <span className="text-xs text-gray-400">फक्त मजकूर आणि इमोजी अनुमत</span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                  <MessageSquare size={48} className="mb-2 text-gray-300 stroke-[1.5]" />
                  <p>सध्या कोणतेही सक्रिय संदेश नाहीत.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    संदेश ३० मिनिटांनंतर आपोआप नाहीसे होतात.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="group flex items-start justify-between gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-pink-200 hover:bg-pink-50/20 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                        {msg.username.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-gray-900">{msg.username}</span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            {msg.league_tier || 'स्पर्धक'}
                          </span>
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock size={11} />
                            {getRemainingMinutes(msg.created_at)}
                          </span>
                        </div>
                        <p className="text-gray-800 text-sm mt-1 break-words">{msg.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteMessage(msg)}
                      title="संदेश हटवा"
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick Emoji Toolbar & Chat Input */}
            <div className="p-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-lg">
                <span className="text-xs text-gray-400 mr-1 font-medium">जलद इमोजी:</span>
                {['👍', '🔥', '🎯', '👮‍♂️', '🇮🇳', '📚', '💪', '💯', '👏', '🙌'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addEmoji(emoji)}
                    className="p-1 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all"
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
                  placeholder="ॲडमिन संदेश किंवा घोषणा टाइप करा (फक्त मजकूर आणि इमोजी)..."
                  maxLength={300}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 text-sm bg-white"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !chatInput.trim()}
                  className="px-4 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm transition-all"
                >
                  <Send size={16} />
                  पाठवा
                </button>
              </form>
            </div>
          </div>

          {/* Chat Rules / Moderation Guide */}
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-3">
                <ShieldAlert size={18} className="text-amber-500" />
                चॅट नियम व सुरक्षा (Rules)
              </h3>
              <ul className="text-xs text-gray-600 space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span><strong>३० मिनिटांचा नियम:</strong> प्रत्येक संदेश पाठवल्यापासून बरोबर ३० मिनिटांनी आपोआप नष्ट होतो.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span><strong>फक्त मजकूर व इमोजी:</strong> लिंक्स, फाइल्स किंवा प्रतिमा चॅटमध्ये पाठवता येत नाहीत.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span><strong>ॲडमिन नियंत्रण:</strong> अनुचित संदेश एका क्लिकमध्ये तात्काळ हटवता येतो.</span>
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-pink-50 to-indigo-50 p-5 rounded-2xl border border-pink-100 text-xs text-gray-700">
              <h4 className="font-bold text-pink-900 text-sm mb-2">💡 ॲडमिन टीप</h4>
              <p className="leading-relaxed">
                विद्यार्थ्यांच्या अडचणी, अभ्यासाचे नियोजन आणि आजची तयारी यावर थेट मार्गदर्शन देण्यासाठी या लाइव्ह चॅटचा उपयोग करा.
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
              <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="शोधा (शीर्षक किंवा टॅग)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
              />
            </div>
            <div className="text-xs text-gray-500 font-medium self-end sm:self-auto">
              एकूण सापडलेले: {filteredItems.length}
            </div>
          </div>

          {/* IMAGES GRID */}
          {activeTab === 'images' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col ${
                    item.is_active ? 'border-gray-200/80' : 'border-gray-200 opacity-60'
                  }`}
                >
                  <div className="relative h-48 bg-gray-100 overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon size={40} />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                      <span className="bg-pink-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shadow-sm">
                        {item.badge_tag || 'इन्फोग्राफिक'}
                      </span>
                      {item.is_pinned && (
                        <span className="bg-indigo-600 text-white font-bold text-[11px] px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                          <Pin size={11} /> पिन केलेले
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base line-clamp-2">{item.title}</h3>
                      {item.content && (
                        <p className="text-gray-500 text-xs mt-1.5 line-clamp-3 leading-relaxed">
                          {item.content}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <button
                        onClick={() => handleToggleActive(item)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                          item.is_active
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Power size={13} />
                        {item.is_active ? 'सक्रिय' : 'निष्क्रिय'}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
                  className={`bg-white p-5 rounded-2xl border hover:border-pink-200 transition-all shadow-sm flex flex-col sm:flex-row items-start justify-between gap-4 ${
                    item.is_active ? 'border-gray-200/80' : 'border-gray-200 opacity-60'
                  }`}
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-pink-100 text-pink-700 font-bold text-xs px-2.5 py-0.5 rounded-md">
                        {item.badge_tag || 'सूचना'}
                      </span>
                      {item.is_pinned && (
                        <span className="bg-indigo-100 text-indigo-700 font-bold text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Pin size={11} /> पिन केलेले
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('mr-IN') : ''}
                      </span>
                    </div>

                    <h3 className="font-bold text-gray-900 text-base">{item.title}</h3>

                    {item.content && (
                      <p className="text-gray-600 text-sm leading-relaxed">{item.content}</p>
                    )}

                    {item.action_url && (
                      <a
                        href={item.action_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-1"
                      >
                        अधिक माहिती / लिंक पहा <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <button
                      onClick={() => handleToggleActive(item)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                        item.is_active
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Power size={13} />
                      {item.is_active ? 'सक्रिय' : 'बंद'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200/80">
              <p className="text-gray-400 text-sm">येथे कोणतीही माहिती उपलब्ध नाही.</p>
              <button
                onClick={() => handleOpenCreateModal()}
                className="mt-3 px-4 py-2 bg-pink-600 text-white rounded-xl text-xs font-semibold hover:bg-pink-700"
              >
                + पहिली पोस्ट तयार करा
              </button>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="font-bold text-gray-900 text-lg">
                {editingItem ? 'पोस्ट संपादित करा' : 'नवीन समुदाय पोस्ट तयार करा'}
              </h2>
              <button
                onClick={() => setShowItemModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">प्रकार (Type)</label>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 bg-white"
                >
                  <option value="image">अभ्यास चित्र / पोस्टर (Image)</option>
                  <option value="notice">सूचना (Notice)</option>
                  <option value="announcement">घोषणा (Announcement)</option>
                  <option value="study_tip">चालू घडामोडी / अभ्यास सूत्रे (Study Tip)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">शीर्षक (Title) *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. महाराष्ट्र पोलीस भरती अभ्यासक्रम तक्ता"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              {itemType === 'image' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">प्रतिमा URL (Image URL) *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/poster.jpg"
                    value={itemImageUrl}
                    onChange={(e) => setItemImageUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                  {itemImageUrl && (
                    <div className="mt-2 h-36 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                      <img src={itemImageUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">तपशील / वर्णन (Content)</label>
                <textarea
                  rows={3}
                  placeholder="तपशीलवार माहिती..."
                  value={itemContent}
                  onChange={(e) => setItemContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">बॅज टॅग (Badge Tag)</label>
                <input
                  type="text"
                  placeholder="उदा. अति महत्त्वाचे"
                  value={itemBadgeTag}
                  onChange={(e) => setItemBadgeTag(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {BADGE_SUGGESTIONS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setItemBadgeTag(tag)}
                      className="text-[11px] px-2 py-0.5 rounded bg-gray-100 hover:bg-pink-100 hover:text-pink-700 text-gray-600 transition-all"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">कृती लिंक (Action / External URL)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={itemActionUrl}
                  onChange={(e) => setItemActionUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={itemIsPinned}
                    onChange={(e) => setItemIsPinned(e.target.checked)}
                    className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
                  />
                  वर पिन करा (Pin to top)
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={itemIsActive}
                    onChange={(e) => setItemIsActive(e.target.checked)}
                    className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
                  />
                  सक्रिय ठेवा (Active)
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                >
                  {savingItem ? 'जतन करत आहे...' : 'जतन करा'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
