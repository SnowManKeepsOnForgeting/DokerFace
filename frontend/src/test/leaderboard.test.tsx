import { render, screen, waitFor } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Leaderboard } from '../pages/Leaderboard';
import { AuthProvider } from '../api/auth';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import '../api/client';

const server = setupServer();

const mockLeaderboardResponse = {
  batch_id: 'batch-abc',
  total: 4,
  offset: 0,
  limit: 20,
  current_player_stats: {
    rank: 2,
    rating: 1200,
    highest_rating: 1250,
    completed_matches: 15,
    diff_to_previous_player: 40,
  },
  items: [
    {
      rank: 1,
      account_id: 101,
      rating: 1500,
      highest_rating: 1600,
      completed_matches: 50,
      display_name: 'SuperPro',
      avatar_text: 'SP',
      avatar_background_color: '#ff0000',
      rank_badge_theme: 'Platinum',
      win_rate: 0.65,
    },
    {
      rank: 2,
      account_id: 1,
      rating: 1200,
      highest_rating: 1250,
      completed_matches: 15,
      display_name: 'Alice',
      avatar_text: 'A',
      avatar_background_color: '#4f46e5',
      rank_badge_theme: 'Gold',
      win_rate: 0.53,
    },
    {
      rank: 3,
      account_id: 103,
      rating: 1100,
      highest_rating: 1150,
      completed_matches: 10,
      display_name: 'Bob',
      avatar_text: 'B',
      avatar_background_color: '#00ff00',
      rank_badge_theme: 'Silver',
      win_rate: 0.45,
    },
    {
      rank: 4,
      account_id: 104,
      rating: 1000,
      highest_rating: 1000,
      completed_matches: 5,
      display_name: 'Charlie',
      avatar_text: 'C',
      avatar_background_color: '#cccccc',
      rank_badge_theme: 'Bronze',
      win_rate: 0.2,
    },
  ],
};

describe('Leaderboard Page View and Filtering', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders global leaderboard, podium, and search/filter inputs', async () => {
    let capturedSearch: string | null = null;
    let capturedRank: string | null = null;
    let capturedActiveOnly: string | null = null;

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
      http.get('http://localhost:8080/api/v1/leaderboard', ({ request }) => {
        const url = new URL(request.url);
        capturedSearch = url.searchParams.get('search');
        capturedRank = url.searchParams.get('rank_filter');
        capturedActiveOnly = url.searchParams.get('only_with_matches');
        return HttpResponse.json(mockLeaderboardResponse, { status: 200 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Leaderboard />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // Verify Title & Current player stats card render
    await waitFor(() => {
      expect(screen.getByText('Global Leaderboard')).toBeInTheDocument();
      expect(screen.getByText(/Standing/)).toBeInTheDocument();
      expect(screen.getByText('Ranked #2')).toBeInTheDocument();
      expect(screen.getByText('+40 pts')).toBeInTheDocument();
    });

    // Verify Top 3 podium players display
    expect(screen.getByText('SuperPro')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // Verify Rank 4 is in the table
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('#4')).toBeInTheDocument();

    // Interact with filters
    const searchInput = screen.getByPlaceholderText('Search players by name...');
    await userEvent.type(searchInput, 'Charlie');

    await waitFor(() => expect(capturedSearch).toBe('Charlie'));

    // Check rank filter selector
    const rankSelect = screen.getByRole('combobox');
    await userEvent.selectOptions(rankSelect, 'Bronze');

    await waitFor(() => expect(capturedRank).toBe('Bronze'));

    // Check active checkbox filter toggle
    const checkbox = screen.getByLabelText('Active Players Only');
    await userEvent.click(checkbox);

    await waitFor(() => expect(capturedActiveOnly).toBe('true'));
  });
});
