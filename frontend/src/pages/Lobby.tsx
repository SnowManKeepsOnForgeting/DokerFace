import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useAuth } from '../api/auth-context';
import { socket } from '../api/socket';
import { listRoomsApiV1RoomsGet, createRoomApiV1RoomsPost } from '../contracts/rest';
import type { CreateRoomRequest, RoomResponse } from '../contracts/rest/types.gen';
import { ApiError } from '../api/client';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  Lock,
  Unlock,
  Users,
  Plus,
  X,
  Play,
  Hourglass,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';

export function Lobby() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation(['lobby', 'common']);
  const enumLabel = useEnumLabel();
  const { formatChips } = useFormatters();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'active'>('all');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [selectedPrivateRoom, setSelectedPrivateRoom] = useState<RoomResponse | null>(null);
  const [roomPassword, setRoomPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Form states for Create Room
  const [roomName, setRoomName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'password'>('public');
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [endMode, setEndMode] = useState<'winner_takes_all' | 'fixed_hands'>('winner_takes_all');
  const [fixedHandCount, setFixedHandCount] = useState(50);
  const [startingChips, setStartingChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [ante, setAnte] = useState(0);
  const [decisionTimeoutMode, setDecisionTimeoutMode] = useState<'timed' | 'unlimited'>('timed');
  const [decisionTimeout, setDecisionTimeout] = useState(30);
  const [blindIncrease, setBlindIncrease] = useState(10);
  const [winnerShow, setWinnerShow] = useState(true);
  const [countedInStats, setCountedInStats] = useState(true);

  // Form validation errors
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch rooms list
  const {
    data: roomsData,
    isLoading,
    error: roomsError,
  } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => listRoomsApiV1RoomsGet({ throwOnError: true }),
  });

  // Realtime update hook
  useEffect(() => {
    const handleRoomsUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    };

    socket.on('lobby:rooms-updated', handleRoomsUpdated);
    return () => {
      socket.off('lobby:rooms-updated', handleRoomsUpdated);
    };
  }, [queryClient]);

  // Create Room mutation
  const createRoomMutation = useMutation<RoomResponse, ApiError, CreateRoomRequest>({
    mutationFn: async (payload) => {
      return await createRoomApiV1RoomsPost({ body: payload, throwOnError: true });
    },
    onSuccess: (data) => {
      setIsCreateOpen(false);
      navigate(`/rooms/${data.room_id}`);
    },
    onError: (err) => {
      setValidationError(err.message || t('lobby:validation.createFailed'));
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Client side limit checks
    if (!roomName.trim()) {
      setValidationError(t('lobby:validation.nameRequired'));
      return;
    }
    if (visibility === 'password' && !password.trim()) {
      setValidationError(t('lobby:validation.passwordRequired'));
      return;
    }
    if (maxPlayers < 2 || maxPlayers > 8) {
      setValidationError(t('lobby:validation.maxPlayers'));
      return;
    }
    if (startingChips < 100 || startingChips > 100000) {
      setValidationError(t('lobby:validation.startingChips'));
      return;
    }
    if (smallBlind < 1 || smallBlind > 50000) {
      setValidationError(t('lobby:validation.smallBlind'));
      return;
    }
    if (bigBlind < 2 || bigBlind > 100000) {
      setValidationError(t('lobby:validation.bigBlind'));
      return;
    }
    if (bigBlind < 2 * smallBlind) {
      setValidationError(t('lobby:validation.bigBlindRatio'));
      return;
    }
    if (ante < 0 || ante > 50000) {
      setValidationError(t('lobby:validation.ante'));
      return;
    }
    if (decisionTimeoutMode === 'timed' && (decisionTimeout < 10 || decisionTimeout > 300)) {
      setValidationError(t('lobby:validation.decisionTimeout'));
      return;
    }
    if (blindIncrease < 5 || blindIncrease > 100) {
      setValidationError(t('lobby:validation.blindInterval'));
      return;
    }

    createRoomMutation.mutate({
      name: roomName.trim(),
      visibility,
      password: visibility === 'password' ? password : null,
      rules: {
        max_players: maxPlayers,
        end_mode: endMode,
        fixed_hand_count: endMode === 'fixed_hands' ? fixedHandCount : null,
        starting_chips: startingChips,
        small_blind: smallBlind,
        big_blind: bigBlind,
        ante,
        decision_timeout_seconds: decisionTimeoutMode === 'unlimited' ? null : decisionTimeout,
        blind_increase_every_hands: blindIncrease,
        show_remaining_board: false,
        winner_may_show_hand: winnerShow,
        spectators_allowed: false,
        auto_start: false,
        counted_in_stats: countedInStats,
        allow_mid_match_join: false,
        allow_rebuys: false,
        allow_voluntary_leave: false,
      },
    });
  };

  const handleJoinClick = (room: RoomResponse) => {
    if (room.has_password) {
      setSelectedPrivateRoom(room);
      setRoomPassword('');
      setPasswordError(null);
      setIsPasswordOpen(true);
    } else {
      navigate(`/rooms/${room.room_id}`);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomPassword.trim()) {
      setPasswordError(t('lobby:password.required'));
      return;
    }
    if (selectedPrivateRoom) {
      setIsPasswordOpen(false);
      navigate(`/rooms/${selectedPrivateRoom.room_id}?pw=${encodeURIComponent(roomPassword)}`);
    }
  };

  // Filter logic
  const filteredRooms = (roomsData?.items || []).filter((room) => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'waiting' && room.status === 'waiting') ||
      (statusFilter === 'active' && room.status === 'active');
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-1 flex-col gap-5 text-slate-100">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{t('lobby:title')}</h1>
          <p className="mt-1 text-xs text-slate-400">{t('lobby:subtitle')}</p>
        </div>

        <button
          onClick={() => {
            setValidationError(null);
            setRoomName(user ? t('lobby:defaultRoomName', { name: user.display_name }) : '');
            setIsCreateOpen(true);
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-accent-strong px-5 text-sm font-semibold text-white shadow-md shadow-purple-950/20 transition-colors hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('lobby:createTable')}
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col gap-3 rounded-panel border border-border-subtle bg-surface p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('lobby:searchLabel')}
            placeholder={t('lobby:searchPlaceholder')}
            className="h-10 w-full rounded-control border border-border-subtle bg-surface-sunken pl-10 pr-4 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 md:flex md:shrink-0">
          {(['all', 'waiting', 'active'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`h-10 rounded-control border px-4 text-xs font-semibold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
                statusFilter === filter
                  ? 'bg-purple-600/10 text-purple-400 border-purple-500/30'
                  : 'bg-slate-950/20 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {t(`lobby:filters.${filter}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Rooms Grid / States */}
      {isLoading ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label={t('lobby:loadingLabel')}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="flex h-56 flex-col rounded-panel border border-border-subtle bg-surface p-4 animate-shimmer"
              aria-hidden="true"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-20 rounded-control bg-surface-raised" />
                <div className="h-4 w-4 rounded-control bg-surface-raised" />
              </div>
              <div className="mt-5 h-5 w-3/5 rounded-control bg-surface-raised" />
              <div className="mt-6 space-y-3">
                <div className="h-3 w-full rounded-control bg-surface-raised" />
                <div className="h-3 w-4/5 rounded-control bg-surface-raised" />
                <div className="h-3 w-2/3 rounded-control bg-surface-raised" />
              </div>
              <div className="mt-auto h-10 w-full rounded-control bg-surface-raised" />
            </div>
          ))}
        </div>
      ) : roomsError ? (
        <div
          className="flex flex-col items-center justify-center rounded-panel border border-danger-border bg-danger-surface p-10 text-center"
          role="alert"
        >
          <AlertCircle className="mb-3 h-10 w-10 text-danger" aria-hidden="true" />
          <h2 className="font-semibold text-red-400 text-sm">{t('lobby:fetchError.title')}</h2>
          <p className="text-slate-500 text-xs mt-1">{t('lobby:fetchError.description')}</p>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-border-subtle bg-surface-sunken p-12 text-center sm:p-16">
          <Users className="mb-4 h-12 w-12 text-slate-700" aria-hidden="true" />
          <h2 className="font-semibold text-slate-300 text-sm">{t('lobby:empty.title')}</h2>
          <p className="text-slate-500 text-xs mt-1 max-w-sm">
            {searchQuery ? t('lobby:empty.filtered') : t('lobby:empty.hint')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRooms.map((room) => (
            <div
              key={room.room_id}
              className="group relative flex min-w-0 flex-col overflow-hidden rounded-panel border border-border-subtle bg-surface p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-raised animate-fade-in"
            >
              {/* Badge & Lock */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    room.status === 'active'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}
                >
                  {room.status === 'active' ? (
                    <>
                      <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />{' '}
                      {t('lobby:card.statusActive')}
                    </>
                  ) : (
                    <>
                      <Hourglass className="h-2.5 w-2.5" aria-hidden="true" />{' '}
                      {t('lobby:card.statusWaiting')}
                    </>
                  )}
                </span>

                {room.has_password ? (
                  <Lock className="h-4 w-4 text-warning" aria-label={t('lobby:card.private')} />
                ) : (
                  <Unlock className="h-4 w-4 text-slate-600" aria-label={t('lobby:card.public')} />
                )}
              </div>

              {/* Title */}
              <h2 className="font-bold text-slate-200 text-lg truncate mb-1">{room.name}</h2>

              {/* Details List */}
              <div className="space-y-1.5 text-xs text-slate-400 my-4 flex-1">
                <div className="flex justify-between">
                  <span>{t('lobby:card.blinds')}</span>
                  <span className="font-semibold text-slate-300">
                    {room.rules.small_blind}/{room.rules.big_blind}
                    {room.rules.ante ? t('lobby:card.ante', { amount: room.rules.ante }) : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('lobby:card.startingChips')}</span>
                  <span className="font-semibold text-slate-300">
                    {formatChips(room.rules.starting_chips)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('lobby:card.matchMode')}</span>
                  <span className="font-semibold text-slate-300">
                    {enumLabel('endMode', room.rules.end_mode)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('lobby:card.capacity')}</span>
                  <span className="font-semibold text-slate-300">
                    {t('lobby:card.capacityValue', {
                      current: room.player_count,
                      max: room.rules.max_players,
                    })}
                  </span>
                </div>
              </div>

              {/* Join Button */}
              <button
                onClick={() => handleJoinClick(room)}
                className={`mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-control text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer ${
                  room.status === 'active'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-900/10'
                }`}
              >
                {room.status === 'active' ? t('lobby:card.spectate') : t('lobby:card.join')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Private Room Password Entry Dialog */}
      <Dialog.Root open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,32rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-panel border border-border-subtle bg-surface-raised p-5 font-sans shadow-2xl animate-scale-in sm:p-6 scrollbar-thin focus:outline-none">
            <div className="flex justify-between items-start mb-4">
              <Dialog.Title className="font-bold text-lg text-slate-100">
                {t('lobby:password.title')}
              </Dialog.Title>
              <Dialog.Close
                aria-label={t('lobby:close')}
                className="flex h-8 w-8 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="mb-4 text-xs text-slate-400">
              {t('lobby:password.description')}
            </Dialog.Description>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordError && (
                <div className="text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                  {passwordError}
                </div>
              )}
              <input
                type="password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder={t('lobby:password.placeholder')}
                className="h-11 w-full rounded-control border border-border-subtle bg-surface-sunken px-4 text-sm text-slate-100 outline-none placeholder:text-slate-700 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15"
              />
              <button
                type="submit"
                className="h-11 w-full rounded-control bg-accent-strong text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer"
              >
                {t('lobby:password.submit')}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Room Creation dialog */}
      <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(92vh,52rem)] w-[calc(100%-1rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-panel border border-border-subtle bg-surface-raised p-4 font-sans shadow-2xl animate-scale-in sm:w-[calc(100%-2rem)] sm:p-6 scrollbar-thin focus:outline-none">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-purple-400" />
                <Dialog.Title className="font-bold text-xl text-slate-100">
                  {t('lobby:create.title')}
                </Dialog.Title>
              </div>
              <Dialog.Close
                aria-label={t('lobby:close')}
                className="flex h-8 w-8 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-6">
              {validationError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {validationError}
                </div>
              )}

              {/* General details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {t('lobby:create.roomName')}
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder={t('lobby:create.roomNamePlaceholder')}
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 placeholder-slate-700 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {t('lobby:create.accessPolicy')}
                  </label>
                  <div className="flex gap-2 h-10">
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`flex-1 rounded-lg border text-xs font-semibold transition-all ${
                        visibility === 'public'
                          ? 'bg-purple-600/10 text-purple-400 border-purple-500/30'
                          : 'bg-slate-950/20 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {t('lobby:create.public')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('password')}
                      className={`flex-1 rounded-lg border text-xs font-semibold transition-all ${
                        visibility === 'password'
                          ? 'bg-purple-600/10 text-purple-400 border-purple-500/30'
                          : 'bg-slate-950/20 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {t('lobby:create.passwordProtected')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password prompt if visibility === 'password' */}
              {visibility === 'password' && (
                <div className="animate-slide-down">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {t('lobby:create.passcode')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('lobby:create.passcodePlaceholder')}
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 placeholder-slate-700 outline-none"
                  />
                </div>
              )}

              {/* Core Poker Rules */}
              <div className="border-t border-slate-800 pt-5">
                <h4 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4">
                  {t('lobby:create.mechanicsTitle')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      {t('lobby:create.maxPlayers')}
                    </label>
                    <input
                      type="number"
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 8)}
                      className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      {t('lobby:create.startingChips')}
                    </label>
                    <input
                      type="number"
                      value={startingChips}
                      onChange={(e) => setStartingChips(parseInt(e.target.value) || 1000)}
                      className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      {t('lobby:create.decisionTime')}
                    </label>
                    <div className="flex h-10 gap-2">
                      <button
                        type="button"
                        aria-pressed={decisionTimeoutMode === 'timed'}
                        onClick={() => setDecisionTimeoutMode('timed')}
                        className={`flex-1 rounded-lg border text-xs font-semibold transition-all ${
                          decisionTimeoutMode === 'timed'
                            ? 'border-purple-500/30 bg-purple-600/10 text-purple-400'
                            : 'border-slate-800 bg-slate-950/20 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t('lobby:create.timed')}
                      </button>
                      <button
                        type="button"
                        aria-pressed={decisionTimeoutMode === 'unlimited'}
                        onClick={() => setDecisionTimeoutMode('unlimited')}
                        className={`flex-1 rounded-lg border text-xs font-semibold transition-all ${
                          decisionTimeoutMode === 'unlimited'
                            ? 'border-purple-500/30 bg-purple-600/10 text-purple-400'
                            : 'border-slate-800 bg-slate-950/20 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t('lobby:create.unlimited')}
                      </button>
                    </div>
                    {decisionTimeoutMode === 'timed' && (
                      <input
                        type="number"
                        min={10}
                        max={300}
                        value={decisionTimeout}
                        aria-label={t('lobby:create.decisionTimeoutLabel')}
                        onChange={(e) => setDecisionTimeout(parseInt(e.target.value) || 30)}
                        className="mt-2 w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Blinds configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    {t('lobby:create.smallBlind')}
                  </label>
                  <input
                    type="number"
                    value={smallBlind}
                    onChange={(e) => setSmallBlind(parseInt(e.target.value) || 10)}
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    {t('lobby:create.bigBlind')}
                  </label>
                  <input
                    type="number"
                    value={bigBlind}
                    onChange={(e) => setBigBlind(parseInt(e.target.value) || 20)}
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    {t('lobby:create.ante')}
                  </label>
                  <input
                    type="number"
                    value={ante}
                    onChange={(e) => setAnte(parseInt(e.target.value) || 0)}
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                  />
                </div>
              </div>

              {/* Blind growth & End mode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    {t('lobby:create.blindInterval')}
                  </label>
                  <input
                    type="number"
                    value={blindIncrease}
                    onChange={(e) => setBlindIncrease(parseInt(e.target.value) || 10)}
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    {t('lobby:create.endPolicy')}
                  </label>
                  <select
                    value={endMode}
                    onChange={(e) =>
                      setEndMode(e.target.value as 'winner_takes_all' | 'fixed_hands')
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                  >
                    <option value="winner_takes_all">{t('lobby:create.endModeWinner')}</option>
                    <option value="fixed_hands">{t('lobby:create.endModeFixed')}</option>
                  </select>
                </div>

                {endMode === 'fixed_hands' && (
                  <div className="animate-slide-down">
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      {t('lobby:create.handLimit')}
                    </label>
                    <input
                      type="number"
                      value={fixedHandCount}
                      onChange={(e) => setFixedHandCount(parseInt(e.target.value) || 50)}
                      className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-purple-400">
                  {t('lobby:create.settingsTitle')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={countedInStats}
                      onChange={(e) => setCountedInStats(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-purple-600 focus:ring-purple-500/30"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">
                        {t('lobby:create.countedInStats')}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {t('lobby:create.countedInStatsHint')}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={winnerShow}
                      onChange={(e) => setWinnerShow(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-purple-600 focus:ring-purple-500/30"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">
                        {t('lobby:create.winnerMayShow')}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {t('lobby:create.winnerMayShowHint')}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end border-t border-slate-800 pt-5">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="h-10 rounded-control px-5 text-sm font-semibold text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer"
                  >
                    {t('common:actions.cancel')}
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={createRoomMutation.isPending}
                  className="h-10 rounded-control bg-accent-strong px-6 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 disabled:cursor-wait disabled:bg-purple-800 cursor-pointer"
                >
                  {createRoomMutation.isPending
                    ? t('lobby:create.submitting')
                    : t('lobby:create.submit')}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
export default Lobby;
