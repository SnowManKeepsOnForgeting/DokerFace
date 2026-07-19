import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoomContainer } from '../pages/RoomContainer';
import { PokerTable } from '../pages/PokerTable';
import { AuthProvider } from '../api/auth';
import { AuthContext } from '../api/auth-context';
import { MemoryRouter, Routes, Route } from 'react-router';
import userEvent from '@testing-library/user-event';
import { socket } from '../api/socket';
import { createCommandId } from '../api/command-id';
import { useGameStore } from '../store/game';
import type { RoomSnapshot } from '../contracts/realtime';
import '../api/client';

const server = setupServer();

const mockPlayerInfo = {
  account_id: 1,
  display_name: 'Alice',
  avatar_text: 'A',
  avatar_background_color: '#4f46e5',
  rank_badge_theme: 'Bronze',
  is_online: true,
};

const roomId = '00000000-0000-4000-8000-000000000001';

type AckResponse = { ok: boolean; error?: string; room?: RoomSnapshot };

const mockConnectedSocket = (
  joinResponse: AckResponse = { ok: true },
  leaveResponse: AckResponse = { ok: true },
) => {
  const previousConnected = socket.connected;
  const connect = vi.spyOn(socket, 'connect').mockImplementation(() => socket);
  const disconnect = vi.spyOn(socket, 'disconnect').mockImplementation(() => socket);
  const timeoutSocket = {
    emitWithAck: vi.fn((event: string) =>
      Promise.resolve(
        event === 'room:join'
          ? joinResponse
          : event === 'room:leave'
            ? leaveResponse
            : { ok: true },
      ),
    ),
  };
  const timeout = vi
    .spyOn(socket, 'timeout')
    .mockReturnValue(timeoutSocket as unknown as ReturnType<typeof socket.timeout>);
  socket.connected = true;

  return () => {
    socket.connected = previousConnected;
    connect.mockRestore();
    disconnect.mockRestore();
    timeout.mockRestore();
  };
};

