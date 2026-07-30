import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthContext, type AuthContextType } from '../api/auth-context';
import { Layout } from '../components/Layout';
import { LANGUAGE_STORAGE_KEY } from '../i18n';

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const auth: AuthContextType = {
    user: {
      account_id: 1,
      login_name: 'alice',
      role: 'player',
      status: 'active',
      display_name: 'Alice',
    },
    isLoading: false,
    login: () => Promise.reject(new Error('login is not used in this test')),
    logout: () => Promise.resolve(),
    refetch: () => Promise.resolve(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <Layout>
            <div>Page content</div>
          </Layout>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('Language switching', () => {
  it('renders English navigation by default', () => {
    renderLayout();

    expect(screen.getAllByText('Lobby').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leaderboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('My Profile').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Change language')[0]).toHaveValue('en');
  });

  it('offers exactly English and Simplified Chinese', () => {
    renderLayout();

    const select = screen.getAllByLabelText('Change language')[0];
    const options = [...select.querySelectorAll('option')].map((option) => option.textContent);

    expect(options).toEqual(['English', '简体中文']);
  });

  it('switches to Chinese, persists the choice, and updates the document language', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.selectOptions(screen.getAllByLabelText('Change language')[0], 'zh');

    await waitFor(() => expect(screen.getAllByText('大厅').length).toBeGreaterThan(0));
    expect(screen.getAllByText('排行榜').length).toBeGreaterThan(0);
    expect(screen.getByText('退出登录')).toBeInTheDocument();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh');
    expect(document.documentElement.lang).toBe('zh');
    expect(document.title).toBe('DokerFace - 德州扑克');
  });

  it('keeps Chinese after the layout is mounted again', async () => {
    const user = userEvent.setup();
    const first = renderLayout();

    await user.selectOptions(screen.getAllByLabelText('Change language')[0], 'zh');
    await waitFor(() => expect(screen.getAllByText('大厅').length).toBeGreaterThan(0));
    first.unmount();

    renderLayout();

    expect(screen.getAllByText('大厅').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('切换语言')[0]).toHaveValue('zh');
  });
});
