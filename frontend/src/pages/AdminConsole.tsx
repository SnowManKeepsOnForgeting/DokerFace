import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Activity,
  Eye,
  EyeOff,
  FileText,
  Filter,
  KeyRound,
  Layers,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/Skeleton';
import { StatTile } from '../components/ui/StatTile';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

type AdminTab = 'accounts' | 'rooms' | 'matches' | 'chats' | 'audits';
type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tabItems: Array<{ id: AdminTab; icon: typeof Users; label: string }> = [
  { id: 'accounts', icon: Users, label: 'accounts' },
  { id: 'rooms', icon: Layers, label: 'rooms' },
  { id: 'matches', icon: Shield, label: 'matches' },
  { id: 'chats', icon: MessageSquare, label: 'chats' },
  { id: 'audits', icon: FileText, label: 'audits' },
];

function toneForStatus(status: string): BadgeTone {
  if (status === 'active' || status === 'completed' || status === 'open') return 'success';
  if (status === 'disabled' || status === 'waiting') return 'warning';
  if (status === 'deleted' || status === 'closed' || status === 'voided') return 'danger';
  return 'neutral';
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('admin');

  return (
    <div role="alert">
      <Panel tone="danger" padding="default" className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-danger">{t('states.loadFailed')}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{message}</p>
        </div>
        <Button intent="outline" size="sm" emphasis="caps" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('actions.retry')}
        </Button>
      </Panel>
    </div>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <tbody className="divide-y divide-slate-800/60">
            {Array.from({ length: 5 }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: columns }, (_, column) => (
                  <td key={column} className="px-3 py-3">
                    <Skeleton className="h-4 w-full max-w-32" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Panel tone="dashed" padding="roomy" className="text-center">
      <p className="text-xs text-slate-500">{children}</p>
    </Panel>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </Panel>
  );
}

function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-slate-950/35 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
      <tr className="border-border-subtle border-b">{children}</tr>
    </thead>
  );
}

function HeaderCell({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
  );
}

function Cell({
  children,
  className = '',
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td title={title} className={`px-3 py-2.5 align-middle text-xs text-slate-300 ${className}`}>
      {children}
    </td>
  );
}

