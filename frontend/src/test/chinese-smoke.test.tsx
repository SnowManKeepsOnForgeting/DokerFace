import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import i18n, { resources } from '../i18n';

const server = setupServer();

const alice = {
  account_id: 1,
  login_name: 'alice',
  role: 'player',
  status: 'active',
  display_name: 'Alice',
};

/**
 * Walk the English bundle and confirm the Chinese bundle exposes the same keys.
 *
 * A missing key would silently fall back to English at runtime, so the parity check is the
 * cheapest way to keep the two bundles aligned as new copy is added.
 */
function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    collectKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe('Chinese interface smoke test', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('exposes the same keys in both languages', () => {
    const english = collectKeys(resources.en).sort();
    const chinese = collectKeys(resources.zh).sort();

    expect(chinese).toEqual(english);
    expect(english.length).toBeGreaterThan(200);
  });

  it('renders the lobby in Chinese without missing keys', async () => {
    const missingKeys: string[] = [];
    const handler = (_languages: readonly string[], namespace: string, key: string) => {
      missingKeys.push(`${namespace}:${key}`);
    };
    i18n.on('missingKey', handler);

    server.use(
      http.get('http://localhost:8080/api/v1/me', () => HttpResponse.json(alice, { status: 200 })),
      http.get('http://localhost:8080/api/v1/rooms', () =>
        HttpResponse.json({ items: [] }, { status: 200 }),
      ),
      http.get('http://localhost:8080/api/v1/players/1', () =>
        HttpResponse.json(
          {
            account_id: 1,
            display_name: 'Alice',
            avatar_text: 'A',
            avatar_background_color: '#4f46e5',
            rank_badge_theme: 'Bronze',
            is_online: true,
          },
          { status: 200 },
        ),
      ),
    );

    await i18n.changeLanguage('zh');
    render(<App />);

    await waitFor(() => expect(screen.getAllByText('大厅').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText('没有找到房间')).toBeInTheDocument());
    expect(screen.getByText('创建牌桌')).toBeInTheDocument();
    expect(screen.getAllByText('排行榜').length).toBeGreaterThan(0);
    expect(screen.getByText('退出登录')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh');

    i18n.off('missingKey', handler);
    expect(missingKeys).toEqual([]);
  });

  it('renders the guest login screen in Chinese without missing keys', async () => {
    const missingKeys: string[] = [];
    const handler = (_languages: readonly string[], namespace: string, key: string) => {
      missingKeys.push(`${namespace}:${key}`);
    };
    i18n.on('missingKey', handler);

    server.use(
      http.get('http://localhost:8080/api/v1/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await i18n.changeLanguage('zh');
    vi.stubGlobal('location', { ...window.location, pathname: '/login' });
    render(<App />);

    await waitFor(() => expect(screen.getByText('登录后开始游戏')).toBeInTheDocument());
    expect(screen.getByText('用户名')).toBeInTheDocument();

    i18n.off('missingKey', handler);
    expect(missingKeys).toEqual([]);
  });
});
