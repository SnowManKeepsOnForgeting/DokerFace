import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/game';
import { useAuth } from '../api/auth-context';
import { createCommandId } from '../api/command-id';
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

interface PokerTableProps {
  roomId: string;
  onLeave: () => void;
}

const SEAT_POSITIONS = [
  { top: '82%', left: '50%', transform: 'translate(-50%, -50%)' }, // Seat 0 (Hero - Bottom Center)
  { top: '72%', left: '16%', transform: 'translate(-50%, -50%)' }, // Seat 1 (Bottom Left)
  { top: '38%', left: '10%', transform: 'translate(-50%, -50%)' }, // Seat 2 (Middle Left)
  { top: '12%', left: '20%', transform: 'translate(-50%, -50%)' }, // Seat 3 (Top Left)
  { top: '10%', left: '50%', transform: 'translate(-50%, -50%)' }, // Seat 4 (Top Center)
  { top: '12%', left: '80%', transform: 'translate(-50%, -50%)' }, // Seat 5 (Top Right)
  { top: '38%', left: '90%', transform: 'translate(-50%, -50%)' }, // Seat 6 (Middle Right)
  { top: '72%', left: '84%', transform: 'translate(-50%, -50%)' }, // Seat 7 (Bottom Right)
];

const QUICK_PHRASES = [
  'Good luck, everyone!',
  'Nice hand!',
  'Check it down?',
  'Tough luck.',
  'Deal me in!',
];

