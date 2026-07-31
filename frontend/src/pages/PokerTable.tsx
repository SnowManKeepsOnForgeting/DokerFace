import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/game';
import { useAuth } from '../api/auth-context';
import { createCommandId } from '../api/command-id';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { PlayingCard, CardBack } from '../components/PlayingCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useReducedMotion } from '../lib/useReducedMotion';
import { orderPlayersForViewer } from '../lib/tableSeats';
import type { ActionType } from '../contracts/realtime';
import {
  Clock,
  Coins,
  DoorOpen,
  LogOut,
  MessageSquare,
  Send,
  Shield,
  Smile,
  Sparkles,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';
import { useRealtimeError } from '../i18n/useRealtimeError';
import { deriveSettlementCue, deriveSoundCues, useSound, type GameSnapshot } from '../sound';

interface PokerTableProps {
  roomId: string;
  onLeave: () => void;
}

const QUICK_PHRASES = [
  'Good luck, everyone!',
  'Nice hand!',
  'Check it down?',
  'Tough luck.',
  'Deal me in!',
];

/*
 * Seat order is rotated so the current player is always index 0 at the bottom.
 * Each player count gets a balanced ring; heads-up therefore reads like a real
 * table instead of putting the opponent on the lower-left edge.
 */
const SEAT_POSITION_CLASSES_BY_COUNT: Record<number, string[]> = {
  2: ['bottom-0 left-1/2 -translate-x-1/2', 'top-0 left-1/2 -translate-x-1/2'],
  3: [
    'bottom-0 left-1/2 -translate-x-1/2',
    'top-[8%] left-[18%] -translate-x-1/2',
    'top-[8%] right-[18%] translate-x-1/2',
  ],
  4: [
    'bottom-0 left-1/2 -translate-x-1/2',
    'top-1/2 left-0 -translate-y-1/2',
    'top-0 left-1/2 -translate-x-1/2',
    'top-1/2 right-0 translate-y-1/2',
  ],
  5: [
    'bottom-0 left-1/2 -translate-x-1/2',
    'bottom-[10%] left-[4%]',
    'top-[8%] left-[18%] -translate-x-1/2',
    'top-[8%] right-[18%] translate-x-1/2',
    'bottom-[10%] right-[4%]',
  ],
  6: [
    'bottom-0 left-1/2 -translate-x-1/2',
    'bottom-[10%] left-[2%]',
    'top-1/2 left-0 -translate-y-1/2',
    'top-0 left-1/2 -translate-x-1/2',
    'top-1/2 right-0 -translate-y-1/2',
    'bottom-[10%] right-[2%]',
  ],
  7: [
    'bottom-0 left-1/2 -translate-x-1/2',
    'bottom-[10%] left-[2%]',
    'top-[38%] left-0 -translate-y-1/2',
    'top-[8%] left-[18%] -translate-x-1/2',
    'top-[8%] right-[18%] translate-x-1/2',
    'top-[38%] right-0 -translate-y-1/2',
    'bottom-[10%] right-[2%]',
  ],
  8: [
    'bottom-0 left-1/2 -translate-x-1/2',
    'bottom-[12%] left-0',
    'top-[38%] left-0 -translate-y-1/2',
    'top-0 left-[25%] -translate-x-1/2',
    'top-0 left-1/2 -translate-x-1/2',
    'top-0 left-[75%] -translate-x-1/2',
    'top-[38%] right-0 -translate-y-1/2',
    'bottom-[12%] right-0',
  ],
};

function seatPositionClass(playerCount: number, index: number): string {
  const positions =
    SEAT_POSITION_CLASSES_BY_COUNT[playerCount] ?? SEAT_POSITION_CLASSES_BY_COUNT[8];
  return positions[index] ?? positions[0];
}

export function PokerTable({ roomId, onLeave }: PokerTableProps) {
  const { user } = useAuth();
  const { t } = useTranslation(['game', 'room', 'common']);
  const enumLabel = useEnumLabel();
  const { formatChips, formatTime } = useFormatters();
  const realtimeError = useRealtimeError();
  const prefersReducedMotion = useReducedMotion();
  const { muted, toggleMuted, play, prime } = useSound();
  const {
    publicSnapshot,
    privateSnapshot,
    connected,
    pendingAction,
    lastCommandError,
    submitAction,
    activeEmotes,
    sendEmote,
    chatMessages,
    sendChat,
    handSettled,
    matchSettled,
    resetGame,
    leaveRoom,
    quitMatch,
  } = useGameStore();

  const activeSnapshot = publicSnapshot ?? privateSnapshot;
  const sameHandPrivateSnapshot =
    activeSnapshot &&
    privateSnapshot?.match_id === activeSnapshot.match_id &&
    privateSnapshot.hand_id === activeSnapshot.hand_id
      ? privateSnapshot
      : null;
  const currentPrivateSnapshot =
    sameHandPrivateSnapshot?.state_version === activeSnapshot?.state_version
      ? sameHandPrivateSnapshot
      : null;
  const visibleHoleCards = sameHandPrivateSnapshot?.hole_cards ?? [];

  const [betAmount, setBetAmount] = useState<number>(0);
  const [showEmotesMenu, setShowEmotesMenu] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
  const previousSnapshotRef = useRef<GameSnapshot | null>(null);
  const playedSettlementKeysRef = useRef(new Set<string>());
  // Messages already in the list when the table mounts are not new, and the
  // stored list is capped, so the last read message id is tracked instead of a
  // message count.
  const [lastReadChatId, setLastReadChatId] = useState<string | null>(
    chatMessages[chatMessages.length - 1]?.message_id ?? null,
  );
  const latestChatId = chatMessages[chatMessages.length - 1]?.message_id ?? null;
  const hasUnreadChat = !showChat && latestChatId !== null && latestChatId !== lastReadChatId;

  // Opening the panel clears the badge; closing it also marks what was on
  // screen as read, so only chat arriving afterwards raises the badge again.
  const toggleChat = () => {
    setLastReadChatId(latestChatId);
    setShowChat((visible) => !visible);
  };

  const closeChat = () => {
    setLastReadChatId(latestChatId);
    setShowChat(false);
  };

  useEffect(() => {
    if (showChat && chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages, showChat]);

  // Sound is a pure consumer of authoritative snapshot differences. The first
  // snapshot and reconnect jumps become a new baseline, so reconnecting never
  // replays every missed action or deals the whole board audibly.
  useEffect(() => {
    const heroAccountId = user?.account_id;
    if (!activeSnapshot || heroAccountId === undefined) return;

    const previousSnapshot = previousSnapshotRef.current;
    for (const soundCue of deriveSoundCues(previousSnapshot, activeSnapshot, heroAccountId)) {
      play(soundCue.cue);
    }
    previousSnapshotRef.current = activeSnapshot;
  }, [activeSnapshot, play, user?.account_id]);

  useEffect(() => {
    const heroAccountId = user?.account_id;
    if (heroAccountId === undefined) return;

    const settlements = [handSettled, matchSettled].filter(Boolean);
    for (const settlement of settlements) {
      if (!settlement) continue;
      for (const soundCue of deriveSettlementCue(settlement, heroAccountId)) {
        if (playedSettlementKeysRef.current.has(soundCue.key)) continue;
        playedSettlementKeysRef.current.add(soundCue.key);
        play(soundCue.cue);
      }
    }
  }, [handSettled, matchSettled, play, user?.account_id]);

  const handleLeave = async (resetAfterSuccess = false) => {
    if (isLeaving) return;
    setIsLeaving(true);
    setLeaveError(null);
    const response = await leaveRoom(roomId);
    if (response.ok) {
      if (resetAfterSuccess) resetGame();
      onLeave();
    } else {
      setLeaveError(
        response.error === 'room_active'
          ? t('room:leaveError.active')
          : t('room:leaveError.generic', { reason: realtimeError(response.error) }),
      );
    }
    setIsLeaving(false);
  };

  const handleQuit = async () => {
    if (isQuitting || !activeSnapshot) return;
    setIsQuitting(true);
    setLeaveError(null);
    const response = await quitMatch({
      schema_version: 1,
      command_id: createCommandId(),
      match_id: activeSnapshot.match_id,
      hand_id: activeSnapshot.hand_id,
      state_version: activeSnapshot.state_version,
    });
    if (response.ok) {
      setIsQuitting(false);
      onLeave();
      return;
    }
    setLeaveError(t('game:quitError', { reason: realtimeError(response.error) }));
    setIsQuitting(false);
  };

  const handleSendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    void sendChat(roomId, content);
    setChatInput('');
  };

  // Public state advances immediately; same-hand private data only augments it.
  const myPlayer = activeSnapshot?.players.find((p) => p.account_id === user?.account_id);

  if (!activeSnapshot) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">
          {t('game:table.dealing')}
        </p>
      </div>
    );
  }

  const {
    board = [],
    players = [],
    pot_amounts = [],
    actor_account_id,
    button_account_id,
    street,
    hand_number,
    action_deadline_at,
  } = activeSnapshot;

  const totalPot = pot_amounts.reduce((sum, amt) => sum + amt, 0);
  const isMyTurn = actor_account_id === user?.account_id;
  // The mobile action bar is pinned to the viewport bottom, so it overlays the table stage.
  const showActionBar = isMyTurn && Boolean(currentPrivateSnapshot);
  const orderedPlayers = orderPlayersForViewer(players, user?.account_id);

  const betAction = currentPrivateSnapshot?.legal_actions.find(
    (action) => action.action === 'bet_or_raise',
  );
  const minBetAmount = betAction?.min_amount ?? 10;
  const maxBetAmount = betAction?.max_amount ?? myPlayer?.stack ?? 1000;
  const effectiveBetAmount = Math.min(
    maxBetAmount,
    Math.max(minBetAmount, betAmount || minBetAmount),
  );
  const latestActionByAccount = new Map<
    number,
    NonNullable<typeof activeSnapshot.actions>[number]
  >();
  for (const action of activeSnapshot.actions ?? []) {
    latestActionByAccount.set(action.account_id, action);
  }

  // Emote options
  const emotes = ['👍', '👎', '🔥', '😮', '😂', '😭', '💩', '🤡'];

  const handleAction = (
    actionName: 'fold' | 'check_or_call' | 'bet_or_raise' | 'show' | 'muck',
  ) => {
    if (!currentPrivateSnapshot) return;

    let amount: number | undefined = undefined;
    if (actionName === 'bet_or_raise') {
      amount = effectiveBetAmount;
    }

    submitAction({
      match_id: currentPrivateSnapshot.match_id,
      hand_id: currentPrivateSnapshot.hand_id,
      state_version: currentPrivateSnapshot.state_version,
      action: actionName,
      amount,
      command_id: createCommandId(),
    });
  };

  return (
    <div
      className="relative flex min-h-full w-full flex-col overflow-x-clip bg-canvas font-sans lg:h-full lg:min-h-0"
      onPointerDown={prime}
    >
      {/* Hand status / stats bar */}
      <header className="z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-border-subtle bg-surface-raised/90 px-3 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <Badge tone="accent" size="sm" className="min-w-0 max-w-full normal-case">
            {t('game:header.street', { street: enumLabel('street', street) })}
          </Badge>
          <span className="shrink-0 text-xs font-semibold text-slate-400">
            {t('game:header.hand', { number: hand_number })}
          </span>
          <span
            aria-label={
              connected ? 'Realtime connection active' : 'Realtime connection unavailable'
            }
            className={`hidden items-center gap-1.5 text-[10px] font-semibold sm:flex ${connected ? 'text-success' : 'text-danger'}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`}
            />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={toggleMuted}
            aria-pressed={muted}
            aria-label={muted ? t('game:header.unmute') : t('game:header.mute')}
            title={muted ? t('game:header.unmute') : t('game:header.mute')}
            className="focus-ring flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control border border-border-subtle bg-surface-hover text-slate-300 transition-colors hover:border-border-strong hover:text-slate-100"
          >
            {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
          </button>
          <button
            type="button"
            onClick={toggleChat}
            aria-label={showChat ? t('game:header.hideChat') : t('game:header.showChat')}
            className="focus-ring relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control border border-border-subtle bg-surface-hover text-slate-300 transition-colors hover:border-border-strong hover:text-slate-100"
          >
            <MessageSquare className="h-4.5 w-4.5" />
            {hasUnreadChat && (
              <span
                data-testid="chat-unread-badge"
                aria-label={t('game:header.unreadChat')}
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-purple-500"
              />
            )}
          </button>
          {/* Quick emotes menu toggle */}
          <button
            type="button"
            onClick={() => setShowEmotesMenu(!showEmotesMenu)}
            aria-label={showEmotesMenu ? t('game:header.hideEmotes') : t('game:header.showEmotes')}
            className="focus-ring flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control border border-border-subtle bg-surface-hover text-slate-300 transition-colors hover:border-border-strong hover:text-slate-100"
          >
            <Smile className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => void handleQuit()}
            disabled={isLeaving || isQuitting || !activeSnapshot}
            className="focus-ring flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-danger-border bg-danger-surface px-3 text-xs font-bold text-danger uppercase transition-all hover:border-danger hover:bg-rose-900 hover:text-white disabled:cursor-wait disabled:opacity-60 sm:flex-none sm:px-4"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isQuitting ? t('game:header.quitting') : t('game:header.quit')}
          </button>
          <button
            onClick={() => void handleLeave()}
            disabled={isLeaving || isQuitting}
            className="focus-ring flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-border-strong/60 bg-surface-hover px-3 text-xs font-bold text-slate-300 uppercase transition-all hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 sm:flex-none sm:px-4"
          >
            <DoorOpen className="h-3.5 w-3.5" />
            {isLeaving ? t('game:header.leaving') : t('game:header.leave')}
          </button>
        </div>
      </header>

      {leaveError && (
        <div
          role="alert"
          className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-center text-xs font-semibold text-rose-300"
        >
          {leaveError}
        </div>
      )}

      {/* Floating Emote panel */}
      {showEmotesMenu && (
        <div className="absolute top-16 right-4 z-20 flex gap-2 rounded-panel border border-border-subtle bg-surface-raised p-3 shadow-2xl animate-slide-down sm:right-6">
          {emotes.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                sendEmote(roomId, emoji);
                setShowEmotesMenu(false);
              }}
              className="focus-ring flex h-9 w-9 cursor-pointer items-center justify-center rounded-control text-lg transition-colors hover:bg-surface-hover active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {showChat && (
        <aside className="absolute inset-x-3 bottom-3 top-16 z-20 flex flex-col rounded-panel border border-border-strong bg-surface-raised/95 p-4 shadow-2xl backdrop-blur-md sm:right-4 sm:left-auto sm:w-80">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-purple-400">
              <MessageSquare className="h-4 w-4" />
              {t('game:chat.title')}
            </h2>
            <button
              onClick={closeChat}
              aria-label={t('game:chat.close')}
              className="focus-ring flex h-8 w-8 cursor-pointer items-center justify-center rounded-control text-slate-400 hover:bg-surface-hover hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={chatListRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-thin"
          >
            {chatMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs font-semibold uppercase text-slate-600">
                {t('game:chat.empty')}
              </div>
            ) : (
              chatMessages.map((message) => (
                <div key={message.message_id} className="max-w-full space-y-1 break-words text-xs">
                  <div className="flex items-baseline justify-between gap-3 text-[10px] text-slate-500">
                    <span className="truncate font-bold text-purple-400">
                      {message.account_id === user?.account_id
                        ? t('common:you')
                        : message.display_name ||
                          t('common:playerFallback', { id: message.account_id })}
                    </span>
                    <span className="shrink-0">{formatTime(message.created_at)}</span>
                  </div>
                  <p className="rounded-control border border-border-subtle bg-surface-sunken px-2.5 py-2 text-slate-200">
                    {message.content}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="my-3 flex shrink-0 flex-wrap gap-1.5">
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                onClick={() => void sendChat(roomId, phrase, 'quick')}
                className="focus-ring cursor-pointer rounded-control border border-border-strong/70 bg-surface-hover px-2 py-1 text-[10px] text-slate-300 transition-colors hover:bg-slate-700"
              >
                {phrase}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="flex shrink-0 gap-2">
            <input
              type="text"
              aria-label={t('game:chat.inputLabel')}
              placeholder={t('game:chat.placeholder')}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              className="focus-ring h-10 min-w-0 flex-1 rounded-control border border-border-strong bg-surface-sunken px-3 text-xs text-slate-100 outline-none focus:border-accent/60"
            />
            <button
              type="submit"
              aria-label={t('game:chat.send')}
              className="focus-ring flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control bg-accent-strong text-white transition-colors hover:bg-accent"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      )}

      {/* The felt and the seats share a stage, but seats remain outside the felt DOM and bounds. */}
      <div
        data-testid="table-stage"
        className={`min-h-0 flex-1 overflow-visible lg:overflow-y-auto lg:pb-0 ${
          showActionBar ? 'pb-28' : ''
        }`}
      >
        <div
          data-testid="player-rail"
          className="relative mx-auto min-h-[30rem] w-full max-w-6xl overflow-visible p-3 md:min-h-[54rem] md:p-4"
        >
          {/* Felt Canvas */}
          <div
            data-testid="felt-table"
            className="absolute top-1/2 left-1/2 flex aspect-[3/4] w-[54%] max-w-[16rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[40%] border-[7px] border-double border-rail bg-[radial-gradient(ellipse_at_center,var(--color-felt-light),var(--color-felt-dark))] p-3 shadow-[0_24px_80px_rgba(2,6,23,0.55),inset_0_0_34px_rgba(2,6,23,0.42)] md:aspect-[2/1] md:w-[78%] md:max-w-4xl md:rounded-[200px] md:border-[10px] md:p-6"
          >
            <div className="pointer-events-none absolute inset-2 rounded-[38%] border border-felt-line md:rounded-[190px]" />
            <div className="pointer-events-none absolute inset-[7%] rounded-[35%] border border-white/5 md:rounded-[180px]" />

            {/* Center Community Board & Pot */}
            <div className="z-10 flex flex-col items-center gap-2 text-center select-none md:gap-4">
              <div className="flex min-w-28 flex-col items-center gap-0.5 rounded-control border border-white/10 bg-black/35 px-3 py-1.5 text-slate-200 shadow-md backdrop-blur-sm md:min-w-36 md:px-4 md:py-2">
                <div className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-chip md:h-4 md:w-4" />
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    {t('game:table.potLabel')}
                  </span>
                </div>
                <span className="text-sm font-black tabular-nums text-slate-50 md:text-base">
                  {formatChips(totalPot)}
                </span>
                <span className="sr-only">
                  {t('game:table.pot', { amount: formatChips(totalPot) })}
                </span>
                {pot_amounts.length > 1 ? (
                  <div className="mt-1 flex max-w-full flex-wrap justify-center gap-1">
                    {pot_amounts.map((amount, index) => (
                      <span
                        key={`${index}-${amount}`}
                        className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-300"
                      >
                        {t('game:table.potNumber', {
                          number: index + 1,
                          amount: formatChips(amount),
                        })}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div
                aria-label={t('game:table.communityCards')}
                className="grid grid-cols-5 gap-1 sm:flex sm:gap-2"
              >
                {[0, 1, 2, 3, 4].map((index) => {
                  const card = board[index];
                  return card ? (
                    <div key={index}>
                      <PlayingCard
                        card={card}
                        size="board"
                        animated={!prefersReducedMotion}
                        delayMs={index * 55}
                      />
                    </div>
                  ) : (
                    <div
                      key={index}
                      className="h-9 w-[1.6rem] rounded-control border-2 border-white/10 bg-black/15 shadow-inner sm:h-14 sm:w-10 md:h-18 md:w-12"
                    />
                  );
                })}
              </div>

              {action_deadline_at && (
                <div className="flex items-center gap-1.5 rounded-full border border-warning-border bg-black/40 px-3 py-1 text-xs font-bold text-warning">
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <TimerCountdown deadline={action_deadline_at} />
                </div>
              )}
            </div>
          </div>

          {orderedPlayers.map((player, visualIndex) => {
            const positionClass = seatPositionClass(players.length, visualIndex);
            const isActive = player.account_id === actor_account_id;
            const latestAction = latestActionByAccount.get(player.account_id);
            const isButton = player.account_id === button_account_id;
            const isHero = player.account_id === user?.account_id;
            const memberEmotes = activeEmotes.filter((e) => e.account_id === player.account_id);
            const activeEmote = memberEmotes[memberEmotes.length - 1];
            const hasVisibleHoleCards = isHero && visibleHoleCards.length > 0;

            return (
              <article
                key={player.account_id}
                data-testid={`player-card-${player.account_id}`}
                data-visual-seat-index={visualIndex}
                className={`absolute z-10 flex w-14 flex-col items-center gap-0.5 rounded-panel border bg-slate-950/90 p-1 text-center shadow-xl backdrop-blur-sm sm:w-16 sm:gap-1 sm:p-1.5 md:w-28 md:gap-2 md:p-2 ${positionClass} ${
                  isActive
                    ? 'border-warning shadow-[0_0_0_3px_rgba(251,191,36,0.12),0_12px_30px_rgba(245,158,11,0.16)]'
                    : 'border-border-subtle'
                }`}
              >
                {isActive && !prefersReducedMotion ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 rounded-panel border border-warning/70 animate-pulse-ring"
                  />
                ) : null}

                {activeEmote && (
                  <div className="animate-emote-float absolute -top-4 right-0 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-accent-border bg-surface-raised text-lg shadow-lg shadow-black/40 md:-top-5 md:h-9 md:w-9 md:text-xl">
                    {activeEmote.emote}
                  </div>
                )}

                {isButton && (
                  <div
                    aria-label={t('game:table.dealerButton')}
                    className="absolute -right-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-black text-slate-900 shadow md:h-6 md:w-6 md:text-[10px]"
                  >
                    D
                  </div>
                )}

                <PlayerAvatar
                  accountId={player.account_id}
                  fallbackName={player.display_name}
                  label={t('game:table.avatarLabel', { name: player.display_name })}
                  className={`h-7 w-7 border text-[9px] sm:h-8 sm:w-8 sm:text-[10px] md:h-10 md:w-10 md:text-xs ${
                    isActive ? 'border-amber-400 ring-2 ring-amber-500/20' : 'border-white/10'
                  }`}
                />
                <span className="w-full truncate text-[9px] font-bold text-slate-200 md:text-[11px]">
                  {player.display_name}
                </span>
                <span className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-success md:text-[10px]">
                  {formatChips(player.stack)}
                </span>

                <div
                  data-testid={isHero ? 'hero-hole-cards' : `hole-cards-${player.account_id}`}
                  className={`flex items-center justify-center gap-0.5 ${player.folded ? 'opacity-40' : ''}`}
                  aria-label={
                    isHero ? t('game:table.heroHoleCards') : t('game:table.hiddenHoleCards')
                  }
                >
                  {hasVisibleHoleCards
                    ? visibleHoleCards.map((card, index) => (
                        <PlayingCard
                          key={`${activeSnapshot.hand_id}-${card}`}
                          card={card}
                          size="seat"
                          animated={!prefersReducedMotion}
                          delayMs={index * 70}
                        />
                      ))
                    : [0, 1].map((index) => <CardBack key={index} size="seat" />)}
                </div>

                {latestAction ? (
                  <span className="max-w-full truncate rounded-full border border-accent-border bg-accent-muted px-1.5 py-0.5 text-[8px] font-bold text-accent-text md:text-[9px]">
                    {enumLabel('action', latestAction.action)}
                    {latestAction.amount ? ` ${formatChips(latestAction.amount)}` : ''}
                  </span>
                ) : null}

                {player.bet > 0 && (
                  <div className="flex items-center gap-1 rounded-full border border-warning-border bg-black/40 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-warning md:px-2 md:text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-chip" />
                    {formatChips(player.bet)}
                  </div>
                )}

                {!player.connected && (
                  <span className="absolute -bottom-2 flex items-center gap-1 rounded-control border border-danger-border bg-danger-surface px-1.5 py-0.5 text-[8px] font-bold text-danger">
                    <WifiOff className="h-2.5 w-2.5" />
                    {t('game:table.disconnected')}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* Action Decision Control Bar */}
      {showActionBar && currentPrivateSnapshot && (
        <section
          data-testid="action-bar"
          className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 border-t border-border-subtle bg-surface-raised/95 p-3 shadow-[0_-12px_30px_rgba(2,6,23,0.22)] backdrop-blur-md animate-slide-up sm:gap-4 sm:p-4 lg:static lg:shadow-none"
        >
          {lastCommandError && (
            <div
              role="status"
              aria-live="polite"
              className="mx-auto w-full max-w-2xl rounded-control border border-danger-border bg-danger-surface px-3 py-2 text-center text-xs font-semibold text-danger"
            >
              {t('game:action.failed', { reason: realtimeError(lastCommandError) })}
            </div>
          )}

          {/* Bet slider */}
          {betAction && (
            <div className="mx-auto flex w-full max-w-2xl items-center gap-2 sm:gap-4">
              <span className="w-10 shrink-0 text-right text-[10px] font-semibold text-slate-400 sm:w-12 sm:text-xs">
                {formatChips(minBetAmount)}
              </span>
              <input
                type="range"
                aria-label={t('game:action.amountLabel')}
                min={minBetAmount}
                max={maxBetAmount}
                step={10}
                value={effectiveBetAmount}
                onChange={(e) =>
                  setBetAmount(
                    Math.min(
                      maxBetAmount,
                      Math.max(minBetAmount, parseInt(e.target.value, 10) || minBetAmount),
                    ),
                  )
                }
                className="h-2 flex-1 cursor-pointer rounded-full bg-surface-sunken accent-purple-500"
              />
              <span className="w-10 shrink-0 text-[10px] font-semibold text-slate-400 sm:w-12 sm:text-xs">
                {formatChips(maxBetAmount)}
              </span>
              <input
                type="number"
                aria-label={t('game:action.amountLabel')}
                min={minBetAmount}
                max={maxBetAmount}
                value={effectiveBetAmount}
                onChange={(e) =>
                  setBetAmount(
                    Math.min(
                      maxBetAmount,
                      Math.max(minBetAmount, parseInt(e.target.value, 10) || minBetAmount),
                    ),
                  )
                }
                className="focus-ring h-8 w-16 shrink-0 rounded-control border border-border-subtle bg-surface-sunken text-center text-xs font-bold text-accent-text outline-none focus:border-accent/60 sm:w-20"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex w-full flex-wrap justify-center gap-2 sm:gap-3">
            {currentPrivateSnapshot.legal_actions.map((act) => {
              const themeMap: Record<string, string> = {
                fold: 'bg-danger-surface hover:bg-rose-900 border-danger-border hover:border-danger text-danger',
                check_or_call: 'bg-accent-strong hover:bg-accent border-accent text-white',
                bet_or_raise: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white',
                show: 'bg-amber-600 hover:bg-amber-500 border-amber-500 text-white',
                muck: 'bg-surface-hover hover:bg-slate-700 border-border-strong text-slate-200',
              };

              const btnTheme = themeMap[act.action] || 'bg-slate-800 text-slate-200';

              // Dynamic label split for check/call and bet/raise. The English labels stay
              // lowercase because the button applies `uppercase` for display.
              let actionKey: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'show' | 'muck' = 'fold';
              if (act.action === 'check_or_call') {
                actionKey = act.min_amount && act.min_amount > 0 ? 'call' : 'check';
              } else if (act.action === 'bet_or_raise') {
                const isRaise = players.some((p) => p.bet > 0);
                actionKey = isRaise ? 'raise' : 'bet';
              } else if (act.action === 'show' || act.action === 'muck') {
                actionKey = act.action;
              }
              const actionLabel = t(`game:action.${actionKey}`);

              return (
                <button
                  key={act.action}
                  onClick={() => handleAction(act.action as ActionType)}
                  disabled={!connected || Boolean(pendingAction)}
                  aria-keyshortcuts={
                    actionKey === 'fold'
                      ? 'F'
                      : actionKey === 'check' || actionKey === 'call'
                        ? 'C'
                        : actionKey === 'bet' || actionKey === 'raise'
                          ? 'R'
                          : undefined
                  }
                  className={`focus-ring flex h-10 cursor-pointer items-center gap-1.5 rounded-control border px-3.5 text-[11px] font-bold uppercase tracking-wider shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:gap-2 sm:px-6 sm:text-xs ${btnTheme}`}
                >
                  {actionLabel}
                  {(actionKey === 'call' || act.action === 'bet_or_raise') && (
                    <span className="bg-black/25 px-1.5 py-0.5 rounded text-[10px] font-black">
                      {actionKey === 'call'
                        ? formatChips(myPlayer ? Math.min(myPlayer.stack, act.min_amount ?? 0) : 0)
                        : formatChips(effectiveBetAmount)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Hand Settlement payoff overlay */}
      {handSettled && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md overflow-hidden rounded-panel border border-border-subtle bg-surface-raised p-6 text-center shadow-2xl">
            {/* Glow */}
            <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-purple-500 to-indigo-400" />
            <h3 className="flex items-center justify-center gap-2 text-xl font-bold text-slate-100">
              <Shield className="h-5 w-5 text-purple-400" />
              {t('game:handSettled.title')}
            </h3>

            {/* Payoff summaries per player */}
            <div className="my-6 space-y-3 rounded-control border border-border-subtle bg-surface-sunken p-3">
              {handSettled.account_ids.map((accId: number, idx: number) => {
                const payoff = handSettled.payoffs[idx] ?? 0;
                if (payoff === 0) return null;
                return (
                  <div
                    key={accId}
                    className="flex justify-between items-center text-xs font-semibold"
                  >
                    <span className="text-slate-400">
                      {handSettled.display_names?.[idx] ||
                        t('common:playerFallback', { id: accId })}
                    </span>
                    <span className={payoff > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {payoff > 0 ? '+' : ''}
                      {t('game:handSettled.chips', { amount: formatChips(payoff) })}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="animate-pulse text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
              {t('game:handSettled.next')}
            </p>
          </div>
        </div>
      )}

      {/* Match Settled Leaderboard final overlay */}
      {matchSettled && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg overflow-hidden rounded-panel border border-border-subtle bg-surface-raised p-6 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-6">
              <h3 className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-300 to-indigo-300 bg-clip-text text-2xl font-black text-transparent">
                <Sparkles className="h-5 w-5 text-warning" />
                {t('game:matchSettled.title')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t('game:matchSettled.subtitle')}</p>
            </div>

            {/* Standings table */}
            <div className="mb-6 overflow-hidden rounded-panel border border-border-subtle bg-surface-sunken">
              {matchSettled.account_ids.map((accId: number, idx: number) => {
                const stack = matchSettled.final_stacks[idx] ?? 0;
                return (
                  <div key={accId} className="flex justify-between items-center p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-200">
                        {matchSettled.display_names?.[idx] ||
                          t('common:playerFallback', { id: accId })}
                      </span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-success">
                      {t('game:matchSettled.chips', { amount: formatChips(stack) })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => void handleLeave(true)}
                disabled={isLeaving}
                width="full"
                size="lg"
                emphasis="caps"
              >
                {isLeaving ? t('game:header.leaving') : t('game:matchSettled.backToLobby')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for client timer countdown
function TimerCountdown({ deadline }: { deadline: string }) {
  const { t } = useTranslation('game');
  const [secs, setSecs] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      setSecs(Math.max(0, Math.ceil(diff / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return <span>{t('table.timer', { seconds: secs })}</span>;
}
export default PokerTable;
