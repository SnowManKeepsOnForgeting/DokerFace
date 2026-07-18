import { create } from 'zustand';
import {
  emitWithAck,
  isRealtimeAck,
  parseServerEvent,
  RealtimeError,
  RealtimeTimeoutError,
  socket,
  type GameActionAck,
  type RealtimeAck,
  type RoomJoinAck,
} from '../api/socket';
import type {
  ChatMessagePayload,
  EmotePayload,
  GameActionEvent,
  GameHandSettled,
  GameMatchSettled,
  GamePrivateSnapshot,
  GamePublicSnapshot,
  RoomKickedEvent,
  RoomSnapshot,
} from '../contracts/realtime';

const MAX_CHAT_MESSAGES = 100;
const ACTION_RETRY_LIMIT = 1;

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'replaced' | 'failed';

export interface GameState {
  connected: boolean;
  status: ConnectionStatus;
  currentRoom: RoomSnapshot | null;
  roomKicked: RoomKickedEvent | null;
  publicSnapshot: GamePublicSnapshot | null;
  privateSnapshot: GamePrivateSnapshot | null;
  handSettled: GameHandSettled | null;
  matchSettled: GameMatchSettled | null;
  chatMessages: ChatMessagePayload[];
  activeEmotes: EmotePayload[];
  pendingAction: GameActionEvent | null;
  lastCommandError: string | null;

  connect: () => void;
  disconnect: () => void;
  joinRoom: (roomId: string, password?: string) => Promise<RoomJoinAck>;
  leaveRoom: (roomId: string) => Promise<RealtimeAck>;
  toggleReady: (roomId: string, ready: boolean) => Promise<RealtimeAck>;
  startMatch: (roomId: string) => Promise<RealtimeAck>;
  kickPlayer: (roomId: string, targetAccountId: number) => Promise<RealtimeAck>;
  sendChat: (
    roomId: string,
    content: string,
    type?: 'text' | 'quick' | 'custom_quick',
  ) => Promise<RealtimeAck>;
  sendEmote: (
    roomId: string,
    emote: string,
    targetAccountId?: number | null,
  ) => Promise<RealtimeAck>;
  submitAction: (payload: GameActionEvent) => Promise<void>;
  requestSnapshot: (matchId: string) => Promise<RealtimeAck>;
  resetGame: () => void;
}

const resetTransientState = () => ({
  currentRoom: null,
  publicSnapshot: null,
  privateSnapshot: null,
  handSettled: null,
  matchSettled: null,
  chatMessages: [],
  activeEmotes: [],
  pendingAction: null,
});

const errorMessage = (error: unknown): string => {
  if (error instanceof RealtimeError) return error.code;
  if (error instanceof Error) return error.message;
  return 'realtime_error';
};

const waitForConnection = async (): Promise<void> => {
  if (socket.connected) return;

  socket.connect();
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new RealtimeError('Realtime connection timed out', 'connect_timeout'));
    }, 8_000);

    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new RealtimeError('Realtime connection failed', 'connect_failed'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
};

const actionVersion = (snapshot: GamePublicSnapshot | GamePrivateSnapshot | null): number =>
  snapshot?.state_version ?? -1;

