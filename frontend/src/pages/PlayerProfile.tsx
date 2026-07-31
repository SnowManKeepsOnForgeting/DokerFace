import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../api/auth-context';
import { ApiError } from '../api/client';
import {
  getPlayerApiV1PlayersAccountIdGet,
  getPlayerStatisticsApiV1PlayersAccountIdStatisticsGet,
  getPlayerRatingHistoryApiV1PlayersAccountIdRatingsGet,
  updateMyProfileApiV1MeProfilePatch,
  listPlayerMatchesApiV1PlayersAccountIdMatchesGet,
  getMatchHistoryApiV1MatchesMatchIdGet,
  changePasswordApiV1MeChangePasswordPost,
} from '../contracts/rest';
import type {
  ActionHistoryResponse,
  HandHistoryResponse,
  PlayerRatingHistoryEntry,
  ProfileUpdateRequest,
  PublicPlayerResponse,
} from '../contracts/rest/types.gen';
import {
  Edit2,
  Check,
  X,
  Trophy,
  Calendar,
  History,
  Info,
  ChevronDown,
  ChevronUp,
  Award,
  KeyRound,
  Languages,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';
import { ProfileAvatarBadge } from '../components/ProfileAvatarBadge';
import { PlayingCard } from '../components/PlayingCard';
import { Panel } from '../components/ui/Panel';
import { Badge } from '../components/ui/Badge';
import { StatTile } from '../components/ui/StatTile';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

export function PlayerProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const { user: currentUser, refetch: refetchAuth } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation(['profile', 'common']);
  const enumLabel = useEnumLabel();
  const { formatDate, formatDateTime } = useFormatters();

  const accountId = parseInt(playerId || '0');
  const isOwnProfile = currentUser?.account_id === accountId;

  // Edit/Tabs/Detail states
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarText, setEditAvatarText] = useState('');
  const [editAvatarColor, setEditAvatarColor] = useState('#4f46e5');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Queries
  const {
    data: player,
    isLoading: isPlayerLoading,
    error: playerError,
  } = useQuery<PublicPlayerResponse, ApiError>({
    queryKey: ['player', accountId],
    queryFn: () =>
      getPlayerApiV1PlayersAccountIdGet({
        path: { account_id: accountId },
        throwOnError: true,
      }),
    enabled: accountId > 0,
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['player-stats', accountId],
    queryFn: () =>
      getPlayerStatisticsApiV1PlayersAccountIdStatisticsGet({
        path: { account_id: accountId },
        throwOnError: true,
      }),
    enabled: accountId > 0,
  });

  const { data: ratings, isLoading: isRatingsLoading } = useQuery({
    queryKey: ['player-ratings', accountId],
    queryFn: () =>
      getPlayerRatingHistoryApiV1PlayersAccountIdRatingsGet({
        path: { account_id: accountId },
        throwOnError: true,
      }),
    enabled: accountId > 0,
  });

  const { data: matches, isLoading: isMatchesLoading } = useQuery({
    queryKey: ['player-matches', accountId],
    queryFn: () =>
      listPlayerMatchesApiV1PlayersAccountIdMatchesGet({
        path: { account_id: accountId },
        throwOnError: true,
      }),
    enabled: accountId > 0 && activeTab === 'history',
  });

  // Edit Profile Mutation
  const updateProfileMutation = useMutation<PublicPlayerResponse, ApiError, ProfileUpdateRequest>({
    mutationFn: async (payload) => {
      return await updateMyProfileApiV1MeProfilePatch({
        body: payload,
        throwOnError: true,
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      // Every avatar surface reads ['player', accountId]; the leaderboard
      // carries its own copy of the display name and avatar.
      queryClient.invalidateQueries({ queryKey: ['player', accountId] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      refetchAuth();
    },
    onError: (err) => {
      setValidationError(err.message || t('profile:edit.updateFailed'));
    },
  });

  const changePasswordMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      await changePasswordApiV1MeChangePasswordPost({
        body: { current_password: currentPassword, new_password: newPassword },
        throwOnError: true,
      });
    },
    onSuccess: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
    onError: (err) => {
      setPasswordError(err.message || t('profile:security.changeFailed'));
    },
  });

  // Open edit mode with prefilled values
  const handleStartEdit = () => {
    if (!player) return;
    setEditDisplayName(player.display_name);
    setEditAvatarText(player.avatar_text || player.display_name.slice(0, 2));
    setEditAvatarColor(player.avatar_background_color || '#4f46e5');
    setValidationError(null);
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation checks
    if (!editDisplayName.trim()) {
      setValidationError(t('profile:edit.nameRequired'));
      return;
    }
    if (!editAvatarText.trim()) {
      setValidationError(t('profile:edit.avatarRequired'));
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(editAvatarColor)) {
      setValidationError(t('profile:edit.colorInvalid'));
      return;
    }

    updateProfileMutation.mutate({
      display_name: editDisplayName.trim(),
      avatar_text: editAvatarText.trim(),
      avatar_background_color: editAvatarColor,
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (!currentPassword || !newPassword) {
      setPasswordError(t('profile:security.missingFields'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile:security.mismatch'));
      return;
    }
    changePasswordMutation.mutate();
  };

  if (isPlayerLoading) {
    return (
      <div
        className="grid w-full grid-cols-1 gap-4 md:grid-cols-[auto_1fr]"
        aria-label={t('profile:loading')}
      >
        <Skeleton className="h-24 w-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (playerError || !player) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-6 py-4 text-sm font-semibold max-w-lg mx-auto mt-6 text-center">
        {t('profile:notFound')}
      </div>
    );
  }

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return t('profile:stats.insufficient');
    return `${(val * 100).toFixed(1)}%`;
  };

  return (
    <div className="flex flex-1 flex-col gap-5 font-sans text-slate-100 md:gap-6">
      <Panel as="section" padding="roomy" className="relative overflow-hidden animate-fade-in">
        <div className="absolute inset-x-0 top-0 h-1 bg-accent-strong opacity-70" />
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ProfileAvatarBadge
            avatarText={player.avatar_text}
            backgroundColor={player.avatar_background_color}
            displayName={player.display_name}
            label={player.display_name}
            className="h-20 w-20 border border-white/10 text-2xl shadow-xl shadow-black/20 sm:h-24 sm:w-24"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap">
              <h1 className="max-w-full truncate text-2xl font-bold text-slate-100">
                {player.display_name}
              </h1>
              <div className="flex items-center gap-2">
                <Badge
                  tone={player.is_online ? 'success' : 'neutral'}
                  size="sm"
                  className={player.is_online ? 'animate-pulse' : undefined}
                >
                  {player.is_online ? t('profile:online') : t('profile:offline')}
                </Badge>
                {player.rank_badge_theme ? (
                  <Badge size="xs">{player.rank_badge_theme}</Badge>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t('profile:accountId', { id: player.account_id })}
            </p>
            {isOwnProfile && !isEditing ? (
              <Button intent="secondary" size="sm" className="mt-3" onClick={handleStartEdit}>
                <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('profile:editProfile')}
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>

      {/* Editing Form Sheet */}
      {isEditing && (
        <Panel tone="accent" as="section" className="space-y-4 animate-slide-down">
          <h3 className="font-bold text-sm uppercase tracking-wider text-purple-400">
            {t('profile:edit.title')}
          </h3>

          {validationError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-2.5 text-xs font-semibold">
              {validationError}
            </div>
          )}

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-2">
                {t('profile:edit.displayName')}
              </label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder={t('profile:edit.displayNamePlaceholder')}
                className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-2">
                {t('profile:edit.avatarText')}
              </label>
              <input
                type="text"
                value={editAvatarText}
                onChange={(e) => setEditAvatarText(e.target.value)}
                placeholder={t('profile:edit.avatarTextPlaceholder')}
                className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 font-semibold mb-2">
                  {t('profile:edit.avatarColor')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={editAvatarColor}
                    onChange={(e) => setEditAvatarColor(e.target.value)}
                    className="w-10 h-10 p-0 rounded-lg border border-slate-800 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editAvatarColor}
                    onChange={(e) => setEditAvatarColor(e.target.value)}
                    placeholder={t('profile:edit.avatarColorPlaceholder')}
                    className="flex-1 h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-center uppercase"
                  />
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="submit"
                  aria-label={t('profile:edit.save')}
                  disabled={updateProfileMutation.isPending}
                  className="h-10 w-10 flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('profile:edit.cancel')}
                  onClick={() => setIsEditing(false)}
                  className="h-10 w-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </form>
        </Panel>
      )}

      {isOwnProfile && (
        <section className="border-y border-border-subtle py-5">
          <div className="mb-4 flex items-center gap-2">
            <Languages className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold uppercase text-purple-400">
              {t('profile:preferences.title')}
            </h3>
          </div>

          <div className="flex max-w-2xl flex-col gap-2">
            <LanguageSwitcher className="max-w-xs" />
            <p className="text-[10px] text-slate-500">{t('profile:preferences.languageHint')}</p>
          </div>
        </section>
      )}

      {isOwnProfile && (
        <section className="border-b border-border-subtle pb-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold uppercase text-purple-400">
              {t('profile:security.title')}
            </h3>
          </div>

          {passwordError && (
            <div
              role="alert"
              className="mb-4 max-w-2xl rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-400"
            >
              {passwordError}
            </div>
          )}

          <form
            onSubmit={handleChangePassword}
            className="grid max-w-4xl grid-cols-1 items-end gap-4 md:grid-cols-4"
          >
            <label className="text-xs font-semibold text-slate-400">
              {t('profile:security.currentPassword')}
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-purple-500/50"
              />
            </label>
            <label className="text-xs font-semibold text-slate-400">
              {t('profile:security.newPassword')}
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-purple-500/50"
              />
            </label>
            <label className="text-xs font-semibold text-slate-400">
              {t('profile:security.confirmPassword')}
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-purple-500/50"
              />
            </label>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="h-10 rounded-lg bg-purple-600 px-4 text-xs font-bold uppercase text-white transition-colors hover:bg-purple-500 disabled:cursor-wait disabled:opacity-60"
            >
              {changePasswordMutation.isPending
                ? t('profile:security.submitting')
                : t('profile:security.submit')}
            </button>
          </form>
        </section>
      )}

      {/* Main Grid: Stats & Elo History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Player Stats or Match History Dashboard */}
        <section className="lg:col-span-2 space-y-4">
          {/* Tab selectors */}
          <div className="flex border-b border-slate-800/80 mb-4 gap-4 shrink-0">
            <button
              onClick={() => setActiveTab('stats')}
              className={`pb-2 text-sm font-semibold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                activeTab === 'stats'
                  ? 'border-purple-500 text-purple-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t('profile:tabs.stats')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2 text-sm font-semibold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                activeTab === 'history'
                  ? 'border-purple-500 text-purple-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t('profile:tabs.history')}
            </button>
          </div>

          {activeTab === 'stats' ? (
            isStatsLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Skeleton key={n} className="h-28" />
                ))}
              </div>
            ) : !stats ? (
              <Panel tone="sunken" className="p-8 text-center text-sm text-slate-500">
                {t('profile:stats.empty')}
              </Panel>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 animate-fade-in">
                <StatTile
                  label={t('profile:stats.matchesPlayed')}
                  detail={t('profile:stats.profitable', {
                    value:
                      stats.matches_played > 0
                        ? `${((stats.profitable_matches / stats.matches_played) * 100).toFixed(0)}%`
                        : '0%',
                  })}
                  size="lg"
                >
                  {stats.matches_played}
                </StatTile>
                <StatTile
                  label={t('profile:stats.handsDealt')}
                  detail={t('profile:stats.handsWon', {
                    won: stats.won_hands,
                    rate:
                      stats.dealt_hands > 0
                        ? `${((stats.won_hands / stats.dealt_hands) * 100).toFixed(1)}%`
                        : '0%',
                  })}
                  size="lg"
                >
                  {stats.dealt_hands}
                </StatTile>
                <StatTile
                  label={t('profile:stats.vpip')}
                  detail={t('profile:stats.vpipHint')}
                  size="lg"
                >
                  {formatPercent(stats.vpip_rate)}
                </StatTile>
                <StatTile
                  label={t('profile:stats.pfr')}
                  detail={t('profile:stats.pfrHint')}
                  size="lg"
                >
                  {formatPercent(stats.pfr_rate)}
                </StatTile>
                <StatTile
                  label={t('profile:stats.threeBet')}
                  detail={t('profile:stats.threeBetHint')}
                  size="lg"
                >
                  {formatPercent(stats.three_bet_rate)}
                </StatTile>
                <StatTile
                  label={t('profile:stats.showdownWin')}
                  detail={t('profile:stats.showdownRate', {
                    value: stats.showdown_rate
                      ? `${(stats.showdown_rate * 100).toFixed(0)}%`
                      : '0%',
                  })}
                  size="lg"
                >
                  {formatPercent(stats.showdown_win_rate)}
                </StatTile>
                <StatTile
                  label={t('profile:stats.averagePot')}
                  detail={t('profile:stats.averagePotHint')}
                  size="lg"
                >
                  {stats.average_pot !== null && stats.average_pot !== undefined
                    ? stats.average_pot.toFixed(0)
                    : t('profile:stats.insufficient')}
                </StatTile>
                <StatTile
                  label={t('profile:stats.foldRate')}
                  detail={t('profile:stats.foldRateHint')}
                  size="lg"
                >
                  {formatPercent(stats.fold_rate)}
                </StatTile>
                <StatTile
                  label={t('profile:stats.allIns')}
                  detail={t('profile:stats.allInsHint')}
                  size="lg"
                >
                  {stats.all_ins}
                </StatTile>
              </div>
            )
          ) : isMatchesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-20" />
              ))}
            </div>
          ) : !matches || !matches.items || matches.items.length === 0 ? (
            <Panel tone="sunken" className="p-8 text-center text-sm text-slate-500">
              {t('profile:history.empty')}
            </Panel>
          ) : (
            <div className="space-y-3 animate-fade-in">
              {matches.items.map((m) => (
                <div
                  key={m.match_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMatchId(m.match_id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedMatchId(m.match_id);
                  }}
                  className="cursor-pointer rounded-panel transition-colors hover:border-accent-border"
                >
                  <Panel padding="default" className="hover:bg-surface-raised">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <History
                            className="h-4 w-4 shrink-0 text-accent-text"
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-bold text-slate-200">
                            {t('profile:history.matchId', { id: `${m.match_id.slice(0, 8)}...` })}
                          </span>
                          {m.void_reason ? (
                            <Badge tone="danger" size="xs">
                              {t('profile:history.void')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {t('profile:history.started', { value: formatDateTime(m.started_at) })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs sm:shrink-0">
                        <Badge size="xs">{enumLabel('endMode', m.end_mode)}</Badge>
                        <span className="text-slate-500 tabular-nums">
                          {t('profile:history.players', { value: m.players?.length || 0 })}
                        </span>
                      </div>
                    </div>
                  </Panel>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Elo Ratings History */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-5 w-5 text-purple-400" />
            <h3 className="font-bold text-lg">{t('profile:elo.title')}</h3>
          </div>

          {isRatingsLoading ? (
            <Skeleton className="h-64" />
          ) : !ratings || !ratings.items || ratings.items.length === 0 ? (
            <Panel tone="sunken" className="p-8 text-center text-sm text-slate-500">
              {t('profile:elo.empty')}
            </Panel>
          ) : (
            <Panel padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {ratings.items.map((record: PlayerRatingHistoryEntry, index: number) => (
                <div
                  key={`${record.match_id}-${index}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-300">
                      {t('profile:history.matchId', {
                        id: record.match_id
                          ? record.match_id.slice(0, 8)
                          : t('profile:elo.bootstrap'),
                      })}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {record.created_at
                        ? formatDate(record.created_at)
                        : t('profile:elo.unknownDate')}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 tabular-nums">
                    <span className="text-sm font-bold text-slate-200">
                      {record.after_rating.toFixed(0)}
                    </span>
                    {record.delta !== 0 ? (
                      <span
                        className={
                          record.delta >= 0
                            ? 'text-xs font-bold text-success'
                            : 'text-xs font-bold text-danger'
                        }
                      >
                        {record.delta >= 0 ? '+' : ''}
                        {record.delta.toFixed(0)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </Panel>
          )}
        </section>
      </div>

      {/* Match details dialog popup modal */}
      {selectedMatchId && (
        <MatchDetailModal matchId={selectedMatchId} onClose={() => setSelectedMatchId(null)} />
      )}
    </div>
  );
}

interface MatchDetailModalProps {
  matchId: string;
  onClose: () => void;
}

function MatchDetailModal({ matchId, onClose }: MatchDetailModalProps) {
  const { t } = useTranslation(['profile', 'common']);
  const { formatChips } = useFormatters();
  const { data: detail, isLoading } = useQuery({
    queryKey: ['match-detail', matchId],
    queryFn: () =>
      getMatchHistoryApiV1MatchesMatchIdGet({ path: { match_id: matchId }, throwOnError: true }),
  });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Top bar */}
        <header className="px-6 py-4 border-b border-slate-800/80 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Award className="h-5 w-5 text-purple-400" />
              {t('profile:matchDetail.title')}
            </h3>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              {t('profile:matchDetail.id', { id: matchId })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Scrollable details */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
            </div>
          ) : !detail ? (
            <div className="text-center text-slate-500 text-xs py-12">
              {t('profile:matchDetail.missing')}
            </div>
          ) : (
            <>
              {/* Standings */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> {t('profile:matchDetail.endStandings')}
                </h4>
                <div className="divide-y divide-slate-800/60 text-xs">
                  {detail.players.map((p) => (
                    <div key={p.account_id} className="flex justify-between py-2 items-center">
                      <span className="font-semibold text-slate-300">
                        {t('common:playerFallback', { id: p.account_id })}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {p.final_chips !== null && p.final_chips !== undefined
                          ? t('profile:matchDetail.chips', {
                              amount: formatChips(p.final_chips),
                            })
                          : t('profile:matchDetail.spectator')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Played Hands List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  {t('profile:matchDetail.handsPlayed', { value: detail.hands?.length || 0 })}
                </h4>

                <div className="space-y-3">
                  {detail.hands?.map((hand) => (
                    <HandRow key={hand.hand_id} hand={hand} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HandRow({ hand }: { hand: HandHistoryResponse }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation(['profile', 'common']);
  const enumLabel = useEnumLabel();
  const { formatChips } = useFormatters();

  return (
    <Panel tone="sunken" padding="none" className="overflow-hidden">
      {/* Header bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-900/20 transition-colors select-none"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-300">
            {t('profile:matchDetail.hand', { number: hand.hand_number })}
          </span>
          <span className="text-[10px] text-slate-500">
            {t('profile:matchDetail.blinds', {
              small: hand.small_blind,
              big: hand.big_blind,
            })}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Small community cards list */}
          {hand.public_board && hand.public_board.length > 0 ? (
            <div className="flex gap-1">
              {hand.public_board.map((card: string, idx: number) => (
                <PlayingCard key={`${card}-${idx}`} card={card} size="mini" />
              ))}
            </div>
          ) : null}

          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Expanded panel details */}
      {expanded && (
        <div className="border-t border-slate-800 p-4 bg-slate-950/20 space-y-4 animate-slide-down">
          {/* Actions log list */}
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {t('profile:matchDetail.actionsLog')}
            </h5>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {hand.actions && hand.actions.length > 0 ? (
                hand.actions.map((act: ActionHistoryResponse) => (
                  <div
                    key={act.sequence_no}
                    className="text-xs flex justify-between p-1 bg-slate-900/30 rounded border border-slate-900/40"
                  >
                    <div className="flex gap-2">
                      <span className="text-[10px] text-slate-500 uppercase font-mono w-14 shrink-0">
                        {enumLabel('street', act.street)}
                      </span>
                      <span className="font-semibold text-slate-300">
                        {t('common:playerFallback', { id: act.account_id })}
                      </span>
                      <span className="text-purple-400 font-bold">
                        {enumLabel('action', act.action)}
                      </span>
                    </div>
                    {act.amount !== null && act.amount !== undefined && (
                      <span className="text-slate-400 font-mono">{formatChips(act.amount)}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-600">{t('profile:matchDetail.noActions')}</div>
              )}
            </div>
          </div>

          {/* Showdown payoffs */}
          {hand.settlement_summary && (
            <div className="border-t border-slate-800/60 pt-3">
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t('profile:matchDetail.payouts')}
              </h5>
              <div className="space-y-1 text-xs">
                {Object.entries(hand.settlement_summary).map(([accId, payout]) => {
                  if (typeof payout !== 'number') return null;
                  return (
                    <div key={accId} className="flex justify-between items-center font-semibold">
                      <span className="text-slate-400">
                        {t('common:playerFallback', { id: accId })}
                      </span>
                      <span className={payout >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {payout >= 0 ? '+' : ''}
                        {t('profile:matchDetail.chips', { amount: formatChips(payout) })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export default PlayerProfile;
