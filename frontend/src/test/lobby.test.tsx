import { render, screen, waitFor } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Lobby } from '../pages/Lobby';
import { AuthProvider } from '../api/auth';
import { socket } from '../api/socket';
import { MemoryRouter } from 'react-router';
import '../api/client';

const server = setupServer();

const mockRooms = {
  items: [
    {
      room_id: 'room-1',
      host_account_id: 1,
      name: 'Standard Room',
      visibility: 'public',
      has_password: false,
      status: 'waiting',
      player_count: 3,
      spectator_count: 0,
      rules: {
        max_players: 8,
        end_mode: 'winner_takes_all',
        starting_chips: 1000,
        small_blind: 10,
        big_blind: 20,
        decision_timeout_seconds: 30,
        blind_increase_every_hands: 10,
        show_remaining_board: true,
        winner_may_show_hand: true,
        spectators_allowed: true,
        auto_start: true,
        counted_in_stats: true,
      },
    },
  ],
};

describe('Lobby View and Interactions', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders room list and invalidates queries on rooms-updated socket emit', async () => {
    server.use(
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
      http.get('http://localhost:8080/api/v1/rooms', () => {
        return HttpResponse.json(mockRooms, { status: 200 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Lobby />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Standard Room')).toBeInTheDocument());
    expect(screen.getByText('Capacity:')).toBeInTheDocument();
    expect(screen.getByText('3 / 8 players')).toBeInTheDocument();

    const updatedRooms = {
      items: [
        {
          ...mockRooms.items[0],
          name: 'Updated Room Name',
          player_count: 4,
        },
      ],
    };
    server.use(
      http.get('http://localhost:8080/api/v1/rooms', () => {
        return HttpResponse.json(updatedRooms, { status: 200 });
      }),
    );

    // Trigger the registered socket listeners directly to simulate server broadcast
    const socketForTest = socket as unknown as {
      listeners: (event: string) => Array<(payload: unknown) => void>;
    };
    socketForTest
      .listeners('lobby:rooms-updated')
      .forEach((listener) => listener({ schema_version: 1 }));

    await waitFor(() => expect(screen.getByText('Updated Room Name')).toBeInTheDocument());
    expect(screen.getByText('4 / 8 players')).toBeInTheDocument();
  });

  it('creates a room with unlimited decision time as null', async () => {
    let requestBody: { rules: { decision_timeout_seconds: number | null } } | undefined;

    server.use(
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
      http.get('http://localhost:8080/api/v1/rooms', () => {
        return HttpResponse.json(mockRooms, { status: 200 });
      }),
      http.post('http://localhost:8080/api/v1/rooms', async ({ request }) => {
        requestBody = (await request.json()) as typeof requestBody;
        return HttpResponse.json(
          {
            ...mockRooms.items[0],
            room_id: 'room-created',
            name: "Alice's Room",
            rules: {
              ...mockRooms.items[0].rules,
              decision_timeout_seconds: null,
            },
          },
          { status: 201 },
        );
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Lobby />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Standard Room')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Create Table' }));
    await userEvent.click(screen.getByRole('button', { name: 'Unlimited' }));

    expect(
      screen.queryByRole('spinbutton', { name: 'Decision timeout seconds' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open Table' }));

    await waitFor(() => expect(requestBody?.rules.decision_timeout_seconds).toBeNull());
  });
});
