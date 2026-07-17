import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useAuth } from '../api/auth';
import { socket } from '../api/socket';
import { listRoomsApiV1RoomsGet, createRoomApiV1RoomsPost } from '../contracts/rest';
import type { RoomResponse } from '../contracts/rest/types.gen';
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

export function Lobby() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  // Default room name helper
  useEffect(() => {
    if (user && isCreateOpen) {
      setRoomName(`${user.display_name}'s Room`);
    }
  }, [user, isCreateOpen]);

  // Create Room mutation
  const createRoomMutation = useMutation<RoomResponse, ApiError, any>({
    mutationFn: async (payload) => {
      return await createRoomApiV1RoomsPost({ body: payload, throwOnError: true });
    },
    onSuccess: (data) => {
      setIsCreateOpen(false);
      navigate(`/rooms/${data.room_id}`);
    },
    onError: (err) => {
      setValidationError(err.message || 'Failed to create room');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Client side limit checks
    if (!roomName.trim()) {
      setValidationError('Room name is required');
      return;
    }
    if (visibility === 'password' && !password.trim()) {
      setValidationError('Password is required for locked rooms');
      return;
    }
    if (maxPlayers < 2 || maxPlayers > 8) {
      setValidationError('Players count must be between 2 and 8');
      return;
    }
    if (startingChips < 100 || startingChips > 100000) {
      setValidationError('Starting chips must be between 100 and 100,000');
      return;
    }
    if (smallBlind < 1 || smallBlind > 50000) {
      setValidationError('Small blind must be between 1 and 50,000');
      return;
    }
    if (bigBlind < 2 || bigBlind > 100000) {
      setValidationError('Big blind must be between 2 and 100,000');
      return;
    }
    if (bigBlind < 2 * smallBlind) {
      setValidationError('Big blind must be at least twice the small blind');
      return;
    }
    if (ante < 0 || ante > 50000) {
      setValidationError('Ante must be non-negative and up to 50,000');
      return;
    }
    if (decisionTimeout < 10 || decisionTimeout > 300) {
      setValidationError('Decision timeout must be between 10 and 300 seconds');
      return;
    }
    if (blindIncrease < 5 || blindIncrease > 100) {
      setValidationError('Blind increase interval must be between 5 and 100 hands');
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
        decision_timeout_seconds: decisionTimeout,
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
      setPasswordError('Password is required');
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
    <div className="flex-1 flex flex-col gap-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
            Lobby
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Create or join a poker table. Realtime rooms updates are synced automatically.
          </p>
        </div>

        <button
          onClick={() => {
            setValidationError(null);
            setIsCreateOpen(true);
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 text-sm font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/20 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4.5 w-4.5" />
          Create Table
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rooms by name..."
            className="w-full h-10 bg-slate-950/60 border border-slate-800 focus:border-purple-500/50 rounded-lg pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
          />
        </div>

        <div className="flex gap-2">
          {(['all', 'waiting', 'active'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`h-10 px-4 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all border ${
                statusFilter === filter
                  ? 'bg-purple-600/10 text-purple-400 border-purple-500/30'
                  : 'bg-slate-950/20 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Rooms Grid / States */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-48 rounded-xl bg-slate-900/30 border border-slate-800 animate-pulse"
            ></div>
          ))}
        </div>
      ) : roomsError ? (
        <div className="flex flex-col items-center justify-center p-12 bg-red-950/10 border border-red-900/20 rounded-xl text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
          <h2 className="font-semibold text-red-400 text-sm">Failed to fetch rooms</h2>
          <p className="text-slate-500 text-xs mt-1">Please check your connection and try again.</p>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 bg-slate-900/10 border border-slate-800 border-dashed rounded-xl text-center">
          <Users className="h-12 w-12 text-slate-700 mb-4" />
          <h2 className="font-semibold text-slate-300 text-sm">No active rooms found</h2>
          <p className="text-slate-500 text-xs mt-1 max-w-sm">
            {searchQuery
              ? 'No rooms match your filter criteria. Try adjusting your query.'
              : 'Be the first one to create a waiting room and invite your friends!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <div
              key={room.room_id}
              className="flex flex-col bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 rounded-xl p-5 shadow-lg transition-all relative overflow-hidden"
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
                      <Play className="h-2.5 w-2.5 fill-current" /> Active
                    </>
                  ) : (
                    <>
                      <Hourglass className="h-2.5 w-2.5" /> Waiting
                    </>
                  )}
                </span>

                {room.has_password ? (
                  <Lock className="h-4 w-4 text-amber-500/80" />
                ) : (
                  <Unlock className="h-4 w-4 text-slate-600" />
                )}
              </div>

              {/* Title */}
              <h2 className="font-bold text-slate-200 text-lg truncate mb-1">{room.name}</h2>

              {/* Details List */}
              <div className="space-y-1.5 text-xs text-slate-400 my-4 flex-1">
                <div className="flex justify-between">
                  <span>Blinds:</span>
                  <span className="font-semibold text-slate-300">
                    {room.rules.small_blind}/{room.rules.big_blind}
                    {room.rules.ante ? ` (Ante ${room.rules.ante})` : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Starting Chips:</span>
                  <span className="font-semibold text-slate-300">
                    {room.rules.starting_chips.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Match Mode:</span>
                  <span className="font-semibold text-slate-300 capitalize">
                    {room.rules.end_mode.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Capacity:</span>
                  <span className="font-semibold text-slate-300">
                    {room.player_count} / {room.rules.max_players} players
                  </span>
                </div>
              </div>

              {/* Join Button */}
              <button
                onClick={() => handleJoinClick(room)}
                className={`w-full h-10 mt-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  room.status === 'active'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-900/10'
                }`}
              >
                {room.status === 'active' ? 'Spectate' : 'Join Table'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Private Room Password Entry Dialog */}
      <Dialog.Root open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl z-50 font-sans animate-scaleIn">
            <div className="flex justify-between items-start mb-4">
              <Dialog.Title className="font-bold text-lg text-slate-100">Locked Room</Dialog.Title>
              <Dialog.Close className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <p className="text-slate-400 text-xs mb-4">
              This room requires a password to enter. Please input the passcode below.
            </p>

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
                placeholder="Enter password"
                className="w-full h-11 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-4 text-sm text-slate-100 placeholder-slate-700 outline-none"
              />
              <button
                type="submit"
                className="w-full h-11 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer"
              >
                Unlock and Join
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Room Creation dialog */}
      <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl z-50 font-sans animate-scaleIn">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-purple-400" />
                <Dialog.Title className="font-bold text-xl text-slate-100">
                  Room Configuration
                </Dialog.Title>
              </div>
              <Dialog.Close className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-6">
              {validationError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                  {validationError}
                </div>
              )}

              {/* General details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Room Name
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Enter table name"
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 placeholder-slate-700 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Access Code Policy
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
                      Public
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
                      Password Protected
                    </button>
                  </div>
                </div>
              </div>

              {/* Password prompt if visibility === 'password' */}
              {visibility === 'password' && (
                <div className="animate-slideDown">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set passcode for this table"
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 placeholder-slate-700 outline-none"
                  />
                </div>
              )}

              {/* Core Poker Rules */}
              <div className="border-t border-slate-800 pt-5">
                <h4 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4">
                  Poker Mechanics & Limits
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      Max Players (2-8)
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
                      Starting Chips (100 - 100k)
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
                      Decision Timeout (10-300s)
                    </label>
                    <input
                      type="number"
                      value={decisionTimeout}
                      onChange={(e) => setDecisionTimeout(parseInt(e.target.value) || 30)}
                      className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Blinds configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    Small Blind
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
                    Big Blind
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
                    Ante (Optional)
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
                    Blind Raise Interval (Hands)
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
                    Match End Policy
                  </label>
                  <select
                    value={endMode}
                    onChange={(e) =>
                      setEndMode(e.target.value as 'winner_takes_all' | 'fixed_hands')
                    }
                    className="w-full h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg px-3 text-sm text-slate-100 outline-none"
                  >
                    <option value="winner_takes_all">Winner Takes All</option>
                    <option value="fixed_hands">Fixed Hand Count</option>
                  </select>
                </div>

                {endMode === 'fixed_hands' && (
                  <div className="animate-slideDown">
                    <label className="block text-xs font-semibold text-slate-400 mb-2">
                      Hand Count Limit
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
                  Game Settings
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
                      <p className="text-xs font-semibold text-slate-200">Include in Stats & Elo</p>
                      <p className="text-[10px] text-slate-500">
                        Count this match toward player history rankings
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
                      <p className="text-xs font-semibold text-slate-200">Winner May Show Hand</p>
                      <p className="text-[10px] text-slate-500">
                        Allow winning players to show or muck cards
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
                    className="h-10 px-5 rounded-lg text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={createRoomMutation.isPending}
                  className="h-10 px-6 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer"
                >
                  {createRoomMutation.isPending ? 'Creating Table...' : 'Open Table'}
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
