import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAccountsApiV1AdminAccountsGet,
  createAccountApiV1AdminAccountsPost,
  updateAccountApiV1AdminAccountsAccountIdPatch,
  resetPasswordApiV1AdminAccountsAccountIdResetPasswordPost,
  listAdminRoomsApiV1AdminRoomsGet,
  closeRoomAdminApiV1AdminRoomsRoomIdClosePost,
  listAdminMatchesApiV1AdminMatchesGet,
  voidMatchApiV1AdminMatchesMatchIdVoidPost,
  listAdminChatsApiV1AdminChatsGet,
  listAuditLogsApiV1AdminAuditLogsGet,
} from '../contracts/rest';
import type { AccountRole, AccountStatus } from '../contracts/rest/types.gen';
import type { AdminAccountListResponse, AuditLogResponse } from '../contracts/rest/types.gen';
import {
  Users,
  Shield,
  Layers,
  FileText,
  MessageSquare,
  UserPlus,
  KeyRound,
  XCircle,
  Eye,
  EyeOff,
  Search,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export function AdminConsole() {
  const [activeSubTab, setActiveSubTab] = useState<
    'accounts' | 'rooms' | 'matches' | 'chats' | 'audits'
  >('accounts');
  const queryClient = useQueryClient();
  const { t } = useTranslation(['admin', 'common']);
  const enumLabel = useEnumLabel();
  const { formatDateTime } = useFormatters();

  // Dialog/Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  // Form Fields
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountRole>('player');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Accounts Query
  const { data: accountsData, isLoading: isAccountsLoading } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => listAccountsApiV1AdminAccountsGet({ throwOnError: true }),
    enabled: activeSubTab === 'accounts',
  });

  // 2. Rooms Query
  const { data: roomsData, isLoading: isRoomsLoading } = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: () => listAdminRoomsApiV1AdminRoomsGet({ throwOnError: true }),
    enabled: activeSubTab === 'rooms',
  });

  // 3. Matches Query
  const { data: matchesData, isLoading: isMatchesLoading } = useQuery({
    queryKey: ['admin-matches'],
    queryFn: () => listAdminMatchesApiV1AdminMatchesGet({ throwOnError: true }),
    enabled: activeSubTab === 'matches',
  });

  // 4. Chats Query
  const { data: chatsData, isLoading: isChatsLoading } = useQuery({
    queryKey: ['admin-chats'],
    queryFn: () => listAdminChatsApiV1AdminChatsGet({ throwOnError: true }),
    enabled: activeSubTab === 'chats',
  });

  // 5. Audits Query
  const { data: auditsData, isLoading: isAuditsLoading } = useQuery({
    queryKey: ['admin-audits'],
    queryFn: () => listAuditLogsApiV1AdminAuditLogsGet({ throwOnError: true }),
    enabled: activeSubTab === 'audits',
  });

  // Create Account Mutation
  const createAccountMutation = useMutation({
    mutationFn: () =>
      createAccountApiV1AdminAccountsPost({
        body: {
          login_name: loginName.trim(),
          password: password,
          display_name: displayName.trim() || null,
          role,
        },
        throwOnError: true,
      }),
    onSuccess: () => {
      setShowCreateModal(false);
      setLoginName('');
      setDisplayName('');
      setPassword('');
      setRole('player');
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });
    },
    onError: (err: unknown) => {
      setErrorMsg(errorMessage(err, t('admin:createModal.createFailed')));
    },
  });

  // Reset Password Mutation
  const resetPasswordMutation = useMutation({
    mutationFn: (args: { accountId: number; pass: string }) =>
      resetPasswordApiV1AdminAccountsAccountIdResetPasswordPost({
        path: { account_id: args.accountId },
        body: { password: args.pass },
        throwOnError: true,
      }),
    onSuccess: () => {
      setShowResetModal(false);
      setNewPassword('');
      setSelectedAccountId(null);
      setErrorMsg(null);
      alert(t('admin:resetModal.success'));
    },
    onError: (err: unknown) => {
      setErrorMsg(errorMessage(err, t('admin:resetModal.failed')));
    },
  });

  // Change Role/Status Mutation
  const updateAccountMutation = useMutation({
    mutationFn: (args: {
      accountId: number;
      payload: { role?: AccountRole; status?: AccountStatus };
    }) =>
      updateAccountApiV1AdminAccountsAccountIdPatch({
        path: { account_id: args.accountId },
        body: args.payload,
        throwOnError: true,
      }),
    onSuccess: (_data, args) => {
      if (args.payload.status === 'deleted') {
        queryClient.setQueryData<AdminAccountListResponse | undefined>(
          ['admin-accounts'],
          (current) =>
            current
              ? {
                  ...current,
                  items: current.items.filter((account) => account.account_id !== args.accountId),
                  total: Math.max(0, current.total - 1),
                }
              : current,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audits'] });
    },
    onError: (err: unknown) => {
      alert(errorMessage(err, t('admin:accounts.updateFailed')));
    },
  });

  // Close Room Mutation
  const closeRoomMutation = useMutation({
    mutationFn: (roomId: string) =>
      closeRoomAdminApiV1AdminRoomsRoomIdClosePost({
        path: { room_id: roomId },
        throwOnError: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audits'] });
    },
  });

  // Void Match Mutation
  const voidMatchMutation = useMutation({
    mutationFn: (matchId: string) =>
      voidMatchApiV1AdminMatchesMatchIdVoidPost({
        path: { match_id: matchId },
        body: { reason: 'Admin voided match' },
        throwOnError: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-matches'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audits'] });
      alert(t('admin:matches.voidSuccess'));
    },
    onError: (err: unknown) => {
      alert(errorMessage(err, t('admin:matches.voidFailed')));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || !password) {
      setErrorMsg(t('admin:createModal.missingFields'));
      return;
    }
    createAccountMutation.mutate();
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !newPassword.trim()) {
      setErrorMsg(t('admin:resetModal.missingPassword'));
      return;
    }
    resetPasswordMutation.mutate({ accountId: selectedAccountId, pass: newPassword.trim() });
  };

  const filteredAccounts =
    accountsData?.items.filter(
      (acc) =>
        acc.login_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (acc.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()),
    ) || [];

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-6 md:gap-8 font-sans text-slate-100 max-w-6xl mx-auto w-full pb-12">
      {/* Sidebar Sub Tab Selector */}
      <aside className="w-full md:w-56 shrink-0 flex flex-col gap-2">
        <h2 className="text-xs uppercase font-black text-slate-500 tracking-wider px-3 mb-2">
          {t('admin:panelTitle')}
        </h2>

        <button
          onClick={() => setActiveSubTab('accounts')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'accounts'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/20'
              : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" />
          {t('admin:tabs.accounts')}
        </button>

        <button
          onClick={() => setActiveSubTab('rooms')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'rooms'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/20'
              : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          {t('admin:tabs.rooms')}
        </button>

        <button
          onClick={() => setActiveSubTab('matches')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'matches'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/20'
              : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          {t('admin:tabs.matches')}
        </button>

        <button
          onClick={() => setActiveSubTab('chats')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'chats'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/20'
              : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          {t('admin:tabs.chats')}
        </button>

        <button
          onClick={() => setActiveSubTab('audits')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'audits'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-950/20'
              : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          {t('admin:tabs.audits')}
        </button>
      </aside>

      {/* Main console content */}
      <main className="flex-1 min-w-0">
        {/* Sub-tab: Accounts */}
        {activeSubTab === 'accounts' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('admin:accounts.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-9 pr-4 bg-slate-950/60 border border-slate-800 focus:border-purple-500/50 rounded-xl text-xs outline-none transition-all placeholder-slate-650"
                />
              </div>

              <button
                onClick={() => {
                  setErrorMsg(null);
                  setShowCreateModal(true);
                }}
                className="h-10 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
              >
                <UserPlus className="h-4 w-4" />
                {t('admin:accounts.create')}
              </button>
            </div>

            {isAccountsLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
                {t('admin:accounts.empty')}
              </div>
            ) : (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/20">
                        <th className="py-3.5 px-4">{t('admin:accounts.columns.accountId')}</th>
                        <th className="py-3.5 px-4">{t('admin:accounts.columns.loginName')}</th>
                        <th className="py-3.5 px-4">{t('admin:accounts.columns.displayName')}</th>
                        <th className="py-3.5 px-4">{t('admin:accounts.columns.role')}</th>
                        <th className="py-3.5 px-4">{t('admin:accounts.columns.status')}</th>
                        <th className="py-3.5 px-4 text-right">
                          {t('admin:accounts.columns.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-xs text-slate-350">
                      {filteredAccounts.map((acc) => (
                        <tr key={acc.account_id} className="hover:bg-slate-900/10">
                          <td className="py-3 px-4 font-mono">{acc.account_id}</td>
                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {acc.login_name}
                          </td>
                          <td className="py-3 px-4">
                            {acc.display_name || t('admin:accounts.noDisplayName')}
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={acc.role}
                              onChange={(e) =>
                                updateAccountMutation.mutate({
                                  accountId: acc.account_id,
                                  payload: { role: e.target.value as AccountRole },
                                })
                              }
                              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none"
                            >
                              <option value="player">
                                {t('admin:accounts.roleOptions.player')}
                              </option>
                              <option value="administrator">
                                {t('admin:accounts.roleOptions.administrator')}
                              </option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={acc.status}
                              onChange={(e) =>
                                updateAccountMutation.mutate({
                                  accountId: acc.account_id,
                                  payload: { status: e.target.value as AccountStatus },
                                })
                              }
                              className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300 outline-none"
                            >
                              <option value="active">
                                {t('admin:accounts.statusOptions.active')}
                              </option>
                              <option value="disabled">
                                {t('admin:accounts.statusOptions.disabled')}
                              </option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setSelectedAccountId(acc.account_id);
                                setErrorMsg(null);
                                setShowResetModal(true);
                              }}
                              className="h-8 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700/50 text-[10px] font-bold uppercase transition-all cursor-pointer"
                            >
                              {t('admin:accounts.resetPass')}
                            </button>
                            <button
                              type="button"
                              aria-label={t('admin:accounts.deleteAccount')}
                              title={t('admin:accounts.deleteAccount')}
                              onClick={() => {
                                if (
                                  confirm(
                                    t('admin:accounts.confirmDelete', { name: acc.login_name }),
                                  )
                                ) {
                                  updateAccountMutation.mutate({
                                    accountId: acc.account_id,
                                    payload: { status: 'deleted' },
                                  });
                                }
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-900/50 bg-rose-950/30 text-rose-400 transition-all hover:bg-rose-900/50 hover:text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Active Rooms */}
        {activeSubTab === 'rooms' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">
              {t('admin:rooms.title')}
            </h3>

            {isRoomsLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              </div>
            ) : !roomsData || roomsData.items.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
                {t('admin:rooms.empty')}
              </div>
            ) : (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/20">
                        <th className="py-3.5 px-4">{t('admin:rooms.columns.roomId')}</th>
                        <th className="py-3.5 px-4">{t('admin:rooms.columns.name')}</th>
                        <th className="py-3.5 px-4">{t('admin:rooms.columns.hostId')}</th>
                        <th className="py-3.5 px-4">{t('admin:rooms.columns.players')}</th>
                        <th className="py-3.5 px-4">{t('admin:rooms.columns.status')}</th>
                        <th className="py-3.5 px-4 text-right">
                          {t('admin:rooms.columns.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-xs text-slate-350">
                      {roomsData.items.map((room) => (
                        <tr key={room.room_id} className="hover:bg-slate-900/10">
                          <td className="py-3 px-4 font-mono">{room.room_id}</td>
                          <td className="py-3 px-4 font-semibold text-slate-200">{room.name}</td>
                          <td className="py-3 px-4 font-mono">{room.host_account_id}</td>
                          <td className="py-3 px-4">{room.player_count}</td>
                          <td className="py-3 px-4">{enumLabel('roomStatus', room.status)}</td>
                          <td className="py-3 px-4 text-right">
                            {room.status !== 'closed' && (
                              <button
                                onClick={() => {
                                  if (confirm(t('admin:rooms.confirmClose', { name: room.name }))) {
                                    closeRoomMutation.mutate(room.room_id);
                                  }
                                }}
                                className="h-8 px-2 bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 border border-rose-900/30 rounded text-[10px] font-bold uppercase transition-all cursor-pointer"
                              >
                                {t('admin:rooms.close')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Matches Logs */}
        {activeSubTab === 'matches' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">
              {t('admin:matches.title')}
            </h3>

            {isMatchesLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              </div>
            ) : !matchesData || matchesData.items.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
                {t('admin:matches.empty')}
              </div>
            ) : (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/20">
                        <th className="py-3.5 px-4">{t('admin:matches.columns.matchId')}</th>
                        <th className="py-3.5 px-4">{t('admin:matches.columns.roomId')}</th>
                        <th className="py-3.5 px-4">{t('admin:matches.columns.endMode')}</th>
                        <th className="py-3.5 px-4">{t('admin:matches.columns.status')}</th>
                        <th className="py-3.5 px-4 text-right">
                          {t('admin:matches.columns.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-xs text-slate-350">
                      {matchesData.items.map((m) => (
                        <tr key={m.match_id} className="hover:bg-slate-900/10">
                          <td className="py-3 px-4 font-mono">{m.match_id.slice(0, 8)}...</td>
                          <td className="py-3 px-4 font-mono">{m.room_id}</td>
                          <td className="py-3 px-4">{enumLabel('endMode', m.end_mode)}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                m.void_reason
                                  ? 'bg-rose-900/20 text-rose-450 border border-rose-900/30'
                                  : 'bg-emerald-900/20 text-emerald-450 border border-emerald-900/30'
                              }`}
                            >
                              {m.void_reason ? t('admin:matches.voided') : m.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!m.void_reason && m.status !== 'active' && (
                              <button
                                onClick={() => {
                                  if (confirm(t('admin:matches.confirmVoid'))) {
                                    voidMatchMutation.mutate(m.match_id);
                                  }
                                }}
                                className="h-8 px-2 bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 border border-rose-900/30 rounded text-[10px] font-bold uppercase transition-all cursor-pointer"
                              >
                                {t('admin:matches.void')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Chats Log */}
        {activeSubTab === 'chats' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">
              {t('admin:chats.title')}
            </h3>

            {isChatsLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              </div>
            ) : !chatsData || chatsData.items.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
                {t('admin:chats.empty')}
              </div>
            ) : (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/20">
                        <th className="py-3.5 px-4">{t('admin:chats.columns.roomId')}</th>
                        <th className="py-3.5 px-4">{t('admin:chats.columns.senderId')}</th>
                        <th className="py-3.5 px-4">{t('admin:chats.columns.type')}</th>
                        <th className="py-3.5 px-4">{t('admin:chats.columns.content')}</th>
                        <th className="py-3.5 px-4">{t('admin:chats.columns.timestamp')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-xs text-slate-350">
                      {chatsData.items.map((chat) => (
                        <tr key={chat.message_id} className="hover:bg-slate-900/10">
                          <td className="py-3 px-4 font-mono">{chat.room_id}</td>
                          <td className="py-3 px-4 font-mono">{chat.account_id}</td>
                          <td className="py-3 px-4">
                            {enumLabel('messageType', chat.message_type)}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-200">{chat.content}</td>
                          <td className="py-3 px-4">{formatDateTime(chat.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Audit Logs */}
        {activeSubTab === 'audits' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">
              {t('admin:audits.title')}
            </h3>

            {isAuditsLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              </div>
            ) : !auditsData || auditsData.items.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
                {t('admin:audits.empty')}
              </div>
            ) : (
              <div className="space-y-3">
                {auditsData.items.map((audit) => (
                  <AuditLogRow key={audit.audit_log_id} audit={audit} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: Create Account */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 cursor-pointer"
            >
              <XCircle className="h-6 w-6" />
            </button>

            <h3 className="text-base font-bold uppercase tracking-wider text-purple-400 mb-6 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {t('admin:createModal.title')}
            </h3>

            {errorMsg && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-2.5 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-450 mb-2">
                  {t('admin:createModal.loginName')}
                </label>
                <input
                  type="text"
                  placeholder={t('admin:createModal.loginNamePlaceholder')}
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  className="w-full h-11 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3.5 text-xs outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-450 mb-2">
                  {t('admin:createModal.displayName')}
                </label>
                <input
                  type="text"
                  placeholder={t('admin:createModal.displayNamePlaceholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-11 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-450 mb-2">
                  {t('admin:createModal.password')}
                </label>
                <input
                  type="password"
                  placeholder={t('admin:createModal.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-450 mb-2">
                  {t('admin:createModal.role')}
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AccountRole)}
                  className="w-full h-11 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 text-xs outline-none text-slate-300"
                >
                  <option value="player">{t('admin:createModal.rolePlayer')}</option>
                  <option value="administrator">{t('admin:createModal.roleAdministrator')}</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 h-11 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createAccountMutation.isPending}
                  className="flex-1 h-11 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center"
                >
                  {createAccountMutation.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    t('admin:createModal.submit')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowResetModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 cursor-pointer"
            >
              <XCircle className="h-6 w-6" />
            </button>

            <h3 className="text-base font-bold uppercase tracking-wider text-purple-400 mb-6 flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              {t('admin:resetModal.title')}
            </h3>

            {errorMsg && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-2.5 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-450 mb-2">
                  {t('admin:resetModal.newPassword')}
                </label>
                <input
                  type="password"
                  placeholder={t('admin:resetModal.newPasswordPlaceholder')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-11 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3.5 text-xs outline-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 h-11 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordMutation.isPending}
                  className="flex-1 h-11 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center"
                >
                  {resetPasswordMutation.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    t('admin:resetModal.submit')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogRow({ audit }: { audit: AuditLogResponse }) {
  const [showJson, setShowJson] = useState(false);
  const { t } = useTranslation('admin');
  const enumLabel = useEnumLabel();
  const { formatDateTime } = useFormatters();

  return (
    <div className="bg-slate-900/20 border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs text-purple-400">
              {enumLabel('auditAction', audit.action)}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {t('audits.logId', { id: `${audit.audit_log_id.slice(0, 8)}...` })}
            </span>
          </div>

          <p className="text-[10px] text-slate-400">
            {t('audits.adminId')}{' '}
            <span className="font-semibold text-slate-200">{audit.administrator_account_id}</span>
            {audit.target_account_id && (
              <>
                {' '}
                | {t('audits.targetId')}{' '}
                <span className="font-semibold text-slate-200">{audit.target_account_id}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 font-mono">
            {formatDateTime(audit.created_at)}
          </span>

          <button
            onClick={() => setShowJson(!showJson)}
            className="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded border border-slate-700/50 text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5"
          >
            {showJson ? (
              <>
                <EyeOff className="h-3.5 w-3.5" /> {t('audits.hideState')}
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" /> {t('audits.viewState')}
              </>
            )}
          </button>
        </div>
      </div>

      {showJson && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-850 pt-3 text-[10px] font-mono leading-relaxed overflow-x-auto bg-slate-950/45 p-3 rounded-lg border border-slate-800/40">
          <div className="space-y-1">
            <span className="text-rose-500 font-bold uppercase tracking-wider block">
              {t('audits.beforeState')}
            </span>
            <pre className="text-slate-450 whitespace-pre-wrap">
              {audit.before_state
                ? JSON.stringify(audit.before_state, null, 2)
                : t('audits.noBeforeState')}
            </pre>
          </div>
          <div className="space-y-1">
            <span className="text-emerald-500 font-bold uppercase tracking-wider block">
              {t('audits.afterState')}
            </span>
            <pre className="text-slate-350 whitespace-pre-wrap">
              {audit.after_state
                ? JSON.stringify(audit.after_state, null, 2)
                : t('audits.noAfterState')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminConsole;