export const useGameStore = create<GameState>((set, get) => {
  socket.on('connect', () => {
    set({ connected: true, status: 'connected' });
  });

  socket.on('disconnect', (reason) => {
    set({
      connected: false,
      status: reason === 'io server disconnect' ? 'replaced' : 'disconnected',
    });
  });

  socket.on('connect_error', () => {
    set({ connected: false, status: 'failed' });
  });

  socket.on('room:snapshot', (rawSnapshot) => {
    const snapshot = parseServerEvent('room:snapshot', rawSnapshot);
    if (!snapshot) return;

    set({ currentRoom: snapshot, roomKicked: null });
    if (snapshot.match_id) {
      void get().requestSnapshot(snapshot.match_id);
    }
  });

  socket.on('room:kicked', (rawEvent) => {
    const event = parseServerEvent('room:kicked', rawEvent);
    if (!event) return;
    set({ ...resetTransientState(), roomKicked: event, lastCommandError: 'kicked' });
  });

  socket.on('lobby:rooms-updated', (rawEvent) => {
    parseServerEvent('lobby:rooms-updated', rawEvent);
  });

  socket.on('chat:message', (rawMessage) => {
    const message = parseServerEvent('chat:message', rawMessage);
    if (!message) return;
    set((state) => ({
      chatMessages: [...state.chatMessages, message].slice(-MAX_CHAT_MESSAGES),
    }));
  });

  socket.on('emote:received', (rawEmote) => {
    const emote = parseServerEvent('emote:received', rawEmote);
    if (!emote) return;
    set((state) => ({ activeEmotes: [...state.activeEmotes, emote].slice(-8) }));
    window.setTimeout(() => {
      set((state) => ({ activeEmotes: state.activeEmotes.filter((item) => item !== emote) }));
    }, 4_000);
  });

  socket.on('game:public-snapshot', (rawSnapshot) => {
    const snapshot = parseServerEvent('game:public-snapshot', rawSnapshot);
    if (!snapshot) return;

    set((state) => {
      const currentPrivate = state.privateSnapshot;
      const currentVersion = Math.max(
        actionVersion(state.publicSnapshot),
        actionVersion(currentPrivate),
      );
      if (
        state.publicSnapshot?.match_id === snapshot.match_id &&
        snapshot.state_version < currentVersion
      ) {
        return state;
      }

      const samePrivateHand =
        currentPrivate?.match_id === snapshot.match_id &&
        currentPrivate.hand_id === snapshot.hand_id;
      const nextPrivate =
        samePrivateHand && currentPrivate.state_version === snapshot.state_version
          ? currentPrivate
          : null;
      const pendingAction =
        state.pendingAction &&
        state.pendingAction.match_id === snapshot.match_id &&
        snapshot.state_version > state.pendingAction.state_version
          ? null
          : state.pendingAction;

      return {
        publicSnapshot: snapshot,
        privateSnapshot: nextPrivate,
        handSettled:
          state.handSettled?.match_id === snapshot.match_id &&
          state.handSettled.hand_id === snapshot.hand_id
            ? state.handSettled
            : null,
        pendingAction,
      };
    });
  });

  socket.on('game:private-snapshot', (rawSnapshot) => {
    const snapshot = parseServerEvent('game:private-snapshot', rawSnapshot);
    if (!snapshot) return;

    set((state) => {
      const currentVersion = Math.max(
        actionVersion(state.publicSnapshot),
        actionVersion(state.privateSnapshot),
      );
      if (
        state.privateSnapshot?.match_id === snapshot.match_id &&
        snapshot.state_version < currentVersion
      ) {
        return state;
      }
      if (
        state.privateSnapshot?.match_id === snapshot.match_id &&
        state.privateSnapshot.hand_id === snapshot.hand_id &&
        snapshot.state_version < state.privateSnapshot.state_version
      ) {
        return state;
      }

      const pendingAction =
        state.pendingAction &&
        state.pendingAction.match_id === snapshot.match_id &&
        snapshot.state_version > state.pendingAction.state_version
          ? null
          : state.pendingAction;
      return {
        publicSnapshot: snapshot,
        privateSnapshot: snapshot,
        handSettled:
          state.handSettled?.match_id === snapshot.match_id &&
          state.handSettled.hand_id === snapshot.hand_id
            ? state.handSettled
            : null,
        pendingAction,
      };
    });
  });

  socket.on('game:hand-settled', (rawSettlement) => {
    const settlement = parseServerEvent('game:hand-settled', rawSettlement);
    if (settlement) set({ handSettled: settlement });
  });

  socket.on('game:match-settled', (rawSettlement) => {
    const settlement = parseServerEvent('game:match-settled', rawSettlement);
    if (settlement) set({ matchSettled: settlement });
  });

  socket.on('game:action-rejected', (rawRejection) => {
    const rejection = parseServerEvent('game:action-rejected', rawRejection);
    if (!rejection) return;
    set({ pendingAction: null, lastCommandError: rejection.error });
    if (rejection.match_id) void get().requestSnapshot(rejection.match_id);
  });

  const runCommand = async <Event extends keyof import('../api/socket').ClientToServerEvents>(
    event: Event,
    payload: Parameters<import('../api/socket').ClientToServerEvents[Event]>[0],
  ): Promise<RealtimeAck> => {
    try {
      await waitForConnection();
      const response = await emitWithAck(event, payload);
      if (!isRealtimeAck(response)) {
        throw new RealtimeError('Invalid realtime acknowledgement', 'invalid_ack');
      }
      if (!response.ok) set({ lastCommandError: response.error ?? 'realtime_command_rejected' });
      return response;
    } catch (error) {
      const message = errorMessage(error);
      set({ lastCommandError: message });
      return { ok: false, error: message };
    }
  };

  return {
    connected: socket.connected,
    status: socket.connected ? 'connected' : 'idle',
    currentRoom: null,
    roomKicked: null,
    publicSnapshot: null,
    privateSnapshot: null,
    handSettled: null,
    matchSettled: null,
    chatMessages: [],
    activeEmotes: [],
    pendingAction: null,
    lastCommandError: null,

    connect: () => {
      if (!socket.connected) {
        set({ status: 'connecting' });
        socket.connect();
      }
    },

    disconnect: () => {
      socket.disconnect();
      set({ connected: false, status: 'disconnected' });
    },

    joinRoom: async (roomId, password) => {
      set({ ...resetTransientState(), roomKicked: null, lastCommandError: null });
      await waitForConnection();
      const response = await emitWithAck('room:join', {
        schema_version: 1,
        room_id: roomId,
        password: password ?? null,
      });
      if (response.ok) {
        if (response.room) set({ currentRoom: response.room, lastCommandError: null });
        return response;
      }

      const restoredRoom = get().currentRoom;
      if (
        response.error === 'room_not_waiting' &&
        restoredRoom?.room_id === roomId &&
        restoredRoom.status === 'active'
      ) {
        return { ...response, ok: true, room: restoredRoom };
      }

      set({ lastCommandError: response.error ?? 'join_failed' });
      return response;
    },

    leaveRoom: async (roomId) => {
      const response = await runCommand('room:leave', { schema_version: 1, room_id: roomId });
      if (response.ok && get().currentRoom?.room_id === roomId) {
        set({ ...resetTransientState(), roomKicked: null, lastCommandError: null });
      }
      return response;
    },

    toggleReady: (roomId, ready) =>
      runCommand('room:ready', { schema_version: 1, room_id: roomId, ready }),

    startMatch: (roomId) => runCommand('room:start', { schema_version: 1, room_id: roomId }),

    kickPlayer: (roomId, targetAccountId) =>
      runCommand('room:kick', {
        schema_version: 1,
        room_id: roomId,
        target_account_id: targetAccountId,
      }),

    sendChat: (roomId, content, type = 'text') =>
      runCommand('chat:send', {
        schema_version: 1,
        room_id: roomId,
        message_type: type,
        content,
      }),

    sendEmote: (roomId, emote, targetAccountId = null) =>
      runCommand('emote:send', {
        schema_version: 1,
        room_id: roomId,
        emote,
        target_account_id: targetAccountId,
      }),

    submitAction: async (payload) => {
      if (get().pendingAction) return;
      set({ pendingAction: payload, lastCommandError: null });

      for (let attempt = 0; attempt <= ACTION_RETRY_LIMIT; attempt += 1) {
        try {
          await waitForConnection();
          const response = (await emitWithAck('game:action', payload)) as GameActionAck;
          if (!response.ok) {
            throw new RealtimeError(
              response.error ?? 'action_rejected',
              response.error ?? 'action_rejected',
            );
          }
          void get().requestSnapshot(payload.match_id);
          return;
        } catch (error) {
          if (error instanceof RealtimeTimeoutError && attempt < ACTION_RETRY_LIMIT) continue;
          set({ pendingAction: null, lastCommandError: errorMessage(error) });
          void get().requestSnapshot(payload.match_id);
          return;
        }
      }
    },

    requestSnapshot: (matchId) =>
      runCommand('game:request-snapshot', { schema_version: 1, match_id: matchId }),

    resetGame: () =>
      set({
        publicSnapshot: null,
        privateSnapshot: null,
        handSettled: null,
        matchSettled: null,
        chatMessages: [],
        activeEmotes: [],
        pendingAction: null,
        lastCommandError: null,
      }),
  };
});

export default useGameStore;
