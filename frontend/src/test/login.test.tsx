import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, beforeAll, afterEach, afterAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../api/auth';
import { Login } from '../pages/Login';
import i18n from '../i18n';
import '../api/client';

const server = setupServer(
  http.get('http://localhost:8080/api/v1/me', () =>
    HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
  ),
);

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Login page localization', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders English copy by default', async () => {
    renderLogin();

    await waitFor(() => expect(screen.getByText('Sign In to Play')).toBeInTheDocument());
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your username')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('renders Chinese copy and a local validation message in Chinese', async () => {
    const user = userEvent.setup();
    renderLogin();

    await waitFor(() => expect(screen.getByText('Sign In to Play')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change language'), 'zh');

    await waitFor(() => expect(screen.getByText('登录后开始游戏')).toBeInTheDocument());
    expect(screen.getByText('用户名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(screen.getByText('请输入用户名和密码')).toBeInTheDocument());
  });

  it('shows the backend error text unchanged while the interface is Chinese', async () => {
    server.use(
      http.post('http://localhost:8080/api/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderLogin();

    await waitFor(() => expect(screen.getByText('Sign In to Play')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Change language'), 'zh');
    await waitFor(() => expect(i18n.language).toBe('zh'));

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'alice');
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    // Backend messages stay in English on purpose: the API is not localized.
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });
});
