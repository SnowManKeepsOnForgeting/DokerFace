import { useState } from 'react';
import { useParams } from 'react-router';
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
} from 'lucide-react';

export function PlayerProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const { user: currentUser, refetch: refetchAuth } = useAuth();
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['player', accountId] });
      refetchAuth();
    },
    onError: (err) => {
      setValidationError(err.message || 'Failed to update profile');
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
      setValidationError('Display name is required');
      return;
    }
    if (!editAvatarText.trim()) {
      setValidationError('Avatar text is required');
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(editAvatarColor)) {
      setValidationError('Avatar background color must be a valid six-digit hex code');
      return;
    }

    updateProfileMutation.mutate({
      display_name: editDisplayName.trim(),
      avatar_text: editAvatarText.trim(),
      avatar_background_color: editAvatarColor,
    });
  };

  if (isPlayerLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  if (playerError || !player) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-6 py-4 text-sm font-semibold max-w-lg mx-auto mt-6 text-center">
        Player profile not found.
      </div>
    );
  }

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'Insufficient data';
    return `${(val * 100).toFixed(1)}%`;
  };

  return (
    <div className="flex-1 flex flex-col gap-6 md:gap-8 font-sans text-slate-100">
      {/* Header Profile Section */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-6">
        <div
          className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-50"
          style={{
            backgroundImage: `linear-gradient(90deg, ${player.avatar_background_color || '#4f46e5'}, transparent)`,
          }}
        />

        <div
          className="flex h-24 w-24 min-w-0 shrink-0 items-center justify-center overflow-hidden rounded-full px-2 text-center break-all whitespace-pre-wrap leading-tight text-white font-black text-2xl shadow-xl shadow-black/20 border border-white/10"
          style={{ backgroundColor: player.avatar_background_color || '#4f46e5' }}
        >
          {player.avatar_text || player.display_name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 text-center md:text-left space-y-2 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <h2 className="text-2xl font-bold truncate">{player.display_name}</h2>

            <div className="flex items-center justify-center md:justify-start gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  player.is_online
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-sm shadow-emerald-500/10 animate-pulse'
                    : 'bg-slate-800 text-slate-500 border-slate-700/50'
                }`}
              >
                {player.is_online ? 'Online' : 'Offline'}
              </span>

              {player.rank_badge_theme && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  {player.rank_badge_theme}
                </span>
              )}
            </div>
          </div>

          <p className="text-slate-400 text-xs">Account ID: {player.account_id}</p>

          {isOwnProfile && !isEditing && (
            <button
              onClick={handleStartEdit}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 px-4 text-xs font-semibold transition-colors cursor-pointer mt-2"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit Profile
            </button>
          )}
        </div>
      </section>

      {/* Editing Form Sheet */}
      {isEditing && (
        <section className="bg-slate-900 border border-purple-500/20 rounded-2xl p-6 space-y-4 animate-slideDown">
          <h3 className="font-bold text-sm uppercase tracking-wider text-purple-400">
            Edit Custom Avatar & Nickname
          </h3>

          {validationError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-2.5 text-xs font-semibold">
              {validationError}
            </div>
          )}

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Name"
                className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-2">
                Avatar Text / Emoji
              </label>
              <input
                type="text"
                value={editAvatarText}
                onChange={(e) => setEditAvatarText(e.target.value)}
                placeholder="Avatar text"
                className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 font-semibold mb-2">
                  Avatar BG Color
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
                    placeholder="#ffffff"
                    className="flex-1 h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-center uppercase"
                  />
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="submit"
                  aria-label="Save profile"
                  disabled={updateProfileMutation.isPending}
                  className="h-10 w-10 flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel profile editing"
                  onClick={() => setIsEditing(false)}
                  className="h-10 w-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
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
              Stats
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2 text-sm font-semibold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                activeTab === 'history'
                  ? 'border-purple-500 text-purple-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Match History
            </button>
          </div>

          {activeTab === 'stats' ? (
            isStatsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-28 bg-slate-900/30 border border-slate-800/80 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : !stats ? (
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-8 text-center text-slate-500 text-sm">
                No statistics records available for this player.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 animate-fadeIn">
                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Matches Played
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {stats.matches_played}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Profitable:{' '}
                    {stats.matches_played > 0
                      ? `${((stats.profitable_matches / stats.matches_played) * 100).toFixed(0)}%`
                      : '0%'}
                  </span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Hands Dealt
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {stats.dealt_hands}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Won: {stats.won_hands} (
                    {stats.dealt_hands > 0
                      ? `${((stats.won_hands / stats.dealt_hands) * 100).toFixed(1)}%`
                      : '0%'}
                    )
                  </span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    VPIP Rate
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {formatPercent(stats.vpip_rate)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Voluntary Put Chips In Pot
                  </span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Pre-flop Raise (PFR)
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {formatPercent(stats.pfr_rate)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">Aggression indicator</span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    3-Bet Rate
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {formatPercent(stats.three_bet_rate)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">Re-raise opportunities</span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Showdown Win Rate
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {formatPercent(stats.showdown_win_rate)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Rate:{' '}
                    {stats.showdown_rate ? `${(stats.showdown_rate * 100).toFixed(0)}%` : '0%'}
                  </span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Average Pot
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {stats.average_pot !== null && stats.average_pot !== undefined
                      ? `${stats.average_pot.toFixed(0)}`
                      : 'Insufficient data'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">Total won chips size</span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Fold Rate
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">
                    {formatPercent(stats.fold_rate)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">Total decisions folds</span>
                </div>

                <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    Total All-ins
                  </span>
                  <span className="text-2xl font-bold mt-2 text-slate-200">{stats.all_ins}</span>
                  <span className="text-[10px] text-slate-500 mt-1">Total hands showdown risk</span>
                </div>
              </div>
            )
          ) : isMatchesLoading ? (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-8 h-48 animate-pulse" />
          ) : !matches || !matches.items || matches.items.length === 0 ? (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-8 text-center text-slate-500 text-sm">
              No completed matches found.
            </div>
          ) : (
            <div className="space-y-3 animate-fadeIn">
              {matches.items.map((m) => (
                <div
                  key={m.match_id}
                  onClick={() => setSelectedMatchId(m.match_id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-900/30 border border-slate-800/80 hover:border-purple-500/30 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-purple-400" />
                      <span className="font-bold text-sm text-slate-200">
                        Match ID: {m.match_id.slice(0, 8)}...
                      </span>
                      {m.void_reason && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">
                          Void
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Started: {new Date(m.started_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 mt-2 sm:mt-0 text-xs">
                    <span className="text-slate-400 uppercase tracking-wide text-[10px] font-semibold bg-slate-950/40 border border-slate-800 px-2 py-0.5 rounded">
                      {m.end_mode.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-500">{m.players?.length || 0} players</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Elo Ratings History */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-5 w-5 text-purple-400" />
            <h3 className="font-bold text-lg">Elo History</h3>
          </div>

          {isRatingsLoading ? (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-6 h-64 animate-pulse"></div>
          ) : !ratings || !ratings.items || ratings.items.length === 0 ? (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-8 text-center text-slate-500 text-sm">
              No rating batches records found.
            </div>
          ) : (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-xl divide-y divide-slate-800 overflow-hidden">
              {ratings.items.map((record: PlayerRatingHistoryEntry, index: number) => (
                <div
                  key={`${record.match_id}-${index}`}
                  className="flex items-center justify-between p-4 hover:bg-slate-900/20 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-slate-300">
                      Match ID: {record.match_id ? record.match_id.slice(0, 8) : 'Bootstrap'}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {record.created_at ? new Date(record.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-200">
                      {record.after_rating.toFixed(0)}
                    </span>
                    {record.delta !== 0 && (
                      <span
                        className={`text-xs font-bold ${
                          record.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {record.delta >= 0 ? '+' : ''}
                        {record.delta.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
  const { data: detail, isLoading } = useQuery({
    queryKey: ['match-detail', matchId],
    queryFn: () =>
      getMatchHistoryApiV1MatchesMatchIdGet({ path: { match_id: matchId }, throwOnError: true }),
  });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Top bar */}
        <header className="px-6 py-4 border-b border-slate-800/80 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Award className="h-5 w-5 text-purple-400" />
              Match Standings
            </h3>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {matchId}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-slate-350 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
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
            <div className="text-center text-slate-500 text-xs py-12">Match details missing.</div>
          ) : (
            <>
              {/* Standings */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> End Standings
                </h4>
                <div className="divide-y divide-slate-800/60 text-xs">
                  {detail.players.map((p) => (
                    <div key={p.account_id} className="flex justify-between py-2 items-center">
                      <span className="font-semibold text-slate-300">Player #{p.account_id}</span>
                      <span className="text-slate-400 font-mono">
                        {p.final_chips !== null && p.final_chips !== undefined
                          ? `${p.final_chips.toLocaleString()} chips`
                          : 'Spectator'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Played Hands List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                  Hands Played ({detail.hands?.length || 0})
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

  // Render cards helper
  const renderMiniCard = (cardStr: string) => {
    if (!cardStr || cardStr.length < 2) return null;
    const rank = cardStr.slice(0, -1).toUpperCase();
    const suitSymbol = cardStr.slice(-1);
    const suitsMap: Record<string, { char: string; color: string }> = {
      s: { char: '♠', color: 'text-slate-800' },
      h: { char: '♥', color: 'text-rose-500' },
      d: { char: '♦', color: 'text-rose-500' },
      c: { char: '♣', color: 'text-emerald-600' },
    };
    const suit = suitsMap[suitSymbol] || { char: suitSymbol, color: 'text-slate-400' };

    return (
      <div className="w-8 h-12 bg-white text-slate-900 border border-slate-300 rounded flex flex-col justify-between p-1 shadow-sm font-sans select-none text-[10px] font-bold">
        <span className="leading-none">{rank}</span>
        <span className={`text-center text-sm font-bold leading-none ${suit.color}`}>
          {suit.char}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl overflow-hidden">
      {/* Header bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-900/20 transition-colors select-none"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-300">Hand #{hand.hand_number}</span>
          <span className="text-[10px] text-slate-500">
            Blinds: {hand.small_blind}/{hand.big_blind}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Small community cards list */}
          {hand.public_board && hand.public_board.length > 0 && (
            <div className="flex gap-1">
              {hand.public_board.map((card: string, idx: number) => (
                <div key={idx} className="scale-75 origin-center">
                  {renderMiniCard(card)}
                </div>
              ))}
            </div>
          )}

          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Expanded panel details */}
      {expanded && (
        <div className="border-t border-slate-800 p-4 bg-slate-950/20 space-y-4 animate-slideDown">
          {/* Actions log list */}
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Street Actions Log
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
                        {act.street}
                      </span>
                      <span className="font-semibold text-slate-300">Player #{act.account_id}</span>
                      <span className="text-purple-400 font-bold capitalize">
                        {act.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {act.amount !== null && act.amount !== undefined && (
                      <span className="text-slate-400 font-mono">
                        {act.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-600">No actions recorded for this hand.</div>
              )}
            </div>
          </div>

          {/* Showdown payoffs */}
          {hand.settlement_summary && (
            <div className="border-t border-slate-800/60 pt-3">
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Hand settlement payouts
              </h5>
              <div className="space-y-1 text-xs">
                {Object.entries(hand.settlement_summary).map(([accId, payout]) => {
                  if (typeof payout !== 'number') return null;
                  return (
                    <div key={accId} className="flex justify-between items-center font-semibold">
                      <span className="text-slate-400">Player #{accId}</span>
                      <span className={payout >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {payout >= 0 ? '+' : ''}
                        {payout.toLocaleString()} chips
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PlayerProfile;
