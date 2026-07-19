import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';
import {
  ChatMessagePayloadSchema,
  EmotePayloadSchema,
  GameActionRejectedSchema,
  GameHandSettledSchema,
  GameMatchSettledSchema,
  GamePrivateSnapshotSchema,
  GamePublicSnapshotSchema,
  LobbyRoomsUpdatedEventSchema,
  realtimeSchemas,
  RoomKickedEventSchema,
  RoomSnapshotSchema,
} from '../contracts/realtime.schemas';
import type {
  ChatMessagePayload,
  ChatSendEvent,
  EmotePayload,
  EmoteSendEvent,
  GameActionEvent,
  GameActionRejected,
  GameHandSettled,
  GameMatchSettled,
  GamePrivateSnapshot,
  GamePublicSnapshot,
  GameQuitEvent,
  GameRequestSnapshotEvent,
  LobbyRoomsUpdatedEvent,
  RoomJoinEvent,
  RoomKickEvent,
  RoomKickedEvent,
  RoomLeaveEvent,
  RoomReadyEvent,
  RoomSnapshot,
  RoomStartEvent,
} from '../contracts/realtime';

export interface RealtimeAck {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface RoomJoinAck extends RealtimeAck {
  room?: RoomSnapshot;
}

export interface GameActionAck extends RealtimeAck {
  command_id?: string;
  match_id?: string;
  hand_id?: string;
  state_version?: number;
  replayed?: boolean;
}

export interface ServerToClientEvents {
  'room:snapshot': (payload: RoomSnapshot) => void;
  'room:kicked': (payload: RoomKickedEvent) => void;
  'lobby:rooms-updated': (payload: LobbyRoomsUpdatedEvent) => void;
  'chat:message': (payload: ChatMessagePayload) => void;
  'emote:received': (payload: EmotePayload) => void;
  'game:public-snapshot': (payload: GamePublicSnapshot) => void;
  'game:private-snapshot': (payload: GamePrivateSnapshot) => void;
  'game:action-rejected': (payload: GameActionRejected) => void;
  'game:hand-settled': (payload: GameHandSettled) => void;
  'game:match-settled': (payload: GameMatchSettled) => void;
}

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinEvent, ack: (response: RoomJoinAck) => void) => void;
  'room:ready': (payload: RoomReadyEvent, ack: (response: RealtimeAck) => void) => void;
  'room:leave': (payload: RoomLeaveEvent, ack: (response: RealtimeAck) => void) => void;
  'room:kick': (payload: RoomKickEvent, ack: (response: RealtimeAck) => void) => void;
  'room:start': (payload: RoomStartEvent, ack: (response: RealtimeAck) => void) => void;
  'chat:send': (payload: ChatSendEvent, ack: (response: RealtimeAck) => void) => void;
  'emote:send': (payload: EmoteSendEvent, ack: (response: RealtimeAck) => void) => void;
  'game:action': (payload: GameActionEvent, ack: (response: GameActionAck) => void) => void;
  'game:quit': (payload: GameQuitEvent, ack: (response: GameActionAck) => void) => void;
  'game:request-snapshot': (
    payload: GameRequestSnapshotEvent,
    ack: (response: RealtimeAck) => void,
  ) => void;
}

const isDev = import.meta.env.DEV;
const socketUrl = isDev ? 'http://localhost:8080' : window.location.origin;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
});

export class RealtimeError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RealtimeError';
    this.code = code;
  }
}

export class RealtimeTimeoutError extends RealtimeError {
  constructor(event: string) {
    super(`Realtime acknowledgement timed out for ${event}`, 'ack_timeout');
    this.name = 'RealtimeTimeoutError';
  }
}

type ClientEvent = keyof ClientToServerEvents;
type ClientPayload<Event extends ClientEvent> = Parameters<ClientToServerEvents[Event]>[0];
type ClientResponse<Event extends ClientEvent> = Parameters<
  Parameters<ClientToServerEvents[Event]>[1]
>[0];

export async function emitWithAck<Event extends ClientEvent>(
  event: Event,
  payload: ClientPayload<Event>,
  timeoutMs = 8_000,
): Promise<ClientResponse<Event>> {
  if (!socket.connected) {
    throw new RealtimeError('Realtime connection is not available', 'disconnected');
  }

  try {
    const timedSocket = socket.timeout(timeoutMs) as unknown as {
      emitWithAck<E extends ClientEvent>(
        event: E,
        payload: ClientPayload<E>,
      ): Promise<ClientResponse<E>>;
    };
    return await timedSocket.emitWithAck(event, payload);
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      throw new RealtimeTimeoutError(event);
    }
    throw error;
  }
}

type ServerEvent = keyof ServerToClientEvents;

const serverSchemas: Record<ServerEvent, z.ZodType<unknown>> = {
  'room:snapshot': RoomSnapshotSchema,
  'room:kicked': RoomKickedEventSchema,
  'lobby:rooms-updated': LobbyRoomsUpdatedEventSchema,
  'chat:message': ChatMessagePayloadSchema,
  'emote:received': EmotePayloadSchema,
  'game:public-snapshot': GamePublicSnapshotSchema,
  'game:private-snapshot': GamePrivateSnapshotSchema,
  'game:action-rejected': GameActionRejectedSchema,
  'game:hand-settled': GameHandSettledSchema,
  'game:match-settled': GameMatchSettledSchema,
};

export function parseServerEvent<Event extends ServerEvent>(
  event: Event,
  payload: unknown,
): ServerToClientEvents[Event] extends (payload: infer Payload) => void ? Payload | null : never {
  const result = serverSchemas[event].safeParse(payload);
  if (!result.success) {
    console.error(`Invalid realtime payload for ${event}`, result.error.issues);
    return null as ServerToClientEvents[Event] extends (payload: infer Payload) => void
      ? Payload | null
      : never;
  }

  const schemaVersion = result.data as { schema_version?: unknown };
  if (schemaVersion.schema_version !== undefined && schemaVersion.schema_version !== 1) {
    console.error(`Unsupported realtime schema version for ${event}`, schemaVersion.schema_version);
    return null as ServerToClientEvents[Event] extends (payload: infer Payload) => void
      ? Payload | null
      : never;
  }

  return result.data as ServerToClientEvents[Event] extends (payload: infer Payload) => void
    ? Payload
    : never;
}

export function isRealtimeAck(value: unknown): value is RealtimeAck {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  );
}

export { realtimeSchemas };