export function PokerTable({ roomId, onLeave }: PokerTableProps) {
  const { user } = useAuth();
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
          ? 'You cannot leave while a match is active.'
          : `Unable to leave room: ${response.error ?? 'realtime_error'}`,
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
    setLeaveError(`Unable to quit match: ${response.error ?? 'realtime_error'}`);
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
          Dealing next hand...
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
  const renderCard = (cardStr: string) => {
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
      <div className="w-10 h-14 md:w-12 md:h-18 bg-white text-slate-900 border border-slate-300 rounded-lg flex flex-col justify-between p-1.5 shadow-md font-sans select-none animate-scaleUp">
        <div className="text-xs font-black leading-none">{rank}</div>
        <div className={`text-center text-lg md:text-xl font-bold leading-none ${suit.color}`}>
          {suit.char}
        </div>
        <div className="text-xs font-black leading-none self-end rotate-180">{rank}</div>
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
    <div className="flex-1 flex flex-col relative w-full h-[calc(100vh-80px)] overflow-hidden font-sans bg-slate-950">
      {/* Hand status / stats bar */}
      <header className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-3 flex justify-between items-center shrink-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-purple-400 capitalize bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">
            Street: {street}
          </span>
          <span className="text-xs font-semibold text-slate-400">Hand #{hand_number}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowChat((visible) => !visible)}
            aria-label={showChat ? 'Hide table chat' : 'Show table chat'}
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700"
          >
            <MessageSquare className="h-5 w-5" />
            {!showChat && chatMessages.length > 0 && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-purple-500" />
            )}
          </button>
          {/* Quick emotes menu toggle */}
          <button
            onClick={() => setShowEmotesMenu(!showEmotesMenu)}
            aria-label={showEmotesMenu ? 'Hide emotes' : 'Show emotes'}
            className="h-9 w-9 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer transition-colors"
          >
            <Smile className="h-5 w-5" />
          </button>
          <button
            onClick={() => void handleQuit()}
            disabled={isLeaving || isQuitting || !privateSnapshot}
            className="h-9 px-4 bg-rose-950/70 hover:bg-rose-900 text-rose-200 hover:text-white border border-rose-800/70 hover:border-rose-600 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isQuitting ? 'Quitting...' : 'Quit'}
          </button>
          <button
            onClick={() => void handleLeave()}
            disabled={isLeaving || isQuitting}
            className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-wait disabled:opacity-60"
          >
            <DoorOpen className="h-3.5 w-3.5" />
            {isLeaving ? 'Leaving...' : 'Leave'}
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
        <div className="absolute top-16 right-6 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl z-20 flex gap-2 animate-slideDown">
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
              Table Chat
            </h2>
            <button
              onClick={() => setShowChat(false)}
              aria-label="Close table chat"
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
                No chat messages.
              </div>
            ) : (
              chatMessages.map((message) => (
                <div key={message.message_id} className="max-w-full space-y-1 break-words text-xs">
                  <div className="flex items-baseline justify-between gap-3 text-[10px] text-slate-500">
                    <span className="truncate font-bold text-purple-400">
                      {message.account_id === user?.account_id
                        ? 'You'
                        : `Player #${message.account_id}`}
                    </span>
                    <span className="shrink-0">
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
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
              aria-label="Table chat message"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-purple-500/60"
            />
            <button
              type="submit"
              aria-label="Send table chat message"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-500"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      )}

      {/* Felt Canvas */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        {/* The green felt oval */}
        <div className="w-full max-w-4xl aspect-[2/1] bg-gradient-to-b from-emerald-800 to-emerald-950 border-[10px] border-amber-900/80 rounded-[200px] shadow-2xl relative flex flex-col items-center justify-center p-6 border-double">
          {/* Outer Felt line */}
          <div className="absolute inset-2 border border-emerald-700/30 rounded-[190px] pointer-events-none" />

          {/* Center Community Board & Pot */}
          <div className="flex flex-col items-center gap-4 text-center select-none z-10">
            {/* Main/Side Pot summary */}
            <div className="bg-black/40 border border-emerald-500/20 rounded-full px-4 py-1.5 flex items-center gap-1.5 text-slate-200 shadow-md">
              <Coins className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-bold text-slate-100">
                Pot: {totalPot.toLocaleString()}
              </span>
            </div>

            {/* Community Cards slots */}
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((index) => {
                const card = board[index];
                return card ? (
                  <div key={index}>{renderCard(card)}</div>
                ) : (
                  <div
                    key={index}
                    className="w-10 h-14 md:w-12 md:h-18 rounded-lg border-2 border-emerald-700/40 bg-emerald-950/20"
                  />
                );
              })}
            </div>

            {/* Turn timer countdown */}
            {action_deadline_at && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-black/40 px-3 py-1 rounded-full border border-amber-500/10">
                <Clock className="h-3.5 w-3.5 animate-spin" />
                <TimerCountdown deadline={action_deadline_at} />
              </div>
            )}
          </div>

          {/* Players Seating positions */}
          {players.map((player) => {
            // Seating rotation so Hero is seat 0 (Bottom Center)
            const rotatedIndex = (player.seat - mySeat + 8) % 8;
            const pos = SEAT_POSITIONS[rotatedIndex];

            const isActive = player.account_id === actor_account_id;
            const isButton = player.account_id === button_account_id;
            const isHero = player.account_id === user?.account_id;

            // Get emotes overlay
            const memberEmotes = activeEmotes.filter((e) => e.account_id === player.account_id);
            const activeEmote = memberEmotes[memberEmotes.length - 1];

            return (
              <div
                key={player.account_id}
                className="absolute flex flex-col items-center select-none"
                style={{ ...pos }}
              >
                {/* Player Card */}
                <div
                  className={`flex flex-col items-center bg-slate-950/80 border ${
                    isActive ? 'border-amber-400 shadow-lg shadow-amber-500/20' : 'border-slate-800'
                  } rounded-2xl p-2 w-28 md:w-32 text-center relative overflow-visible`}
                >
                  {/* Floating Emote Popup Balloon */}
                  {activeEmote && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 h-8 w-8 text-xl flex items-center justify-center bg-slate-900 border border-purple-500/30 rounded-full shadow-lg shadow-black/40 animate-bounce z-20">
                      {activeEmote.emote}
                    </div>
                  )}

                  {/* Dealer Button Icon */}
                  {isButton && (
                    <div className="absolute -top-3 -right-2 h-6 w-6 rounded-full bg-white text-slate-900 border border-slate-300 flex items-center justify-center font-black text-[10px] shadow">
                      D
                    </div>
                  )}

                  {/* Profile initials */}
                  <div
                    className={`h-9 w-9 rounded-full text-white font-bold text-xs flex items-center justify-center border ${
                      isActive ? 'border-amber-400 ring-2 ring-amber-500/20' : 'border-white/10'
                    }`}
                    style={{ backgroundColor: '#4f46e5' }}
                  >
                    {player.display_name.slice(0, 2).toUpperCase()}
                  </div>

                  <span className="text-[11px] font-bold text-slate-200 mt-1 truncate max-w-full">
                    {player.display_name}
                  </span>

                  <span className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                    {player.stack.toLocaleString()}
                  </span>

                  {/* Hole Cards overlay for Hero */}
                  {isHero &&
                    privateSnapshot?.hole_cards &&
                    privateSnapshot.hole_cards.length > 0 && (
                      <div className="flex gap-1 mt-2 z-10">
                        {privateSnapshot.hole_cards.map((card, idx) => (
                          <div key={idx} className="scale-75 origin-top">
                            {renderCard(card)}
                          </div>
                        ))}
                      </div>
                    )}

                  {/* Disconnect indicator */}
                  {!player.connected && (
                    <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded">
                      DC
                    </span>
                  )}
                </div>

                {/* Bet Size display next to seat */}
                {player.bet > 0 && (
                  <div className="mt-1.5 bg-black/40 border border-yellow-500/20 rounded-full px-2 py-0.5 flex items-center gap-1 text-[10px] font-bold text-yellow-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    {player.bet.toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Decision Control Bar */}
      {isMyTurn && privateSnapshot && (
        <section className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 flex flex-col gap-4 z-10 animate-slideUp">
          {lastCommandError && (
            <div
              role="status"
              aria-live="polite"
              className="mx-auto w-full max-w-2xl rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-center text-xs font-semibold text-rose-300"
            >
              Action failed: {lastCommandError}
            </div>
          )}

          {/* Bet slider */}
          {betAction && (
            <div className="flex items-center gap-4 max-w-2xl mx-auto w-full">
              <span className="text-xs text-slate-400 font-semibold w-12 text-right">
                {minBetAmount.toLocaleString()}
              </span>
              <input
                type="range"
                aria-label="Bet or raise amount"
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
              <span className="text-xs text-slate-400 font-semibold w-12">
                {maxBetAmount.toLocaleString()}
              </span>
              <input
                type="number"
                aria-label="Bet or raise amount"
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
                className="w-20 h-8 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-lg text-xs font-bold text-center text-purple-400 outline-none"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap justify-center gap-3 w-full">
            {privateSnapshot.legal_actions.map((act) => {
              const themeMap: Record<string, string> = {
                fold: 'bg-rose-900/60 hover:bg-rose-900 border-rose-800 hover:border-rose-700 text-rose-200',
                check_or_call: 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white',
                bet_or_raise: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white',
                show: 'bg-amber-600 hover:bg-amber-500 border-amber-500 text-white',
                muck: 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200',
              };

              const btnTheme = themeMap[act.action] || 'bg-slate-800 text-slate-200';

              // Dynamic label split for check/call and bet/raise
              let actionLabel: string = act.action;
              if (act.action === 'check_or_call') {
                actionLabel = act.min_amount && act.min_amount > 0 ? 'call' : 'check';
              } else if (act.action === 'bet_or_raise') {
                const isRaise = players.some((p) => p.bet > 0);
                actionLabel = isRaise ? 'raise' : 'bet';
              }

              return (
                <button
                  key={act.action}
                  onClick={() => handleAction(act.action as ActionType)}
                  disabled={!connected || Boolean(pendingAction)}
                  className={`h-11 px-6 border rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${btnTheme}`}
                >
                  {actionLabel}
                  {(actionLabel === 'call' || act.action === 'bet_or_raise') && (
                    <span className="bg-black/25 px-1.5 py-0.5 rounded text-[10px] font-black">
                      {actionLabel === 'call'
                        ? (myPlayer
                            ? Math.min(myPlayer.stack, act.min_amount ?? 0)
                            : 0
                          ).toLocaleString()
                        : effectiveBetAmount.toLocaleString()}
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
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-850/80 rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden text-center">
            {/* Glow */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-purple-500 to-indigo-500" />
            <h3 className="text-xl font-bold text-slate-100 flex items-center justify-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              Hand Settled
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
                    <span className="text-slate-400">Player #{accId}</span>
                    <span className={payoff > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {payoff > 0 ? '+' : ''}
                      {payoff.toLocaleString()} chips
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest animate-pulse">
              Dealing next hand shortly...
            </p>
          </div>
        </div>
      )}

      {/* Match Settled Leaderboard final overlay */}
      {matchSettled && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative overflow-hidden">
            {/* Header */}
            <div className="text-center mb-6">
              <h3 className="text-2xl font-black text-slate-100 bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
                Match Completed
              </h3>
              <p className="text-xs text-slate-500 mt-1">Final standings & chip counts</p>
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
                      <span className="text-sm font-semibold text-slate-200">Player #{accId}</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">
                      {stack.toLocaleString()} chips
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
                {isLeaving ? 'Leaving...' : 'Back to Lobby'}
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

  return <span>{secs}s</span>;
}
export default PokerTable;
