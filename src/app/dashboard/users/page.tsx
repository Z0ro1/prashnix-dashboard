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
    <div className="max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-6 gap-2">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 tracking-tight">Learner accounts</h1>
          <p className="text-sm text-slate-500 mt-1">Review student profiles, inspect progress and streaks, and manage administrative permissions.</p>
        </div>
        <div className="text-xs text-slate-500 font-normal">
          {users.length} registered {users.length === 1 ? 'learner' : 'learners'}
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 mb-6 flex items-center gap-2.5">
        <Search className="text-slate-400 shrink-0" size={18} />
        <input 
          type="text" 
          placeholder="Search by username, district, or user UUID..." 
          className="flex-1 outline-none text-slate-900 bg-transparent text-sm placeholder-slate-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-0.5 bg-slate-100 rounded">
            Clear
          </button>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-none">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-500 text-xs">
              <th className="px-4 py-3 font-medium">Learner</th>
              <th className="px-4 py-3 font-medium">District</th>
              <th className="px-4 py-3 font-medium">Progress & streak</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-500 text-sm">
                  Loading learner accounts...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-500 text-sm">
                  No learner accounts found matching "{search}".
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg flex items-center justify-center font-medium text-xs shrink-0">
                        {user.username ? user.username.substring(0, 1).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900">{user.username || 'Anonymous Player'}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {user.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-slate-600">
                      {user.district || 'Maharashtra'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-sm">
                      <div className="font-medium text-slate-900">{(user.total_xp || 0).toLocaleString()} XP</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {user.current_hearts ?? 5} hearts · {user.streak_count || 0} day streak
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      user.is_admin ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {user.is_admin ? 'Admin' : 'Player'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button 
                      onClick={() => openEditModal(user)}
                      className="text-xs font-medium text-slate-800 hover:text-slate-950 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition-colors bg-white"
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

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg flex items-center justify-center font-medium text-base shrink-0">
                  {formUsername ? formUsername.substring(0, 1).toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 className="text-base font-medium text-slate-900">Edit player profile</h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{editingUser.id}</div>
                </div>
              </div>
              <button 
                onClick={closeEditModal} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {feedbackMsg && (
                <div className={`p-4 rounded-xl text-sm flex items-center gap-2 font-medium ${
                  feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {feedbackMsg.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* 1. Basic Profile Info */}
              <div>
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Profile details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Username</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 bg-white transition-colors"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">District</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-slate-400 outline-none text-sm text-slate-900 bg-white transition-colors"
                      value={formDistrict}
                      onChange={(e) => setFormDistrict(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Gamification Control: XP, Streaks, Hearts */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Learning statistics</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Total XP */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700">Total XP</label>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setFormTotalXp(prev => prev + 100)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >+100</button>
                        <button 
                          type="button" 
                          onClick={() => setFormTotalXp(prev => prev + 500)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >+500</button>
                      </div>
                    </div>
                    <input 
                      type="number" 
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 outline-none focus:border-slate-400"
                      value={formTotalXp}
                      onChange={(e) => setFormTotalXp(Number(e.target.value) || 0)}
                    />
                  </div>

                  {/* Weekly XP */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Weekly XP (league)</label>
                    <input 
                      type="number" 
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 outline-none focus:border-slate-400"
                      value={formWeeklyXp}
                      onChange={(e) => setFormWeeklyXp(Number(e.target.value) || 0)}
                    />
                  </div>

                  {/* Streak Count */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700">Streak (days)</label>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setFormStreak(prev => prev + 1)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >+1d</button>
                        <button 
                          type="button" 
                          onClick={() => setFormStreak(prev => prev + 7)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >+7d</button>
                        <button 
                          type="button" 
                          onClick={() => setFormStreak(0)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >Reset</button>
                      </div>
                    </div>
                    <input 
                      type="number" 
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 outline-none focus:border-slate-400"
                      value={formStreak}
                      onChange={(e) => setFormStreak(Number(e.target.value) || 0)}
                    />
                  </div>

                  {/* Current Hearts */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700">Hearts (0 to 5)</label>
                      <div className="flex gap-1">
                        <button 
                          type="button" 
                          onClick={() => setFormHearts(5)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >Full (5)</button>
                        <button 
                          type="button" 
                          onClick={() => setFormHearts(0)}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-100 transition-colors"
                        >0</button>
                      </div>
                    </div>
                    <input 
                      type="number" 
                      min={0}
                      max={5}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-900 outline-none focus:border-slate-400"
                      value={formHearts}
                      onChange={(e) => setFormHearts(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Role & Permissions */}
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">Administrator access</div>
                  <div className="text-xs text-slate-500 mt-0.5">Grant this account permission to use the admin portal and edit curriculum.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formIsAdmin}
                    onChange={(e) => setFormIsAdmin(e.target.checked)}
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                </label>
              </div>

              {/* 4. Danger Zone: Delete User & All Data */}
              <div className="p-4 border border-rose-200/80 rounded-xl bg-rose-50/20">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-rose-950">Delete learner account</div>
                    <div className="text-xs text-rose-700/80 mt-0.5">Permanently purge this player's learning records, streak, and authentication credentials.</div>
                  </div>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="self-start sm:self-auto px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      Delete user
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={handleDeleteUser}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? 'Deleting...' : 'Confirm purge'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/40 rounded-b-2xl">
              <button 
                type="button"
                onClick={closeEditModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-transparent rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={isSaving}
                onClick={handleSaveUser}
                className="px-4 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
