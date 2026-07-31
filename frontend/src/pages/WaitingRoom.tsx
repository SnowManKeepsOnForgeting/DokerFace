import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGameStore } from '../store/game';
import { useAuth } from '../api/auth-context';
import { getPlayerApiV1PlayersAccountIdGet } from '../contracts/rest';
import { PlayerAvatar } from '../components/PlayerAvatar';
import type { EmotePayload, RoomMemberSnapshot } from '../contracts/realtime';
import {
  Crown,
  Play,
  CheckCircle,
  XCircle,
  Send,
  LogOut,
  UserX,
  MessageSquare,
  Smile,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../i18n/useFormatters';
import { useRealtimeError } from '../i18n/useRealtimeError';

interface WaitingRoomProps {
  roomId: string;
  onLeave: () => void;
}

export function WaitingRoom({ roomId, onLeave }: WaitingRoomProps) {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation(['room', 'common']);
  const { formatTime } = useFormatters();
  const realtimeError = useRealtimeError();
  const {
    currentRoom,
    toggleReady,
    startMatch,
    kickPlayer,
    sendChat,
    sendEmote,
    chatMessages,
    activeEmotes,
    leaveRoom,
  } = useGameStore();

  const [chatInput, setChatInput] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    setLeaveError(null);
    const response = await leaveRoom(roomId);
    if (response.ok) {
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

  // Auto scroll chat list
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages]);

  if (!currentRoom) return null;

  const members = currentRoom.members || [];
  const isHost = currentUser?.account_id === currentRoom.host_account_id;
  const myMember = members.find((m) => m.account_id === currentUser?.account_id);
  const isReady = myMember?.ready || false;

  const canStart = members.length >= 2 && members.every((m) => m.ready);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChat(roomId, chatInput.trim());
    setChatInput('');
  };

  const quickPhrases = [
    'Good luck, everyone!',
    'Nice hand!',
    'Check it down?',
    'Tough luck.',
    'Deal me in!',
  ];

  const emotes = ['👍', '👎', '🔥', '😮', '😂', '😭', '💩', '🤡'];

  return (
    <div
      data-testid="waiting-room"
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-3 font-sans text-slate-100 sm:gap-5 sm:p-4 md:p-6 lg:min-h-0 lg:flex-row lg:overflow-hidden"
    >
      {/* Left Column: Waiting Room Info & Players */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:min-h-0 lg:gap-5">
        {/* Header summary */}
        <section className="flex shrink-0 flex-col items-start justify-between gap-4 rounded-panel border border-border-subtle bg-surface p-4 sm:p-5 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
                aria-hidden="true"
              />
              <h2 className="text-xl font-bold text-slate-200">{t('room:waiting.title')}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {t('room:waiting.roomId')} <span className="font-mono text-slate-500">{roomId}</span>
            </p>
          </div>

          <div className="flex w-full flex-wrap gap-3 md:w-auto">
            <button
              onClick={() => void handleLeave()}
              disabled={isLeaving}
              className="flex h-10 items-center gap-2 rounded-control border border-border-subtle bg-surface-raised px-4 text-xs font-bold uppercase tracking-wider text-slate-300 transition-all hover:bg-surface-hover hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer disabled:cursor-wait disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {isLeaving ? t('room:waiting.leaving') : t('room:waiting.leave')}
            </button>

            <button
              onClick={() => toggleReady(roomId, !isReady)}
              className={`flex h-10 items-center gap-2 rounded-control px-5 text-xs font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer shadow-md ${
                isReady
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/20'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/20'
              }`}
            >
              {isReady ? (
                <>
                  <XCircle className="h-4 w-4" /> {t('room:waiting.setNotReady')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" /> {t('room:waiting.setReady')}
                </>
              )}
            </button>

            {isHost && (
              <button
                onClick={() => startMatch(roomId)}
                disabled={!canStart}
                className="flex h-10 items-center gap-2 rounded-control bg-accent-strong px-5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-slate-500 disabled:shadow-none cursor-pointer shadow-md shadow-purple-950/20"
              >
                <Play className="h-4 w-4" />
                {t('room:waiting.startMatch')}
              </button>
            )}
          </div>
        </section>

        {leaveError && (
          <div
            role="alert"
            className="-mt-2 rounded-control border border-danger-border bg-danger-surface px-4 py-3 text-xs font-semibold text-danger sm:-mt-3"
          >
            {leaveError}
          </div>
        )}

        {/* Players list card */}
        <section className="flex flex-col rounded-panel border border-border-subtle bg-surface p-4 sm:p-5 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <h3 className="mb-4 flex shrink-0 items-center justify-between text-sm font-bold uppercase tracking-wider text-accent-text">
            {t('room:waiting.players', { value: members.length })}
          </h3>

          <div className="grid gap-2 pr-1 sm:gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:content-start lg:overflow-y-auto xl:grid-cols-1 scrollbar-thin">
            {members.map((member) => (
              <MemberRow
                key={member.account_id}
                member={member}
                roomId={roomId}
                hostAccountId={currentRoom.host_account_id}
                isCurrentUserHost={isHost}
                currentUserId={currentUser?.account_id}
                onKick={(accId) => void kickPlayer(roomId, accId)}
                activeEmotes={activeEmotes}
              />
            ))}
          </div>

          {/* Emotes broadcast selector */}
          <div className="mt-4 shrink-0 border-t border-border-subtle pt-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Smile className="h-3.5 w-3.5" /> {t('room:waiting.sendEmote')}
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {emotes.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendEmote(roomId, emoji)}
                  aria-label={t('room:waiting.sendSpecificEmote', { emote: emoji })}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken text-xl transition-all hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 active:scale-90 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Chat Console */}
      <section className="flex h-[min(32rem,70vh)] w-full shrink-0 flex-col overflow-hidden rounded-panel border border-border-subtle bg-surface p-4 sm:p-5 lg:h-full lg:w-[22rem] xl:w-96">
        <h3 className="mb-4 flex shrink-0 items-center gap-2 text-sm font-bold uppercase tracking-wider text-accent-text">
          <MessageSquare className="h-4 w-4" />
          {t('room:waiting.chatTitle')}
        </h3>

        {/* Message area */}
        <div
          ref={chatListRef}
          className="mb-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-thin"
        >
          {chatMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
              {t('room:waiting.chatEmpty')}
            </div>
          ) : (
            chatMessages.map((msg) => (
              <div key={msg.message_id} className="max-w-full space-y-1 break-words text-xs">
                <div className="flex items-baseline justify-between text-[10px] text-slate-500">
                  <span className="font-bold text-purple-400 truncate max-w-[150px]">
                    {msg.account_id === currentUser?.account_id
                      ? t('common:you')
                      : msg.display_name || t('common:playerFallback', { id: msg.account_id })}
                  </span>
                  <span>{formatTime(msg.created_at)}</span>
                </div>
                <p className="rounded-control border border-border-subtle bg-surface-sunken px-2.5 py-1.5 text-slate-200">
                  {msg.content}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Fast phrases */}
        <div className="mb-3 flex shrink-0 gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {quickPhrases.map((phrase) => (
            <button
              key={phrase}
              onClick={() => sendChat(roomId, phrase, 'quick')}
              className="shrink-0 rounded-control border border-border-subtle bg-surface-raised px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer"
            >
              {phrase}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendChat} className="flex gap-2 shrink-0">
          <input
            type="text"
            placeholder={t('room:waiting.chatPlaceholder')}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-control border border-border-subtle bg-surface-sunken px-3 text-xs outline-none transition-colors focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/15"
          />
          <button
            type="submit"
            aria-label={t('room:waiting.chatSend')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-strong text-white transition-colors hover:bg-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>
    </div>
  );
}

interface MemberRowProps {
  member: RoomMemberSnapshot;
  roomId: string;
  hostAccountId: number;
  isCurrentUserHost: boolean;
  currentUserId?: number;
  onKick: (accId: number) => void;
  activeEmotes: EmotePayload[];
}

function MemberRow({
  member,
  hostAccountId,
  isCurrentUserHost,
  currentUserId,
  onKick,
  activeEmotes,
}: MemberRowProps) {
  const { t } = useTranslation(['room', 'common']);
  const isHost = member.account_id === hostAccountId;
  const isMe = member.account_id === currentUserId;

  // Retrieve public profile of player
  const { data: player } = useQuery({
    queryKey: ['player', member.account_id],
    queryFn: () =>
      getPlayerApiV1PlayersAccountIdGet({
        path: { account_id: member.account_id },
        throwOnError: true,
      }),
    staleTime: 60 * 1000,
  });

  // Get active emote for this member
  const memberEmotes = activeEmotes.filter((e) => e.account_id === member.account_id);
  const activeEmote = memberEmotes[memberEmotes.length - 1];

  return (
    <div className="relative flex min-w-0 items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-sunken p-3 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar */}
        <div className="relative">
          <PlayerAvatar
            accountId={member.account_id}
            fallbackName={player?.display_name}
            label={t('room:member.avatarLabel', {
              name: player?.display_name || t('common:playerFallback', { id: member.account_id }),
            })}
            className="h-10 w-10 text-sm shadow-md"
          />

          {/* Floating Emote Popup Balloon */}
          {activeEmote && (
            <div
              className="absolute -right-2 -top-4 flex h-8 w-8 items-center justify-center rounded-full border border-accent-border bg-surface-raised text-xl shadow-lg shadow-black/40 animate-emote-float"
              aria-label={t('room:member.activeEmote')}
            >
              {activeEmote.emote}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-200">
              {player?.display_name || t('common:playerFallback', { id: member.account_id })}
            </span>
            {isHost && (
              <Crown
                className="h-3.5 w-3.5 shrink-0 fill-amber-500/20 text-warning"
                aria-label={t('room:member.host')}
              />
            )}
            {isMe && (
              <span className="text-[10px] text-slate-500 font-semibold">
                {t('room:member.you')}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate">
            {t('room:member.accountId', { id: member.account_id })}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Connection status */}
        {!member.connected && (
          <span className="rounded-control border border-danger-border bg-danger-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-danger animate-pulse">
            {t('room:member.disconnected')}
          </span>
        )}

        {/* Ready Badge */}
        <span
          className={`inline-flex items-center gap-1 rounded-control border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            member.ready
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}
        >
          {member.ready ? t('room:member.ready') : t('room:member.notReady')}
        </span>

        {/* Host kick control */}
        {isCurrentUserHost && !isMe && (
          <button
            onClick={() => onKick(member.account_id)}
            title={t('room:member.kick')}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-transparent text-slate-500 transition-colors hover:border-danger-border hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 cursor-pointer"
          >
            <UserX className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
export default WaitingRoom;
