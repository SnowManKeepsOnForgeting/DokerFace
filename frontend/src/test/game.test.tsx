import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoomContainer } from '../pages/RoomContainer';
import { AuthProvider } from '../api/auth';
import { MemoryRouter, Routes, Route } from 'react-router';
import userEvent from '@testing-library/user-event';
import { socket } from '../api/socket';
import { useGameStore } from '../store/game';
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

describe('WaitingRoom and PokerTable Flow', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => {
    server.resetHandlers();
    useGameStore.getState().resetGame();
  });
  afterAll(() => server.close());

  it('renders password prompt on password_required acknowledgement', async () => {
    const originalEmit = socket.emit;
    socket.emit = ((event: string, _payload: any, ack: any) => {
      if (event === 'room:join') {
        ack({ ok: false, error: 'password_required' });
      }
    }) as any;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter initialEntries={['/rooms/room-id-123']}>
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

    socket.emit = originalEmit;
  });

  it('displays waiting room players and handles ready state toggles', async () => {
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
      <MemoryRouter initialEntries={['/rooms/room-id-123']}>
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
      room_id: 'room-id-123',
      host_account_id: 1,
      status: 'waiting',
      members: [{ account_id: 1, ready: false, seat: null, connected: true }],
    };

    const listeners = (socket as any).listeners ? (socket as any).listeners('room:snapshot') : [];
    act(() => {
      listeners.forEach((listener: any) => listener(mockSnapshot));
    });

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Not Ready')).toBeInTheDocument();

    const readyBtn = screen.getByText('Set Ready');
    await userEvent.click(readyBtn);
  });
});
