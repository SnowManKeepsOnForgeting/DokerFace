import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGameStore } from '../store/game';
import { useAuth } from '../api/auth-context';
import { getPlayerApiV1PlayersAccountIdGet } from '../contracts/rest';
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

interface WaitingRoomProps {
  roomId: string;
  onLeave: () => void;
}

export function WaitingRoom({ roomId, onLeave }: WaitingRoomProps) {
  const { user: currentUser } = useAuth();
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
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
          ? 'You cannot leave while a match is active.'
          : `Unable to leave room: ${response.error ?? 'realtime_error'}`,
      );
    }
    setIsLeaving(false);
  };

  // Auto scroll chat list
  useEffect(() => {
    if (chatBottomRef.current?.scrollIntoView) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
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
    <div className="flex-1 flex flex-col lg:flex-row gap-6 p-4 md:p-6 font-sans text-slate-100 max-w-7xl mx-auto w-full h-[calc(100vh-80px)] overflow-hidden">
      {/* Left Column: Waiting Room Info & Players */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        {/* Header summary */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xl font-bold text-slate-200">Waiting Room</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Room ID: <span className="font-mono text-slate-500">{roomId}</span>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => void handleLeave()}
              disabled={isLeaving}
              className="h-10 px-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-slate-100 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-wait disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {isLeaving ? 'Leaving...' : 'Leave Room'}
            </button>

            <button
              onClick={() => toggleReady(roomId, !isReady)}
              className={`h-10 px-5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                isReady
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/20'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/20'
              }`}
            >
              {isReady ? (
                <>
                  <CheckCircle className="h-4 w-4" />I am Ready
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Set Ready
                </>
              )}
            </button>

            {isHost && (
              <button
                onClick={() => startMatch(roomId)}
                disabled={!canStart}
                className="h-10 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-purple-950/20 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4" />
                Start Match
              </button>
            )}
          </div>
        </section>

        {leaveError && (
          <div
            role="alert"
            className="-mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-300"
          >
            {leaveError}
          </div>
        )}

        {/* Players list card */}
        <section className="flex-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col overflow-hidden min-h-0">
          <h3 className="font-bold text-sm uppercase tracking-wider text-purple-400 mb-4 shrink-0">
            Players ({members.length})
          </h3>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
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
          <div className="border-t border-slate-800/60 pt-4 mt-4 shrink-0">
            <h4 className="text-xs text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
              <Smile className="h-3.5 w-3.5" /> Send Emote
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {emotes.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendEmote(roomId, emoji)}
                  className="h-10 w-10 text-xl flex items-center justify-center bg-slate-950/60 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700/80 rounded-xl transition-all cursor-pointer transform active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Chat Console */}
      <section className="w-full lg:w-96 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col h-[400px] lg:h-full overflow-hidden shrink-0">
        <h3 className="font-bold text-sm uppercase tracking-wider text-purple-400 mb-4 flex items-center gap-2 shrink-0">
          <MessageSquare className="h-4 w-4" />
          Room Chat
        </h3>

        {/* Message area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-4 min-h-0 scrollbar-thin">
          {chatMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs font-semibold uppercase tracking-wider">
              No chat messages.
            </div>
          ) : (
            chatMessages.map((msg) => (
              <div key={msg.message_id} className="text-xs space-y-0.5 max-w-full break-words">
                <div className="flex items-baseline justify-between text-[10px] text-slate-500">
                  <span className="font-bold text-purple-400 truncate max-w-[150px]">
                    {msg.account_id === currentUser?.account_id
                      ? 'You'
                      : `Player #${msg.account_id}`}
                  </span>
                  <span>
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="bg-slate-950/40 border border-slate-800/40 rounded-lg px-2.5 py-1.5 text-slate-200">
                  {msg.content}
                </p>
              </div>
            ))
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Fast phrases */}
        <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
          {quickPhrases.map((phrase) => (
            <button
              key={phrase}
              onClick={() => sendChat(roomId, phrase, 'quick')}
              className="text-[10px] bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80 rounded px-2 py-1 transition-colors cursor-pointer"
            >
              {phrase}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendChat} className="flex gap-2 shrink-0">
          <input
            type="text"
            placeholder="Type a message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 h-10 bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-3 text-xs outline-none"
          />
          <button
            type="submit"
            className="h-10 w-10 flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white rounded-xl cursor-pointer"
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
    <div className="flex items-center justify-between p-3 bg-slate-900/30 border border-slate-800/80 rounded-xl relative hover:border-slate-800 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar */}
        <div className="relative">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-bold text-sm shadow-md"
            style={{ backgroundColor: player?.avatar_background_color || '#4f46e5' }}
          >
            {player?.avatar_text || player?.display_name?.slice(0, 2).toUpperCase() || 'P'}
          </div>

          {/* Floating Emote Popup Balloon */}
          {activeEmote && (
            <div className="absolute -top-6 -right-6 h-8 w-8 text-xl flex items-center justify-center bg-slate-900 border border-purple-500/30 rounded-full shadow-lg shadow-black/40 animate-bounce">
              {activeEmote.emote}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-200 truncate">
              {player?.display_name || `Player #${member.account_id}`}
            </span>
            {isHost && <Crown className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20" />}
            {isMe && <span className="text-[10px] text-slate-500 font-semibold">(You)</span>}
          </div>
          <p className="text-[10px] text-slate-500">Account ID: {member.account_id}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connection status */}
        {!member.connected && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded animate-pulse">
            DC
          </span>
        )}

        {/* Ready Badge */}
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            member.ready
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}
        >
          {member.ready ? 'Ready' : 'Not Ready'}
        </span>

        {/* Host kick control */}
        {isCurrentUserHost && !isMe && (
          <button
            onClick={() => onKick(member.account_id)}
            title="Kick Player"
            className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-500/20"
          >
            <UserX className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
export default WaitingRoom;
