import { render, screen, waitFor } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../api/auth';
import userEvent from '@testing-library/user-event';
import '../api/client'; // Init client

const server = setupServer(
  http.get('http://localhost:8080/api/v1/me', () => {
    return HttpResponse.json(
      { account_id: 1, login_name: 'alice', role: 'player', status: 'active', display_name: 'Alice' },
      { status: 200 }
    );
  })
);

function TestComponent() {
  const { user, login, logout, isLoading } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  if (!user) {
    return (
      <div>
        <button onClick={() => login({ login_name: 'alice', password: 'password' })}>Login</button>
        <span>Logged Out</span>
      </div>
    );
  }
  return (
    <div>
      <span>Logged In: {user.display_name}</span>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe('AuthProvider Flow', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('resolves authenticated user state and handles logout', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Logged In: Alice')).toBeInTheDocument());

    server.use(
      http.post('http://localhost:8080/api/v1/auth/logout', () => {
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('http://localhost:8080/api/v1/me', () => {
        return HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 });
      })
    );

    const logoutBtn = screen.getByText('Logout');
    await userEvent.click(logoutBtn);

    await waitFor(() => expect(screen.getByText('Logged Out')).toBeInTheDocument());
  });
});
