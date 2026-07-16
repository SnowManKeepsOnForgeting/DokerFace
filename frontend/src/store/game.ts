import { create } from 'zustand';
import { socket } from '../api/socket';
import type {
  RoomSnapshot,
  GamePublicSnapshot,
  GamePrivateSnapshot,
  ChatMessagePayload,
  EmotePayload,
  GameActionRejected,
  GameHandSettled,
  GameMatchSettled,
} from '../contracts/realtime';

export interface GameState {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'connecting';
  currentRoom: RoomSnapshot | null;
  publicSnapshot: GamePublicSnapshot | null;
  privateSnapshot: GamePrivateSnapshot | null;
  handSettled: GameHandSettled | null;
  matchSettled: GameMatchSettled | null;
  chatMessages: ChatMessagePayload[];
  activeEmotes: EmotePayload[];

  // Actions
  connect: () => void;
  disconnect: () => void;
  joinRoom: (roomId: string, password?: string) => Promise<any>;
  leaveRoom: (roomId: string) => void;
  toggleReady: (roomId: string, ready: boolean) => void;
  startMatch: (roomId: string) => void;
  kickPlayer: (roomId: string, targetAccountId: number, reason?: string) => void;
  sendChat: (roomId: string, content: string, type?: 'text' | 'quick' | 'custom_quick') => void;
  sendEmote: (roomId: string, emote: string, targetAccountId?: number | null) => void;
  submitAction: (payload: {
    match_id: string;
    hand_id: string;
    state_version: number;
    action: 'fold' | 'check_or_call' | 'bet_or_raise' | 'show' | 'muck';
    amount?: number;
    command_id: string;
  }) => void;
  requestSnapshot: (matchId: string) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set) => {
  // Bind connection status events
  socket.on('connect', () => {
    set({ connected: true, status: 'connected' });
  });

  socket.on('disconnect', () => {
    set({ connected: false, status: 'disconnected' });
  });

  socket.on('connect_error', () => {
    set({ status: 'disconnected' });
  });

  // Bind server events
  socket.on('room:snapshot', (snapshot: RoomSnapshot) => {
    set({ currentRoom: snapshot });
  });

  socket.on('game:public-snapshot', (snapshot: GamePublicSnapshot) => {
    set({ publicSnapshot: snapshot });
  });

  socket.on('game:private-snapshot', (snapshot: GamePrivateSnapshot) => {
    set({ privateSnapshot: snapshot });
  });

  socket.on('chat:message', (msg: ChatMessagePayload) => {
    set((state) => ({ chatMessages: [...state.chatMessages, msg] }));
  });

  socket.on('emote:received', (emote: EmotePayload) => {
    set((state) => ({ activeEmotes: [...state.activeEmotes, emote] }));
    setTimeout(() => {
      set((state) => ({
        activeEmotes: state.activeEmotes.filter((e) => e !== emote),
      }));
    }, 4000);
  });

  socket.on('room:kicked', () => {
    set({
      currentRoom: null,
      publicSnapshot: null,
      privateSnapshot: null,
      chatMessages: [],
      activeEmotes: [],
      handSettled: null,
      matchSettled: null,
    });
  });

  socket.on('game:hand-settled', (settlement: GameHandSettled) => {
    set({ handSettled: settlement });
  });

  socket.on('game:match-settled', (settlement: GameMatchSettled) => {
    set({ matchSettled: settlement });
  });

  socket.on('game:action-rejected', (err: GameActionRejected) => {
    console.warn('Action rejected by server:', err);
  });

  return {
    connected: socket.connected,
    status: socket.connected ? 'connected' : 'disconnected',
    currentRoom: null,
    publicSnapshot: null,
    privateSnapshot: null,
    handSettled: null,
    matchSettled: null,
    chatMessages: [],
    activeEmotes: [],

    connect: () => {
      if (!socket.connected) {
        set({ status: 'connecting' });
        socket.connect();
      }
    },

    disconnect: () => {
      socket.disconnect();
    },

    joinRoom: (roomId, password) => {
      return new Promise<any>((resolve) => {
        socket.emit('room:join', { room_id: roomId, password }, (ack: any) => {
          resolve(ack);
        });
      });
    },

    leaveRoom: (roomId) => {
      socket.emit('room:leave', { room_id: roomId });
      set({
        currentRoom: null,
        publicSnapshot: null,
        privateSnapshot: null,
        chatMessages: [],
        activeEmotes: [],
        handSettled: null,
        matchSettled: null,
      });
    },

    toggleReady: (roomId, ready) => {
      socket.emit('room:ready', { room_id: roomId, ready });
    },

    startMatch: (roomId) => {
      socket.emit('room:start', { room_id: roomId });
    },

    kickPlayer: (roomId, targetAccountId, reason) => {
      socket.emit('room:kick', { room_id: roomId, target_account_id: targetAccountId, reason });
    },

    sendChat: (roomId, content, type = 'text') => {
      socket.emit('chat:send', { room_id: roomId, message_type: type, content });
    },

    sendEmote: (roomId, emote, targetAccountId = null) => {
      socket.emit('emote:send', { room_id: roomId, emote, target_account_id: targetAccountId });
    },

    submitAction: (payload) => {
      socket.emit('game:action', payload);
    },

    requestSnapshot: (matchId) => {
      socket.emit('game:request-snapshot', { match_id: matchId });
    },

    resetGame: () => {
      set({
        publicSnapshot: null,
        privateSnapshot: null,
        handSettled: null,
        matchSettled: null,
        chatMessages: [],
        activeEmotes: [],
      });
    },
  };
});
export default useGameStore;
