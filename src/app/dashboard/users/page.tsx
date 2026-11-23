'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Edit2, Trash2, Heart, Zap, Flame, X, Check, AlertTriangle, ShieldCheck, UserCheck } from 'lucide-react';

interface UserProfile {
  id: string;
  username: string | null;
  district?: string | null;
  total_xp: number;
  weekly_xp?: number;
  current_hearts: number;
  streak_count: number;
  is_admin: boolean;
  avatar_id?: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal states
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for editing
  const [formUsername, setFormUsername] = useState('');
  const [formDistrict, setFormDistrict] = useState('');
  const [formTotalXp, setFormTotalXp] = useState(0);
  const [formWeeklyXp, setFormWeeklyXp] = useState(0);
  const [formStreak, setFormStreak] = useState(0);
  const [formHearts, setFormHearts] = useState(5);
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formAvatarId, setFormAvatarId] = useState('avatar_01');

  // Fetch all users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    // Fallback if created_at ordering fails
    if (error) {
      console.warn('Could not order by created_at, falling back:', error);
      const fallback = await supabase
        .from('profiles')
        .select('*');
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && data) {
      setUsers(data as UserProfile[]);
    }
    setLoading(false);
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormUsername(user.username || '');
    setFormDistrict(user.district || 'Maharashtra');
    setFormTotalXp(user.total_xp || 0);
    setFormWeeklyXp(user.weekly_xp || 0);
    setFormStreak(user.streak_count || 0);
    setFormHearts(user.current_hearts !== undefined ? user.current_hearts : 5);
    setFormIsAdmin(Boolean(user.is_admin));
    setFormAvatarId(user.avatar_id || 'avatar_01');
    setShowDeleteConfirm(false);
    setFeedbackMsg(null);
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setShowDeleteConfirm(false);
    setFeedbackMsg(null);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    setFeedbackMsg(null);

    try {
      const { data, error } = await supabase.rpc('admin_update_user', {
        target_user_id: editingUser.id,
        p_username: formUsername.trim(),
        p_district: formDistrict.trim(),
        p_total_xp: Number(formTotalXp),
        p_weekly_xp: Number(formWeeklyXp),
        p_streak_count: Number(formStreak),
        p_current_hearts: Number(formHearts),
        p_is_admin: formIsAdmin,
        p_avatar_id: formAvatarId.trim(),
      });

      if (error) {
        setFeedbackMsg({ type: 'error', text: `Failed to update: ${error.message}` });
      } else if (data && data.success === false) {
        setFeedbackMsg({ type: 'error', text: `Failed: ${data.error || 'Unknown error'}` });
      } else {
        setFeedbackMsg({ type: 'success', text: 'User profile updated successfully!' });
        // Refresh local state list
        setUsers(prev => prev.map(u => u.id === editingUser.id ? {
          ...u,
          username: formUsername.trim(),
          district: formDistrict.trim(),
          total_xp: Number(formTotalXp),
          weekly_xp: Number(formWeeklyXp),
          streak_count: Number(formStreak),
          current_hearts: Number(formHearts),
          is_admin: formIsAdmin,
          avatar_id: formAvatarId.trim(),
        } : u));
        setTimeout(() => closeEditModal(), 1200);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error updating user' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!editingUser) return;
    setIsDeleting(true);
    setFeedbackMsg(null);

    try {
      const { data, error } = await supabase.rpc('admin_delete_user', {
        target_user_id: editingUser.id,
      });

      if (error) {
        setFeedbackMsg({ type: 'error', text: `Failed to delete: ${error.message}` });
      } else if (data && data.success === false) {
        setFeedbackMsg({ type: 'error', text: `Failed: ${data.error || 'Unknown error'}` });
      } else {
        setFeedbackMsg({ type: 'success', text: 'User and all associated data deleted permanently!' });
        setUsers(prev => prev.filter(u => u.id !== editingUser.id));
        setTimeout(() => closeEditModal(), 1000);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error deleting user' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter users instantly based on search input
  const filteredUsers = users.filter(user => 
    (user.username?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (user.district?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (user.id?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">User Management</h2>
          <p className="text-gray-600 mt-1">Total control over players, XP, streaks, hearts, roles, and account records.</p>
        </div>
        <div className="text-sm font-semibold px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg">
          {users.length} Total Users Registered
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center gap-3">
        <Search className="text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Search by username, district, or user UUID..." 
          className="flex-1 outline-none text-gray-700 bg-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 text-sm">
            Clear
          </button>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm">
              <th className="p-4 font-medium">User Profile</th>
              <th className="p-4 font-medium">District</th>
              <th className="p-4 font-medium">Gamification Stats</th>
              <th className="p-4 font-medium">Role</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-500">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-2"></div>
                  <div>Loading players from database...</div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-500">
                  No users found matching "{search}".
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center justify-center font-medium text-sm">
                        {user.username ? user.username.substring(0, 1).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{user.username || 'Anonymous Player'}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {user.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-600">
                      {user.district || 'Maharashtra'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      <div className="font-medium text-slate-900">{(user.total_xp || 0).toLocaleString()} XP</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {user.current_hearts ?? 5} hearts · {user.streak_count || 0} day streak
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium ${user.is_admin ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {user.is_admin ? 'Admin' : 'Player'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => openEditModal(user)}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-1"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT USER MODAL (TOTAL CONTROL) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xl font-bold shadow">
                  {formUsername ? formUsername.substring(0, 1).toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Edit User & Total Control</h3>
                  <div className="text-xs text-gray-400 font-mono">ID: {editingUser.id}</div>
                </div>
              </div>
              <button 
                onClick={closeEditModal} 
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {feedbackMsg && (
                <div className={`p-4 rounded-xl text-sm flex items-center gap-2 font-medium ${
                  feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {feedbackMsg.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* 1. Basic Profile Info */}
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Profile Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Username</label>
                    <input 
                      type="text" 
                      className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-gray-800"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">District / Region</label>
                    <input 
                      type="text" 
                      className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-gray-800"
                      value={formDistrict}
                      onChange={(e) => setFormDistrict(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Gamification Control: XP, Streaks, Hearts */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">Gamification Economy (Total Control)</h4>
                
                {/* Total XP & Weekly XP */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-yellow-50/50 p-4 rounded-xl border border-yellow-100">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-yellow-800 flex items-center gap-1">
                        <Zap size={14} className="text-yellow-600 fill-yellow-600" /> Total XP
                      </label>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setFormTotalXp(prev => prev + 100)}
                          className="px-2 py-0.5 bg-yellow-200 text-yellow-900 rounded text-[11px] font-bold hover:bg-yellow-300"
                        >+100</button>
                        <button 
                          type="button" 
                          onClick={() => setFormTotalXp(prev => prev + 500)}
                          className="px-2 py-0.5 bg-yellow-200 text-yellow-900 rounded text-[11px] font-bold hover:bg-yellow-300"
                        >+500</button>
                      </div>
                    </div>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 rounded-lg border border-yellow-200 bg-white font-bold text-gray-900 outline-none"
                      value={formTotalXp}
                      onChange={(e) => setFormTotalXp(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-xs font-bold text-blue-800 mb-1">Weekly XP (League Standings)</label>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white font-bold text-gray-900 outline-none"
                      value={formWeeklyXp}
                      onChange={(e) => setFormWeeklyXp(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {/* Streak Days & Hearts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Streak Count */}
                  <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-orange-800 flex items-center gap-1">
                        <Flame size={14} className="text-orange-600 fill-orange-600" /> Streak Count (Days)
                      </label>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setFormStreak(prev => prev + 1)}
                          className="px-2 py-0.5 bg-orange-200 text-orange-900 rounded text-[11px] font-bold hover:bg-orange-300"
                        >+1d</button>
                        <button 
                          type="button" 
                          onClick={() => setFormStreak(prev => prev + 7)}
                          className="px-2 py-0.5 bg-orange-200 text-orange-900 rounded text-[11px] font-bold hover:bg-orange-300"
                        >+7d</button>
                        <button 
                          type="button" 
                          onClick={() => setFormStreak(0)}
                          className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[11px] font-bold hover:bg-red-200"
                        >Reset</button>
                      </div>
                    </div>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 bg-white font-bold text-gray-900 outline-none"
                      value={formStreak}
                      onChange={(e) => setFormStreak(Number(e.target.value) || 0)}
                    />
                  </div>

                  {/* Current Hearts */}
                  <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-red-800 flex items-center gap-1">
                        <Heart size={14} className="text-red-600 fill-red-600" /> Current Hearts
                      </label>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setFormHearts(5)}
                          className="px-2 py-0.5 bg-red-200 text-red-900 rounded text-[11px] font-bold hover:bg-red-300"
                        >Set 5</button>
                        <button 
                          type="button" 
                          onClick={() => setFormHearts(25)}
                          className="px-2 py-0.5 bg-red-200 text-red-900 rounded text-[11px] font-bold hover:bg-red-300"
                        >Set 25 (VIP)</button>
                        <button 
                          type="button" 
                          onClick={() => setFormHearts(0)}
                          className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[11px] font-bold hover:bg-gray-300"
                        >0</button>
                      </div>
                    </div>
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white font-bold text-gray-900 outline-none"
                      value={formHearts}
                      onChange={(e) => setFormHearts(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Role & Permissions */}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <div className="text-sm font-bold text-gray-900">Admin Privileges</div>
                  <div className="text-xs text-gray-500">Allow this user to access the dashboard and administrative tools.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formIsAdmin}
                    onChange={(e) => setFormIsAdmin(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* 4. Danger Zone: Delete User & All Data */}
              <div className="pt-4 border-t border-gray-200">
                <div className="p-4 rounded-xl border border-red-200 bg-red-50/40">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-red-800 flex items-center gap-1.5">
                        <AlertTriangle size={16} /> Danger Zone: Permanent Account Deletion
                      </div>
                      <div className="text-xs text-red-600 mt-1">
                        Permanently deletes this user, their auth login, progress, streaks, hearts, test records, and chats.
                      </div>
                    </div>
                    {!showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                        Delete User
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={handleDeleteUser}
                          className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"
                        >
                          {isDeleting ? 'Deleting...' : 'Confirm Purge All'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
              <button 
                type="button"
                onClick={closeEditModal}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
              <button 
                type="button"
                disabled={isSaving}
                onClick={handleSaveUser}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
              >
                {isSaving ? 'Saving Changes...' : 'Save All Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
