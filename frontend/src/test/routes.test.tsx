import { render, screen, waitFor } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';

const server = setupServer();

describe('Secure Routes Redirects', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('redirects to /login when unauthenticated', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/me', () => {
        return HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 });
      }),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText('Sign In to Play')).toBeInTheDocument());
  });

  it('allows access to Lobby when authenticated as player', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/me', () => {
        return HttpResponse.json(
          {
            account_id: 2,
            login_name: 'bob',
            role: 'player',
            status: 'active',
            display_name: 'Bob',
          },
          { status: 200 },
        );
      }),
    );

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'Welcome to the DokerFace poker waiting lobby. Active tables and waiting rooms will list here.',
        ),
      ).toBeInTheDocument(),
    );
  });
});
