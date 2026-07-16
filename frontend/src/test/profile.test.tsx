import { render, screen, waitFor } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerProfile } from '../pages/PlayerProfile';
import { AuthProvider } from '../api/auth';
import { MemoryRouter, Routes, Route } from 'react-router';
import userEvent from '@testing-library/user-event';
import '../api/client';

const server = setupServer();

const mockPlayer = {
  account_id: 1,
  display_name: 'Alice',
  avatar_text: 'A',
  avatar_background_color: '#4f46e5',
  rank_badge_theme: 'Bronze',
  is_online: true,
};

const mockStats = {
  account_id: 1,
  reducer_version: 1,
  dealt_hands: 50,
  won_hands: 12,
  matches_played: 5,
  profitable_matches: 3,
  vpip_opportunities: 50,
  vpip: 14,
  vpip_rate: 0.28,
  pfr_opportunities: 50,
  pfr: 9,
  pfr_rate: 0.18,
  three_bet_opportunities: 20,
  three_bets: 2,
  three_bet_rate: 0.08,
  showdown_opportunities: 10,
  showdowns: 5,
  showdown_wins: 3,
  showdown_rate: 0.1,
  showdown_win_rate: 0.6,
  decisions: 100,
  folds: 50,
  fold_rate: 0.5,
  all_ins: 2,
  pot_total: 6250,
  pot_count: 50,
  average_pot: 125,
  position_counts: {},
};

const mockRatings = [
  {
    rating_id: 1,
    match_id: 'match-1',
    created_at: '2026-07-16T12:00:00Z',
    rating: 1050,
    rating_change: 50,
  },
];

describe('PlayerProfile View and Editing', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders player profile stats and allows editing when viewing own profile', async () => {
    let currentMockPlayer = { ...mockPlayer };

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
      http.get('http://localhost:8080/api/v1/players/1', () => {
        return HttpResponse.json(currentMockPlayer, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/players/1/statistics', () => {
        return HttpResponse.json(mockStats, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/players/1/ratings', () => {
        return HttpResponse.json({ items: mockRatings }, { status: 200 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter initialEntries={['/players/1']}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes>
              <Route path="/players/:playerId" element={<PlayerProfile />} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Bronze')).toBeInTheDocument();

    expect(screen.getByText('28.0%')).toBeInTheDocument();
    expect(screen.getByText('18.0%')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();

    expect(screen.getByText('1050')).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();

    const editBtn = screen.getByText('Edit Profile');
    await userEvent.click(editBtn);

    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Initials')).toBeInTheDocument();

    server.use(
      http.patch('http://localhost:8080/api/v1/me/profile', async ({ request }) => {
        const body = (await request.json()) as any;
        currentMockPlayer = {
          ...currentMockPlayer,
          display_name: body.display_name || currentMockPlayer.display_name,
          avatar_text: body.avatar_text || currentMockPlayer.avatar_text,
          avatar_background_color:
            body.avatar_background_color || currentMockPlayer.avatar_background_color,
        };
        return HttpResponse.json(currentMockPlayer, { status: 200 });
      }),
    );

    const nameInput = screen.getByPlaceholderText('Name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Alice Updated');

    // Find the save check button
    const nameInputGroup = nameInput.closest('form');
    expect(nameInputGroup).not.toBeNull();
    const saveBtn = nameInputGroup!.querySelector('button[type="submit"]');
    expect(saveBtn).not.toBeNull();

    await userEvent.click(saveBtn!);

    await waitFor(() => expect(screen.getByText('Alice Updated')).toBeInTheDocument());
  });
});
