import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/game';
import { useAuth } from '../api/auth-context';
import { createCommandId } from '../api/command-id';
import { PlayerAvatar } from '../components/PlayerAvatar';
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
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { useFormatters } from '../i18n/useFormatters';
import { useRealtimeError } from '../i18n/useRealtimeError';

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

// Backend cards use standard poker shorthand, where "T" is the ten.
const RANK_LABELS: Record<string, string> = { T: '10' };

// Seat order is rotated so the current player is always seat 0 at the bottom.
const SEAT_POSITION_CLASSES = [
  'bottom-0 left-1/2 -translate-x-1/2',
  'bottom-[12%] left-0',
  'top-[38%] left-0',
  'top-0 left-[25%] -translate-x-1/2',
  'top-0 left-1/2 -translate-x-1/2',
  'top-0 left-[75%] -translate-x-1/2',
  'top-[38%] right-0',
  'bottom-[12%] right-0',
];

export function PokerTable({ roomId, onLeave }: PokerTableProps) {
  const { user } = useAuth();
  const { t } = useTranslation(['game', 'room', 'common']);
  const enumLabel = useEnumLabel();
  const { formatChips, formatTime } = useFormatters();
  const realtimeError = useRealtimeError();
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

  const [betAmount, setBetAmount] = useState<number>(0);
  const [showEmotesMenu, setShowEmotesMenu] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
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
    if (isQuitting || !privateSnapshot) return;
    setIsQuitting(true);
    setLeaveError(null);
    const response = await quitMatch({
      schema_version: 1,
      command_id: createCommandId(),
      match_id: privateSnapshot.match_id,
      hand_id: privateSnapshot.hand_id,
      state_version: privateSnapshot.state_version,
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

  // Active snapshot choice (Hero private state takes precedence)
  const activeSnapshot = privateSnapshot || publicSnapshot;

  // Active player info
  const myPlayer = activeSnapshot?.players.find((p) => p.account_id === user?.account_id);
  const mySeat = myPlayer?.seat ?? 0;

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
  const showActionBar = isMyTurn && Boolean(privateSnapshot);
  const orderedPlayers = [...players].sort((left, right) => {
    const leftPosition = (left.seat - mySeat + 8) % 8;
    const rightPosition = (right.seat - mySeat + 8) % 8;
    return leftPosition - rightPosition;
  });

  const betAction = privateSnapshot?.legal_actions.find(
    (action) => action.action === 'bet_or_raise',
  );
  const minBetAmount = betAction?.min_amount ?? 10;
  const maxBetAmount = betAction?.max_amount ?? myPlayer?.stack ?? 1000;
  const effectiveBetAmount = Math.min(
    maxBetAmount,
    Math.max(minBetAmount, betAmount || minBetAmount),
  );

  // Emote options
  const emotes = ['👍', '👎', '🔥', '😮', '😂', '😭', '💩', '🤡'];

  // Card UI helper
  const renderCard = (cardStr: string, compact = false) => {
    if (!cardStr || cardStr.length < 2) return null;
    const rankCode = cardStr.slice(0, -1).toUpperCase();
    const rank = RANK_LABELS[rankCode] ?? rankCode;
    const suitSymbol = cardStr.slice(-1);
    const suitsMap: Record<string, { char: string; color: string }> = {
      s: { char: '♠', color: 'text-slate-800' },
      h: { char: '♥', color: 'text-rose-500' },
      d: { char: '♦', color: 'text-rose-500' },
      c: { char: '♣', color: 'text-slate-800' },
    };
    const suit = suitsMap[suitSymbol] || { char: suitSymbol, color: 'text-slate-400' };
    const cardSize = compact
      ? 'h-7 w-5 sm:h-9 sm:w-6 md:h-14 md:w-10'
      : 'h-9 w-[1.6rem] sm:h-14 sm:w-10 md:h-18 md:w-12';
    const cardPadding = compact ? 'p-0.5 md:p-1.5' : 'p-0.5 sm:p-1.5';
    const rankSize = compact ? 'text-[8px] sm:text-[9px] md:text-xs' : 'text-[9px] sm:text-xs';
    const suitSize = compact ? 'text-xs sm:text-sm md:text-xl' : 'text-sm sm:text-lg md:text-xl';

    return (
      <div
        className={`${cardSize} ${cardPadding} flex flex-col justify-between rounded-lg border border-slate-300 bg-white text-left font-sans text-slate-900 shadow-md select-none animate-deal-in`}
      >
        <div className={`${rankSize} font-black leading-none`}>{rank}</div>
        <div className={`${suitSize} text-center font-bold leading-none ${suit.color}`}>
          {suit.char}
        </div>
        <div className={`${rankSize} self-end rotate-180 font-black leading-none`}>{rank}</div>
      </div>
    );
  };

  const renderCardBack = (compact = false) => {
    const cardSize = compact
      ? 'h-7 w-5 sm:h-9 sm:w-6 md:h-14 md:w-10'
      : 'h-9 w-[1.6rem] sm:h-14 sm:w-10 md:h-18 md:w-12';

    return (
      <div
        aria-hidden="true"
        className={`${cardSize} rounded-lg border-2 border-rose-200/70 bg-rose-500 p-0.5 shadow-md`}
      >
        <div className="h-full w-full rounded border border-rose-200/60 bg-rose-400/70" />
      </div>
    );
  };

  const handleAction = (
    actionName: 'fold' | 'check_or_call' | 'bet_or_raise' | 'show' | 'muck',
  ) => {
    if (!privateSnapshot) return;

    let amount: number | undefined = undefined;
    if (actionName === 'bet_or_raise') {
      amount = effectiveBetAmount;
    }

    submitAction({
      match_id: privateSnapshot.match_id,
      hand_id: privateSnapshot.hand_id,
      state_version: privateSnapshot.state_version,
      action: actionName,
      amount,
      command_id: createCommandId(),
    });
  };

  return (
    <div className="relative flex min-h-full w-full flex-col bg-slate-950 font-sans lg:h-full lg:min-h-0">
      {/* Hand status / stats bar */}
      <header className="z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-800/80 bg-slate-900/60 px-3 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <span className="min-w-0 max-w-full rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold leading-tight text-purple-400">
            {t('game:header.street', { street: enumLabel('street', street) })}
          </span>
          <span className="shrink-0 text-xs font-semibold text-slate-400">
            {t('game:header.hand', { number: hand_number })}
          </span>
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <button
            onClick={toggleChat}
            aria-label={showChat ? t('game:header.hideChat') : t('game:header.showChat')}
            className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700"
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
            onClick={() => setShowEmotesMenu(!showEmotesMenu)}
            aria-label={showEmotesMenu ? t('game:header.hideEmotes') : t('game:header.showEmotes')}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700"
          >
            <Smile className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => void handleQuit()}
            disabled={isLeaving || isQuitting || !privateSnapshot}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-800/70 bg-rose-950/70 px-3 text-xs font-bold uppercase text-rose-200 transition-all hover:border-rose-600 hover:bg-rose-900 hover:text-white disabled:cursor-wait disabled:opacity-60 sm:flex-none sm:px-4"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isQuitting ? t('game:header.quitting') : t('game:header.quit')}
          </button>
          <button
            onClick={() => void handleLeave()}
            disabled={isLeaving || isQuitting}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700/60 bg-slate-800 px-3 text-xs font-bold uppercase text-slate-300 transition-all hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 sm:flex-none sm:px-4"
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
        <div className="absolute top-16 right-6 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl z-20 flex gap-2 animate-slide-down">
          {emotes.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                sendEmote(roomId, emoji);
                setShowEmotesMenu(false);
              }}
              className="h-9 w-9 text-lg flex items-center justify-center hover:bg-slate-800 rounded-lg transition-transform active:scale-95 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {showChat && (
        <aside className="absolute inset-x-4 bottom-4 top-16 z-20 flex flex-col rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md sm:left-auto sm:w-80">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-purple-400">
              <MessageSquare className="h-4 w-4" />
              {t('game:chat.title')}
            </h2>
            <button
              onClick={closeChat}
              aria-label={t('game:chat.close')}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
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
                  <p className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-2.5 py-2 text-slate-200">
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
                className="cursor-pointer rounded border border-slate-700/80 bg-slate-800/70 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
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
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-purple-500/60"
            />
            <button
              type="submit"
              aria-label={t('game:chat.send')}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-500"
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
          className="relative mx-auto min-h-[30rem] w-full max-w-6xl p-3 md:min-h-[54rem] md:p-4"
        >
          {/* Felt Canvas */}
          <div
            data-testid="felt-table"
            className="absolute left-1/2 top-1/2 flex aspect-[3/4] w-[52%] max-w-[15rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[40%] border-[8px] border-double border-amber-900/80 bg-gradient-to-b from-emerald-800 to-emerald-950 p-3 shadow-2xl md:aspect-[2/1] md:w-[78%] md:max-w-4xl md:rounded-[200px] md:border-[10px] md:p-6"
          >
            <div className="pointer-events-none absolute inset-2 rounded-[38%] border border-emerald-700/30 md:rounded-[190px]" />

            {/* Center Community Board & Pot */}
            <div className="z-10 flex flex-col items-center gap-2 text-center select-none md:gap-4">
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-black/40 px-3 py-1 text-slate-200 shadow-md md:px-4 md:py-1.5">
                <Coins className="h-3.5 w-3.5 text-yellow-500 md:h-4 md:w-4" />
                <span className="text-xs font-bold text-slate-100 md:text-sm">
                  {t('game:table.pot', { amount: formatChips(totalPot) })}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1 sm:flex sm:gap-2">
                {[0, 1, 2, 3, 4].map((index) => {
                  const card = board[index];
                  return card ? (
                    <div key={index}>{renderCard(card)}</div>
                  ) : (
                    <div
                      key={index}
                      className="h-9 w-[1.6rem] rounded-lg border-2 border-emerald-700/40 bg-emerald-950/20 sm:h-14 sm:w-10 md:h-18 md:w-12"
                    />
                  );
                })}
              </div>

              {action_deadline_at && (
                <div className="flex items-center gap-1.5 rounded-full border border-amber-500/10 bg-black/40 px-3 py-1 text-xs font-bold text-amber-400">
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <TimerCountdown deadline={action_deadline_at} />
                </div>
              )}
            </div>
          </div>

          {orderedPlayers.map((player) => {
            const rotatedIndex = (player.seat - mySeat + 8) % 8;
            const isActive = player.account_id === actor_account_id;
            const isButton = player.account_id === button_account_id;
            const isHero = player.account_id === user?.account_id;
            const memberEmotes = activeEmotes.filter((e) => e.account_id === player.account_id);
            const activeEmote = memberEmotes[memberEmotes.length - 1];
            const hasVisibleHoleCards = isHero && Boolean(privateSnapshot?.hole_cards?.length);

            return (
              <article
                key={player.account_id}
                data-testid={`player-card-${player.account_id}`}
                className={`absolute z-10 flex w-14 flex-col items-center gap-0.5 rounded-xl border bg-slate-950/90 p-1 text-center shadow-xl sm:w-16 sm:gap-1 sm:p-1.5 md:w-28 md:gap-2 md:rounded-2xl md:p-2 ${SEAT_POSITION_CLASSES[rotatedIndex]} ${
                  isActive ? 'border-amber-400 shadow-amber-500/20' : 'border-slate-800'
                }`}
              >
                {activeEmote && (
                  <div className="absolute -top-3 right-0 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-purple-500/30 bg-slate-900 text-lg shadow-lg shadow-black/40 animate-bounce md:-top-4 md:h-8 md:w-8 md:text-xl">
                    {activeEmote.emote}
                  </div>
                )}

                {isButton && (
                  <div className="absolute -right-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-black text-slate-900 shadow md:h-6 md:w-6 md:text-[10px]">
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
                <span className="rounded-full bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 md:text-[10px]">
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
                    ? privateSnapshot?.hole_cards?.map((card, idx) => (
                        <div key={idx}>{renderCard(card, true)}</div>
                      ))
                    : [0, 1].map((index) => <div key={index}>{renderCardBack(true)}</div>)}
                </div>

                {player.bet > 0 && (
                  <div className="flex items-center gap-1 rounded-full border border-yellow-500/20 bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-yellow-400 md:px-2 md:text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    {formatChips(player.bet)}
                  </div>
                )}

                {!player.connected && (
                  <span className="absolute -bottom-2 rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[8px] font-bold text-rose-400">
                    {t('game:table.disconnected')}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* Action Decision Control Bar */}
      {showActionBar && privateSnapshot && (
        <section
          data-testid="action-bar"
          className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-3 border-t border-slate-800 bg-slate-900 p-3 animate-slide-up sm:gap-4 sm:p-4 lg:static"
        >
          {lastCommandError && (
            <div
              role="status"
              aria-live="polite"
              className="mx-auto w-full max-w-2xl rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-center text-xs font-semibold text-rose-300"
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
                className="flex-1 accent-purple-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
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
                className="h-8 w-16 shrink-0 rounded-lg border border-slate-800 bg-slate-950 text-center text-xs font-bold text-purple-400 outline-none focus:border-purple-500/50 sm:w-20"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex w-full flex-wrap justify-center gap-2 sm:gap-3">
            {privateSnapshot.legal_actions.map((act) => {
              const themeMap: Record<string, string> = {
                fold: 'bg-rose-900/60 hover:bg-rose-900 border-rose-800 hover:border-rose-700 text-rose-200',
                check_or_call: 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white',
                bet_or_raise: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white',
                show: 'bg-amber-600 hover:bg-amber-500 border-amber-500 text-white',
                muck: 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200',
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
                  className={`flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 text-[11px] font-bold uppercase tracking-wider shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:gap-2 sm:px-6 sm:text-xs ${btnTheme}`}
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
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden text-center">
            {/* Glow */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-purple-500 to-indigo-500" />
            <h3 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              {t('game:handSettled.title')}
            </h3>

            {/* Payoff summaries per player */}
            <div className="my-6 space-y-3">
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

            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest animate-pulse">
              {t('game:handSettled.next')}
            </p>
          </div>
        </div>
      )}

      {/* Match Settled Leaderboard final overlay */}
      {matchSettled && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative overflow-hidden">
            {/* Header */}
            <div className="text-center mb-6">
              <h3 className="text-2xl font-black text-slate-100 bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
                {t('game:matchSettled.title')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t('game:matchSettled.subtitle')}</p>
            </div>

            {/* Standings table */}
            <div className="divide-y divide-slate-800 border border-slate-800 bg-slate-950/40 rounded-xl overflow-hidden mb-6">
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
                    <span className="text-sm font-bold text-emerald-400">
                      {t('game:matchSettled.chips', { amount: formatChips(stack) })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => void handleLeave(true)}
                disabled={isLeaving}
                className="flex-1 h-11 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
              >
                {isLeaving ? t('game:header.leaving') : t('game:matchSettled.backToLobby')}
              </button>
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
