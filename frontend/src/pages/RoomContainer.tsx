import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useGameStore } from '../store/game';
import { WaitingRoom } from './WaitingRoom';
import { PokerTable } from './PokerTable';
import { KeyRound, AlertTriangle, ArrowLeft } from 'lucide-react';

export function RoomContainer() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { currentRoom, joinRoom, leaveRoom, status, lastCommandError } = useGameStore();

  const returnToLobby = () => navigate('/');

  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const joinedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let active = true;
    joinedRoomRef.current = null;

    const attemptJoin = async (passVal?: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await joinRoom(roomId, passVal);
        if (res?.ok) {
          if (!active) {
            void leaveRoom(roomId);
            return;
          }
          joinedRoomRef.current = roomId;
        }
        if (!active) return;

        if (res && res.ok === false) {
          if (res.error === 'password_required' || res.error === 'invalid_password') {
            setPasswordRequired(true);
            if (res.error === 'invalid_password') {
              setErrorMsg('Invalid room password. Please try again.');
            }
          } else {
            setErrorMsg(`Failed to join room: ${res.error}`);
          }
        } else {
          setPasswordRequired(false);
        }
      } catch {
        if (!active) return;
        setErrorMsg('Network error connecting to table.');
      } finally {
        if (active) setLoading(false);
      }
    };

    attemptJoin();

    return () => {
      active = false;
      if (joinedRoomRef.current === roomId) {
        joinedRoomRef.current = null;
        if (useGameStore.getState().currentRoom?.room_id === roomId) {
          void leaveRoom(roomId);
        }
      }
    };
  }, [roomId, joinRoom, leaveRoom]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;
    setLoading(true);
    setErrorMsg(null);
    joinRoom(roomId, password).then((res) => {
      if (res?.ok) joinedRoomRef.current = roomId;
      setLoading(false);
      if (res && res.ok === false) {
        if (res.error === 'invalid_password') {
          setErrorMsg('Invalid password. Please try again.');
        } else {
          setErrorMsg(`Join failed: ${res.error}`);
        }
      } else {
        setPasswordRequired(false);
      }
    });
  };

  // Password Prompt screen
  if (passwordRequired) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Password Required</h3>
              <p className="text-xs text-slate-500 mt-1">
                This table is private. Please enter the password to join.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="Room Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 bg-slate-950/60 border border-slate-800 focus:border-purple-500/50 rounded-xl px-4 text-sm text-slate-200 outline-none transition-all placeholder-slate-600"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={returnToLobby}
                className="flex-1 h-11 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Back to Lobby
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-11 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-md shadow-purple-900/10 flex items-center justify-center"
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Join Table'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && !currentRoom) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">
          Joining waiting room...
        </p>
      </div>
    );
  }

  // Error joining state
  if (errorMsg && !currentRoom) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/60 border border-red-500/20 text-center rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
          <div className="h-12 w-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-1">Failed to Connect</h3>
          <p className="text-sm text-red-400 mb-6">{errorMsg}</p>
          <button
            onClick={returnToLobby}
            className="h-10 px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const connectionMessage =
    status === 'replaced'
      ? 'This account is connected in another browser. Use a different account for each player.'
      : status === 'failed'
        ? 'Realtime connection failed. Refresh the page and sign in again.'
        : status === 'disconnected'
          ? 'Realtime sync disconnected. Attempting to reconnect...'
          : null;

  return (
    <div className="flex-1 flex flex-col relative w-full h-full">
      {connectionMessage && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-2 animate-slideDown shrink-0"
        >
          <div className="h-3 w-3 animate-ping rounded-full bg-white opacity-75 shrink-0" />
          {connectionMessage}
        </div>
      )}

      {lastCommandError && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-2 text-center text-xs font-semibold text-rose-300"
        >
          Realtime command failed: {lastCommandError}
        </div>
      )}

      {currentRoom?.status === 'active' ? (
        <PokerTable roomId={roomId!} onLeave={returnToLobby} />
      ) : (
        <WaitingRoom roomId={roomId!} onLeave={returnToLobby} />
      )}
    </div>
  );
}
export default RoomContainer;