describe('WaitingRoom and PokerTable Flow', () => {
  let restoreSocket: (() => void) | undefined;

  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => {
    restoreSocket?.();
    restoreSocket = undefined;
    server.resetHandlers();
    useGameStore.getState().resetGame();
  });
  afterAll(() => server.close());

  it('creates a command id when randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) },
    });

    try {
      expect(createCommandId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it('renders password prompt on password_required acknowledgement', async () => {
    restoreSocket = mockConnectedSocket({ ok: false, error: 'password_required' });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter initialEntries={[`/rooms/${roomId}`]}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes>
              <Route path="/rooms/:roomId" element={<RoomContainer />} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Password Required')).toBeInTheDocument());
  });

  it('adopts the room snapshot from a successful join acknowledgement', async () => {
    restoreSocket = mockConnectedSocket({
      ok: true,
      room: {
        room_id: roomId,
        host_account_id: 1,
        status: 'waiting',
        members: [],
      },
    });
    useGameStore.setState({
      currentRoom: {
        room_id: 'old-room',
        host_account_id: 1,
        status: 'waiting',
        members: [],
      },
      lastCommandError: 'room_not_joined',
    });

    const response = await useGameStore.getState().joinRoom(roomId);

    expect(response.ok).toBe(true);
    expect(useGameStore.getState().currentRoom?.room_id).toBe(roomId);
    expect(useGameStore.getState().lastCommandError).toBeNull();
  });

  it('displays waiting room players and handles ready state toggles', async () => {
    restoreSocket = mockConnectedSocket();
    server.use(
      http.get('http://localhost:8080/api/v1/players/1', () => {
        return HttpResponse.json(mockPlayerInfo, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/me', () => {
        return HttpResponse.json(
          {
            account_id: 1,
            login_name: 'alice',
            role: 'player',
            status: 'active',
            display_name: 'Alice',
          },
          { status: 200 },
        );
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter initialEntries={[`/rooms/${roomId}`]}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes>
              <Route path="/rooms/:roomId" element={<RoomContainer />} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const mockSnapshot = {
      schema_version: 1,
      room_id: roomId,
      host_account_id: 1,
      status: 'waiting',
      members: [{ account_id: 1, ready: false, seat: null, connected: true }],
    };

    const socketForTest = socket as unknown as {
      listeners: (event: string) => Array<(payload: unknown) => void>;
    };
    const listeners = socketForTest.listeners('room:snapshot');
    act(() => {
      listeners.forEach((listener) => listener(mockSnapshot));
    });

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Not Ready')).toBeInTheDocument();

    const readyBtn = screen.getByText('Set Ready');
    await userEvent.click(readyBtn);
  });

  it('uses the minimum legal amount before the bet control is changed', async () => {
    restoreSocket = mockConnectedSocket();

    const matchId = '00000000-0000-4000-8000-000000000002';
    const handId = '00000000-0000-4000-8000-000000000003';
    useGameStore.setState({
      privateSnapshot: {
        schema_version: 1,
        match_id: matchId,
        hand_id: handId,
        hand_number: 1,
        state_version: 1,
        street: 'preflop',
        button_account_id: 2,
        actor_account_id: 1,
        board: [],
        pot_amounts: [30],
        complete: false,
        players: [
          {
            account_id: 1,
            seat: 0,
            display_name: 'Alice',
            stack: 990,
            bet: 10,
            folded: false,
            all_in: false,
            connected: true,
          },
          {
            account_id: 2,
            seat: 1,
            display_name: 'Bob',
            stack: 980,
            bet: 20,
            folded: false,
            all_in: false,
            connected: true,
          },
        ],
        server_time: '2026-07-17T00:00:00Z',
        actions: [],
        action_deadline_at: null,
        account_id: 1,
        hole_cards: ['As', 'Kd'],
        legal_actions: [
          { action: 'fold' },
          { action: 'check_or_call', min_amount: 10, max_amount: 10 },
          { action: 'bet_or_raise', min_amount: 40, max_amount: 990 },
        ],
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            user: {
              account_id: 1,
              login_name: 'alice',
              role: 'player',
              status: 'active',
              display_name: 'Alice',
            },
            isLoading: false,
            login: async () => ({
              account_id: 1,
              login_name: 'alice',
              role: 'player',
              status: 'active',
              display_name: 'Alice',
            }),
            logout: async () => {},
            refetch: async () => {},
          }}
        >
          <PokerTable roomId={roomId} onLeave={vi.fn()} />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'raise40' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('slider', { name: 'Bet or raise amount' })).toHaveValue('40');
    expect(screen.getByRole('spinbutton', { name: 'Bet or raise amount' })).toHaveValue(40);
  });

  it('keeps the user in the room when leaving an active match is rejected', async () => {
    restoreSocket = mockConnectedSocket({ ok: true }, { ok: false, error: 'room_active' });
    server.use(
      http.get('http://localhost:8080/api/v1/players/1', () => {
        return HttpResponse.json(mockPlayerInfo, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/me', () => {
        return HttpResponse.json(
          {
            account_id: 1,
            login_name: 'alice',
            role: 'player',
            status: 'active',
            display_name: 'Alice',
          },
          { status: 200 },
        );
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter initialEntries={[`/rooms/${roomId}`]}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes>
              <Route path="/rooms/:roomId" element={<RoomContainer />} />
              <Route path="/" element={<p>Lobby</p>} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const socketForTest = socket as unknown as {
      listeners: (event: string) => Array<(payload: unknown) => void>;
    };
    act(() => {
      socketForTest.listeners('room:snapshot').forEach((listener) =>
        listener({
          schema_version: 1,
          room_id: roomId,
          host_account_id: 1,
          status: 'waiting',
          members: [{ account_id: 1, ready: false, seat: null, connected: true }],
        }),
      );
    });

    await waitFor(() => expect(screen.getByText('Waiting Room')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /leave room/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot leave while a match is active.',
    );
    expect(screen.queryByText('Lobby')).not.toBeInTheDocument();
  });

  it('keeps a hand settlement visible for three seconds after the next hand starts', () => {
    vi.useFakeTimers();

    try {
      const matchId = '00000000-0000-4000-8000-000000000002';
      const settledHandId = '00000000-0000-4000-8000-000000000003';
      const nextHandId = '00000000-0000-4000-8000-000000000004';
      const socketForTest = socket as unknown as {
        listeners: (event: string) => Array<(payload: unknown) => void>;
      };

      act(() => {
        socketForTest.listeners('game:hand-settled').forEach((listener) =>
          listener({
            schema_version: 1,
            match_id: matchId,
            hand_id: settledHandId,
            hand_number: 1,
            state_version: 1,
            account_ids: [1, 2],
            final_stacks: [1100, 900],
            payoffs: [100, -100],
          }),
        );
      });
      expect(useGameStore.getState().handSettled?.hand_id).toBe(settledHandId);

      act(() => {
        socketForTest.listeners('game:private-snapshot').forEach((listener) =>
          listener({
            schema_version: 1,
            match_id: matchId,
            hand_id: nextHandId,
            hand_number: 2,
            state_version: 2,
            street: 'preflop',
            button_account_id: 1,
            actor_account_id: 2,
            board: [],
            pot_amounts: [0],
            complete: false,
            players: [
              {
                account_id: 1,
                seat: 0,
                display_name: 'Alice',
                stack: 1100,
                bet: 0,
                folded: false,
                all_in: false,
                connected: true,
              },
              {
                account_id: 2,
                seat: 1,
                display_name: 'Bob',
                stack: 900,
                bet: 0,
                folded: false,
                all_in: false,
                connected: true,
              },
            ],
            server_time: '2026-07-17T00:00:00Z',
            actions: [],
            action_deadline_at: null,
            account_id: 1,
            hole_cards: ['As', 'Kd'],
            legal_actions: [],
          }),
        );
      });

      expect(useGameStore.getState().handSettled?.hand_id).toBe(settledHandId);

      act(() => {
        vi.advanceTimersByTime(2_999);
      });
      expect(useGameStore.getState().handSettled?.hand_id).toBe(settledHandId);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(useGameStore.getState().handSettled).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