export function AdminConsole() {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('accounts');
  const queryClient = useQueryClient();
  const { t } = useTranslation(['admin', 'common']);
  const enumLabel = useEnumLabel();
  const { formatDateTime } = useFormatters();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountRole>('player');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState<AccountRole | 'all'>('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatus | 'all'>('all');

  const {
    data: accountsData,
    isLoading: isAccountsLoading,
    isError: isAccountsError,
    error: accountsError,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => listAccountsApiV1AdminAccountsGet({ throwOnError: true }),
    enabled: activeSubTab === 'accounts',
  });
  const {
    data: roomsData,
    isLoading: isRoomsLoading,
    isError: isRoomsError,
    error: roomsError,
    refetch: refetchRooms,
  } = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: () => listAdminRoomsApiV1AdminRoomsGet({ throwOnError: true }),
    enabled: activeSubTab === 'rooms',
  });
  const {
    data: matchesData,
    isLoading: isMatchesLoading,
    isError: isMatchesError,
    error: matchesError,
    refetch: refetchMatches,
  } = useQuery({
    queryKey: ['admin-matches'],
    queryFn: () => listAdminMatchesApiV1AdminMatchesGet({ throwOnError: true }),
    enabled: activeSubTab === 'matches',
  });
  const {
    data: chatsData,
    isLoading: isChatsLoading,
    isError: isChatsError,
    error: chatsError,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ['admin-chats'],
    queryFn: () => listAdminChatsApiV1AdminChatsGet({ throwOnError: true }),
    enabled: activeSubTab === 'chats',
  });
  const {
    data: auditsData,
    isLoading: isAuditsLoading,
    isError: isAuditsError,
    error: auditsError,
    refetch: refetchAudits,
  } = useQuery({
    queryKey: ['admin-audits'],
    queryFn: () => listAuditLogsApiV1AdminAuditLogsGet({ throwOnError: true }),
    enabled: activeSubTab === 'audits',
  });

  const createAccountMutation = useMutation({
    mutationFn: () =>
      createAccountApiV1AdminAccountsPost({
        body: {
          login_name: loginName.trim(),
          password,
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
    onError: (err: unknown) => setErrorMsg(errorMessage(err, t('admin:createModal.createFailed'))),
  });

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
    onError: (err: unknown) => setErrorMsg(errorMessage(err, t('admin:resetModal.failed'))),
  });

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
    onError: (err: unknown) => alert(errorMessage(err, t('admin:accounts.updateFailed'))),
  });

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
    onError: (err: unknown) => alert(errorMessage(err, t('admin:matches.voidFailed'))),
  });

  const handleCreateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginName.trim() || !password) {
      setErrorMsg(t('admin:createModal.missingFields'));
      return;
    }
    createAccountMutation.mutate();
  };

  const handleResetSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAccountId || !newPassword.trim()) {
      setErrorMsg(t('admin:resetModal.missingPassword'));
      return;
    }
    resetPasswordMutation.mutate({ accountId: selectedAccountId, pass: newPassword.trim() });
  };

  const filteredAccounts =
    accountsData?.items.filter((account) => {
      const normalizedSearch = searchTerm.toLowerCase();
      return (
        (accountRoleFilter === 'all' || account.role === accountRoleFilter) &&
        (accountStatusFilter === 'all' || account.status === accountStatusFilter) &&
        (account.login_name.toLowerCase().includes(normalizedSearch) ||
          (account.display_name || '').toLowerCase().includes(normalizedSearch))
      );
    }) || [];
  const activeAccountCount =
    accountsData?.items.filter((account) => account.status === 'active').length ?? 0;
  const disabledAccountCount =
    accountsData?.items.filter((account) => account.status === 'disabled').length ?? 0;
  const tabLabels: Record<AdminTab, string> = {
    accounts: t('admin:tabs.accounts'),
    rooms: t('admin:tabs.rooms'),
    matches: t('admin:tabs.matches'),
    chats: t('admin:tabs.chats'),
    audits: t('admin:tabs.audits'),
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 pb-12 font-sans text-slate-100 md:flex-row md:gap-6">
      <aside className="w-full shrink-0 md:w-52">
        <nav aria-label={t('admin:panelTitle')}>
          <Panel padding="tight" className="md:sticky md:top-5">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                {t('admin:panelTitle')}
              </h2>
              <Activity className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
              {tabItems.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSubTab(id)}
                  aria-current={activeSubTab === id ? 'page' : undefined}
                  className={`focus-ring flex min-h-9 cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-left text-[10px] font-bold tracking-wider uppercase transition-colors ${
                    activeSubTab === id
                      ? 'bg-accent-strong text-white'
                      : 'text-slate-400 hover:bg-surface-hover hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tabLabels[id]}</span>
                </button>
              ))}
            </div>
          </Panel>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {activeSubTab === 'accounts' ? (
          <section className="space-y-4" aria-label={t('admin:tabs.accounts')}>
            <Panel.Header className="mb-0">
              <p className="text-xs text-slate-500">{t('admin:accounts.summary')}</p>
              <Button
                size="sm"
                emphasis="caps"
                onClick={() => {
                  setErrorMsg(null);
                  setShowCreateModal(true);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {t('admin:accounts.create')}
              </Button>
            </Panel.Header>

            {accountsData ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label={t('admin:accounts.stats.total')} size="sm">
                  {accountsData.total}
                </StatTile>
                <StatTile label={t('admin:accounts.stats.active')} tone="success" size="sm">
                  {activeAccountCount}
                </StatTile>
                <StatTile
                  label={t('admin:accounts.stats.disabled')}
                  tone="warning"
                  size="sm"
                  className="col-span-2 sm:col-span-1"
                >
                  {disabledAccountCount}
                </StatTile>
              </div>
            ) : null}

            <Panel padding="tight" className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <Field label={t('admin:accounts.searchLabel')} className="flex-1">
                {(props) => (
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <TextInput
                      {...props}
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={t('admin:accounts.searchPlaceholder')}
                      className="pl-9"
                    />
                  </div>
                )}
              </Field>
              <Field label={t('admin:accounts.roleFilter')} className="w-full lg:w-44">
                {(props) => (
                  <SelectInput
                    {...props}
                    value={accountRoleFilter}
                    onChange={(event) =>
                      setAccountRoleFilter(event.target.value as AccountRole | 'all')
                    }
                  >
                    <option value="all">{t('admin:accounts.filterAll')}</option>
                    <option value="player">{t('admin:accounts.roleOptions.player')}</option>
                    <option value="administrator">
                      {t('admin:accounts.roleOptions.administrator')}
                    </option>
                  </SelectInput>
                )}
              </Field>
              <Field label={t('admin:accounts.statusFilter')} className="w-full lg:w-44">
                {(props) => (
                  <SelectInput
                    {...props}
                    value={accountStatusFilter}
                    onChange={(event) =>
                      setAccountStatusFilter(event.target.value as AccountStatus | 'all')
                    }
                  >
                    <option value="all">{t('admin:accounts.filterAll')}</option>
                    <option value="active">{t('admin:accounts.statusOptions.active')}</option>
                    <option value="disabled">{t('admin:accounts.statusOptions.disabled')}</option>
                  </SelectInput>
                )}
              </Field>
              <Filter className="mb-2 hidden h-4 w-4 text-slate-500 lg:block" aria-hidden="true" />
            </Panel>

            {isAccountsLoading ? (
              <TableSkeleton columns={6} />
            ) : isAccountsError ? (
              <QueryError
                message={errorMessage(accountsError, t('admin:states.loadFailed'))}
                onRetry={() => void refetchAccounts()}
              />
            ) : filteredAccounts.length === 0 ? (
              <EmptyState>{t('admin:accounts.empty')}</EmptyState>
            ) : (
              <TableShell>
                <table className="w-full min-w-[58rem] border-collapse text-left">
                  <TableHeader>
                    <HeaderCell>{t('admin:accounts.columns.accountId')}</HeaderCell>
                    <HeaderCell>{t('admin:accounts.columns.loginName')}</HeaderCell>
                    <HeaderCell>{t('admin:accounts.columns.displayName')}</HeaderCell>
                    <HeaderCell>{t('admin:accounts.columns.role')}</HeaderCell>
                    <HeaderCell>{t('admin:accounts.columns.status')}</HeaderCell>
                    <HeaderCell align="right">{t('admin:accounts.columns.actions')}</HeaderCell>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredAccounts.map((account) => (
                      <tr
                        key={account.account_id}
                        className="transition-colors hover:bg-surface-hover"
                      >
                        <Cell className="font-mono text-slate-500">{account.account_id}</Cell>
                        <Cell className="font-semibold text-slate-200">{account.login_name}</Cell>
                        <Cell>{account.display_name || t('admin:accounts.noDisplayName')}</Cell>
                        <Cell>
                          <div className="flex min-w-40 items-center gap-2">
                            <Badge
                              tone={account.role === 'administrator' ? 'accent' : 'neutral'}
                              size="xs"
                            >
                              {t(`admin:accounts.roleOptions.${account.role}`)}
                            </Badge>
                            <SelectInput
                              aria-label={t('admin:accounts.roleFor', { name: account.login_name })}
                              value={account.role}
                              onChange={(event) =>
                                updateAccountMutation.mutate({
                                  accountId: account.account_id,
                                  payload: { role: event.target.value as AccountRole },
                                })
                              }
                              className="h-8 min-w-0 flex-1 px-2 text-xs"
                            >
                              <option value="player">
                                {t('admin:accounts.roleOptions.player')}
                              </option>
                              <option value="administrator">
                                {t('admin:accounts.roleOptions.administrator')}
                              </option>
                            </SelectInput>
                          </div>
                        </Cell>
                        <Cell>
                          <div className="flex min-w-40 items-center gap-2">
                            <Badge tone={toneForStatus(account.status)} size="xs">
                              {account.status === 'active' || account.status === 'disabled'
                                ? t(`admin:accounts.statusOptions.${account.status}`)
                                : account.status}
                            </Badge>
                            <SelectInput
                              aria-label={t('admin:accounts.statusFor', {
                                name: account.login_name,
                              })}
                              value={account.status}
                              onChange={(event) =>
                                updateAccountMutation.mutate({
                                  accountId: account.account_id,
                                  payload: { status: event.target.value as AccountStatus },
                                })
                              }
                              className="h-8 min-w-0 flex-1 px-2 text-xs"
                            >
                              <option value="active">
                                {t('admin:accounts.statusOptions.active')}
                              </option>
                              <option value="disabled">
                                {t('admin:accounts.statusOptions.disabled')}
                              </option>
                            </SelectInput>
                          </div>
                        </Cell>
                        <Cell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              intent="secondary"
                              size="sm"
                              emphasis="caps"
                              onClick={() => {
                                setSelectedAccountId(account.account_id);
                                setErrorMsg(null);
                                setShowResetModal(true);
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {t('admin:accounts.resetPass')}
                            </Button>
                            <Button
                              type="button"
                              intent="danger"
                              size="iconSm"
                              aria-label={t('admin:accounts.deleteAccount')}
                              title={t('admin:accounts.deleteAccount')}
                              onClick={() => {
                                if (
                                  confirm(
                                    t('admin:accounts.confirmDelete', { name: account.login_name }),
                                  )
                                ) {
                                  updateAccountMutation.mutate({
                                    accountId: account.account_id,
                                    payload: { status: 'deleted' },
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            )}
          </section>
        ) : null}

        {activeSubTab === 'rooms' ? (
          <AdminSection
            title={t('admin:rooms.title')}
            loading={isRoomsLoading}
            error={roomsError}
            isError={isRoomsError}
            onRetry={() => void refetchRooms()}
            empty={!roomsData || roomsData.items.length === 0}
            emptyLabel={t('admin:rooms.empty')}
            columns={6}
          >
            <TableShell>
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <TableHeader>
                  <HeaderCell>{t('admin:rooms.columns.roomId')}</HeaderCell>
                  <HeaderCell>{t('admin:rooms.columns.name')}</HeaderCell>
                  <HeaderCell>{t('admin:rooms.columns.hostId')}</HeaderCell>
                  <HeaderCell>{t('admin:rooms.columns.players')}</HeaderCell>
                  <HeaderCell>{t('admin:rooms.columns.status')}</HeaderCell>
                  <HeaderCell align="right">{t('admin:rooms.columns.actions')}</HeaderCell>
                </TableHeader>
                <tbody className="divide-y divide-slate-800/50">
                  {roomsData?.items.map((room) => (
                    <tr key={room.room_id} className="hover:bg-surface-hover">
                      <Cell className="font-mono text-slate-500">{room.room_id}</Cell>
                      <Cell className="font-semibold text-slate-200">{room.name}</Cell>
                      <Cell className="font-mono">{room.host_account_id}</Cell>
                      <Cell className="tabular-nums">{room.player_count}</Cell>
                      <Cell>
                        <Badge tone={toneForStatus(room.status)} size="xs">
                          {enumLabel('roomStatus', room.status)}
                        </Badge>
                      </Cell>
                      <Cell className="text-right">
                        {room.status !== 'closed' ? (
                          <Button
                            intent="danger"
                            size="sm"
                            emphasis="caps"
                            onClick={() => {
                              if (confirm(t('admin:rooms.confirmClose', { name: room.name })))
                                closeRoomMutation.mutate(room.room_id);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t('admin:rooms.close')}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-600">-</span>
                        )}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </AdminSection>
        ) : null}

        {activeSubTab === 'matches' ? (
          <AdminSection
            title={t('admin:matches.title')}
            loading={isMatchesLoading}
            error={matchesError}
            isError={isMatchesError}
            onRetry={() => void refetchMatches()}
            empty={!matchesData || matchesData.items.length === 0}
            emptyLabel={t('admin:matches.empty')}
            columns={5}
          >
            <TableShell>
              <table className="w-full min-w-[44rem] border-collapse text-left">
                <TableHeader>
                  <HeaderCell>{t('admin:matches.columns.matchId')}</HeaderCell>
                  <HeaderCell>{t('admin:matches.columns.roomId')}</HeaderCell>
                  <HeaderCell>{t('admin:matches.columns.endMode')}</HeaderCell>
                  <HeaderCell>{t('admin:matches.columns.status')}</HeaderCell>
                  <HeaderCell align="right">{t('admin:matches.columns.actions')}</HeaderCell>
                </TableHeader>
                <tbody className="divide-y divide-slate-800/50">
                  {matchesData?.items.map((match) => (
                    <tr key={match.match_id} className="hover:bg-surface-hover">
                      <Cell className="font-mono text-slate-500">
                        {match.match_id.slice(0, 8)}...
                      </Cell>
                      <Cell className="font-mono">{match.room_id}</Cell>
                      <Cell>{enumLabel('endMode', match.end_mode)}</Cell>
                      <Cell>
                        <Badge
                          tone={match.void_reason ? 'danger' : toneForStatus(match.status)}
                          size="xs"
                        >
                          {match.void_reason
                            ? t('admin:matches.voided')
                            : enumLabel('matchStatus', match.status)}
                        </Badge>
                      </Cell>
                      <Cell className="text-right">
                        {!match.void_reason && match.status !== 'active' ? (
                          <Button
                            intent="danger"
                            size="sm"
                            emphasis="caps"
                            onClick={() => {
                              if (confirm(t('admin:matches.confirmVoid')))
                                voidMatchMutation.mutate(match.match_id);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t('admin:matches.void')}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-600">-</span>
                        )}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </AdminSection>
        ) : null}

        {activeSubTab === 'chats' ? (
          <AdminSection
            title={t('admin:chats.title')}
            loading={isChatsLoading}
            error={chatsError}
            isError={isChatsError}
            onRetry={() => void refetchChats()}
            empty={!chatsData || chatsData.items.length === 0}
            emptyLabel={t('admin:chats.empty')}
            columns={5}
          >
            <TableShell>
              <table className="w-full min-w-[52rem] border-collapse text-left">
                <TableHeader>
                  <HeaderCell>{t('admin:chats.columns.roomId')}</HeaderCell>
                  <HeaderCell>{t('admin:chats.columns.senderId')}</HeaderCell>
                  <HeaderCell>{t('admin:chats.columns.type')}</HeaderCell>
                  <HeaderCell>{t('admin:chats.columns.content')}</HeaderCell>
                  <HeaderCell>{t('admin:chats.columns.timestamp')}</HeaderCell>
                </TableHeader>
                <tbody className="divide-y divide-slate-800/50">
                  {chatsData?.items.map((chat) => (
                    <tr key={chat.message_id} className="hover:bg-surface-hover">
                      <Cell className="font-mono text-slate-500">{chat.room_id}</Cell>
                      <Cell className="font-mono">{chat.account_id}</Cell>
                      <Cell>
                        <Badge tone="neutral" size="xs">
                          {enumLabel('messageType', chat.message_type)}
                        </Badge>
                      </Cell>
                      <Cell
                        className="max-w-sm truncate font-medium text-slate-200"
                        title={chat.content}
                      >
                        {chat.content}
                      </Cell>
                      <Cell className="whitespace-nowrap text-slate-500">
                        {formatDateTime(chat.created_at)}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </AdminSection>
        ) : null}

        {activeSubTab === 'audits' ? (
          <AdminSection
            title={t('admin:audits.title')}
            loading={isAuditsLoading}
            error={auditsError}
            isError={isAuditsError}
            onRetry={() => void refetchAudits()}
            empty={!auditsData || auditsData.items.length === 0}
            emptyLabel={t('admin:audits.empty')}
            columns={1}
          >
            <div className="space-y-3">
              {auditsData?.items.map((audit) => (
                <AuditLogRow key={audit.audit_log_id} audit={audit} />
              ))}
            </div>
          </AdminSection>
        ) : null}
      </main>

      {showCreateModal ? (
        <AccountDialog
          title={t('admin:createModal.title')}
          icon={<UserPlus className="h-4 w-4" />}
          error={errorMsg}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateSubmit}
          submitLabel={t('admin:createModal.submit')}
          isPending={createAccountMutation.isPending}
        >
          <Field label={t('admin:createModal.loginName')}>
            {(props) => (
              <TextInput
                {...props}
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                placeholder={t('admin:createModal.loginNamePlaceholder')}
                autoFocus
              />
            )}
          </Field>
          <Field label={t('admin:createModal.displayName')}>
            {(props) => (
              <TextInput
                {...props}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t('admin:createModal.displayNamePlaceholder')}
              />
            )}
          </Field>
          <Field label={t('admin:createModal.password')}>
            {(props) => (
              <TextInput
                {...props}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('admin:createModal.passwordPlaceholder')}
              />
            )}
          </Field>
          <Field label={t('admin:createModal.role')}>
            {(props) => (
              <SelectInput
                {...props}
                value={role}
                onChange={(event) => setRole(event.target.value as AccountRole)}
              >
                <option value="player">{t('admin:createModal.rolePlayer')}</option>
                <option value="administrator">{t('admin:createModal.roleAdministrator')}</option>
              </SelectInput>
            )}
          </Field>
        </AccountDialog>
      ) : null}

      {showResetModal ? (
        <AccountDialog
          title={t('admin:resetModal.title')}
          icon={<KeyRound className="h-4 w-4" />}
          error={errorMsg}
          onClose={() => setShowResetModal(false)}
          onSubmit={handleResetSubmit}
          submitLabel={t('admin:resetModal.submit')}
          isPending={resetPasswordMutation.isPending}
        >
          <Field label={t('admin:resetModal.newPassword')}>
            {(props) => (
              <TextInput
                {...props}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={t('admin:resetModal.newPasswordPlaceholder')}
                autoFocus
              />
            )}
          </Field>
        </AccountDialog>
      ) : null}
    </div>
  );
}

function AdminSection({
  title,
  loading,
  error,
  isError,
  onRetry,
  empty,
  emptyLabel,
  columns,
  children,
}: {
  title: string;
  loading: boolean;
  error: unknown;
  isError: boolean;
  onRetry: () => void;
  empty: boolean;
  emptyLabel: string;
  columns: number;
  children: ReactNode;
}) {
  const { t } = useTranslation('admin');
  return (
    <section className="space-y-4" aria-labelledby={`${title}-title`}>
      <Panel.Header className="mb-0">
        <Panel.Title>
          <span id={`${title}-title`}>{title}</span>
        </Panel.Title>
      </Panel.Header>
      {loading ? (
        <TableSkeleton columns={columns} />
      ) : isError ? (
        <QueryError message={errorMessage(error, t('states.loadFailed'))} onRetry={onRetry} />
      ) : empty ? (
        <EmptyState>{emptyLabel}</EmptyState>
      ) : (
        children
      )}
    </section>
  );
}

function AccountDialog({
  title,
  icon,
  error,
  onClose,
  onSubmit,
  submitLabel,
  isPending,
  children,
}: {
  title: string;
  icon: ReactNode;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  submitLabel: string;
  isPending: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
      >
        <Panel tone="raised" padding="roomy" className="shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2
              id="admin-dialog-title"
              className="flex items-center gap-2 text-sm font-bold tracking-wider text-accent-text uppercase"
            >
              {icon}
              {title}
            </h2>
            <Button
              intent="ghost"
              size="iconSm"
              aria-label={t('admin:actions.close')}
              title={t('admin:actions.close')}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {error ? (
            <div
              className="mb-4 rounded-control border border-danger-border bg-danger-surface px-3 py-2.5 text-xs font-semibold text-danger"
              role="alert"
            >
              {error}
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="space-y-4">
            {children}
            <div className="flex gap-2 pt-2">
              <Button intent="secondary" size="md" width="full" onClick={onClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" size="md" width="full" disabled={isPending}>
                {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : submitLabel}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function AuditLogRow({ audit }: { audit: AuditLogResponse }) {
  const [showJson, setShowJson] = useState(false);
  const { t } = useTranslation('admin');
  const enumLabel = useEnumLabel();
  const { formatDateTime } = useFormatters();
  return (
    <Panel padding="tight" as="article">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" size="xs">
              {enumLabel('auditAction', audit.action)}
            </Badge>
            <span className="font-mono text-[10px] text-slate-500">
              {t('audits.logId', { id: `${audit.audit_log_id.slice(0, 8)}...` })}
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            {t('audits.adminId')}{' '}
            <span className="font-semibold text-slate-200">{audit.administrator_account_id}</span>
            {audit.target_account_id ? (
              <>
                {' '}
                {' | '}
                {t('audits.targetId')}{' '}
                <span className="font-semibold text-slate-200">{audit.target_account_id}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="font-mono text-[10px] text-slate-500">
            {formatDateTime(audit.created_at)}
          </span>
          <Button
            intent="secondary"
            size="sm"
            emphasis="caps"
            onClick={() => setShowJson((visible) => !visible)}
          >
            {showJson ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showJson ? t('audits.hideState') : t('audits.viewState')}
          </Button>
        </div>
      </div>
      {showJson ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border-subtle pt-3 text-[10px] leading-relaxed font-mono sm:grid-cols-2">
          <div className="min-w-0">
            <span className="mb-1 block font-bold tracking-wider text-danger uppercase">
              {t('audits.beforeState')}
            </span>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-border-subtle bg-slate-950/45 p-3 text-slate-400 scrollbar-thin">
              {audit.before_state
                ? JSON.stringify(audit.before_state, null, 2)
                : t('audits.noBeforeState')}
            </pre>
          </div>
          <div className="min-w-0">
            <span className="mb-1 block font-bold tracking-wider text-success uppercase">
              {t('audits.afterState')}
            </span>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-border-subtle bg-slate-950/45 p-3 text-slate-300 scrollbar-thin">
              {audit.after_state
                ? JSON.stringify(audit.after_state, null, 2)
                : t('audits.noAfterState')}
            </pre>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export default AdminConsole;
