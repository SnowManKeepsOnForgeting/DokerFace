import { render, screen, waitFor } from '@testing-library/react';
import { describe, beforeAll, afterEach, afterAll, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminConsole } from '../pages/AdminConsole';
import { AuthProvider } from '../api/auth';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import '../api/client';

const server = setupServer();

// Mock data
const mockAccounts = {
  items: [
    {
      account_id: 1,
      login_name: 'alice',
      role: 'administrator',
      status: 'active',
      display_name: 'Alice Admin',
    },
    {
      account_id: 2,
      login_name: 'bob',
      role: 'player',
      status: 'active',
      display_name: 'Bob Player',
    },
  ],
  total: 2,
  offset: 0,
  limit: 50,
};

const mockRooms = {
  items: [
    {
      room_id: 'room-1',
      name: 'Active Room 1',
      host_account_id: 2,
      player_count: 3,
      status: 'waiting',
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
};

const mockMatches = {
  items: [
    {
      match_id: 'match-1',
      room_id: 'room-1',
      end_mode: 'winner_takes_all',
      status: 'completed',
      started_at: '2026-07-16T12:00:00Z',
      completed_at: '2026-07-16T12:30:00Z',
      void_reason: null,
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
};

const mockChats = {
  items: [
    {
      message_id: 'chat-1',
      room_id: 'room-1',
      account_id: 2,
      message_type: 'text',
      content: 'Hello table',
      target_account_id: null,
      created_at: '2026-07-16T12:05:00Z',
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
};

const mockAudits = {
  items: [
    {
      audit_log_id: 'audit-1',
      administrator_account_id: 1,
      action: 'bootstrap_administrator',
      target_account_id: null,
      before_state: null,
      after_state: { role: 'administrator' },
      created_at: '2026-07-16T11:00:00Z',
    },
  ],
  total: 1,
  offset: 0,
  limit: 50,
};

describe('AdminConsole Page Interactions', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renders accounts list and executes administration actions', async () => {
    let capturedCreatePayload: Record<string, unknown> | null = null;
    let capturedResetPayload: Record<string, unknown> | null = null;
    let capturedPatchPayload: Record<string, unknown> | null = null;
    let deletedAccountId: number | null = null;
    let closedRoomId: string | null = null;
    let voidedMatchId: string | null = null;

    server.use(
      http.get('http://localhost:8080/api/v1/me', () => {
        return HttpResponse.json(
          {
            account_id: 1,
            login_name: 'alice',
            role: 'administrator',
            status: 'active',
            display_name: 'Alice Admin',
          },
          { status: 200 },
        );
      }),
      http.get('http://localhost:8080/api/v1/admin/accounts', () => {
        const visibleAccounts = mockAccounts.items.filter(
          (account) => account.account_id !== deletedAccountId,
        );
        return HttpResponse.json(
          { ...mockAccounts, items: visibleAccounts, total: visibleAccounts.length },
          { status: 200 },
        );
      }),
      http.post('http://localhost:8080/api/v1/admin/accounts', async ({ request }) => {
        capturedCreatePayload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ account_id: 99, login_name: 'newuser' }, { status: 201 });
      }),
      http.post(
        'http://localhost:8080/api/v1/admin/accounts/2/reset-password',
        async ({ request }) => {
          capturedResetPayload = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true }, { status: 200 });
        },
      ),
      http.patch('http://localhost:8080/api/v1/admin/accounts/2', async ({ request }) => {
        capturedPatchPayload = (await request.json()) as Record<string, unknown>;
        if (capturedPatchPayload.status === 'deleted') {
          deletedAccountId = 2;
        }
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/admin/rooms', () => {
        return HttpResponse.json(mockRooms, { status: 200 });
      }),
      http.post('http://localhost:8080/api/v1/admin/rooms/room-1/close', () => {
        closedRoomId = 'room-1';
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/admin/matches', () => {
        return HttpResponse.json(mockMatches, { status: 200 });
      }),
      http.post('http://localhost:8080/api/v1/admin/matches/match-1/void', () => {
        voidedMatchId = 'match-1';
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/admin/chats', () => {
        return HttpResponse.json(mockChats, { status: 200 });
      }),
      http.get('http://localhost:8080/api/v1/admin/audit-logs', () => {
        return HttpResponse.json(mockAudits, { status: 200 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AdminConsole />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // 1. Verify accounts list loads
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    expect(screen.getByText('Bob Player')).toBeInTheDocument();

    // 2. Open Create Account Modal and submit
    const createBtn = screen.getByText('Create Account');
    await userEvent.click(createBtn);

    const loginInput = screen.getByPlaceholderText('e.g. johndoe');
    const passInput = screen.getByPlaceholderText('Password');
    const displayInput = screen.getByPlaceholderText('e.g. John');
    const createForm = loginInput.closest('form')!;
    const selectRole = createForm.querySelector('select')!;

    await userEvent.type(loginInput, 'testuser');
    await userEvent.type(passInput, 'secretpwd');
    await userEvent.type(displayInput, 'Tester display');
    await userEvent.selectOptions(selectRole, 'player');

    const submitCreateBtn = createForm.querySelector('button[type="submit"]')!;
    await userEvent.click(submitCreateBtn);

    await waitFor(() => expect(capturedCreatePayload).not.toBeNull());
    const createPayload = requirePayload(capturedCreatePayload);
    expect(createPayload.login_name).toBe('testuser');
    expect(createPayload.password).toBe('secretpwd');
    expect(createPayload.display_name).toBe('Tester display');

    // 3. Reset password test
    const bobRowForReset = screen.getByText('Bob Player').closest('tr')!;
    const bobResetBtn = bobRowForReset.querySelector('button')!;
    await userEvent.click(bobResetBtn);

    const newPassInput = screen.getByPlaceholderText('New Password');
    await userEvent.type(newPassInput, 'newsupersecret');

    // mock window.alert
    const originalAlert = window.alert;
    window.alert = vi.fn();

    const submitResetBtn = screen.getByRole('button', { name: 'Reset Password' });
    await userEvent.click(submitResetBtn);

    await waitFor(() => expect(capturedResetPayload).not.toBeNull());
    const resetPayload = requirePayload(capturedResetPayload);
    expect(resetPayload.password).toBe('newsupersecret');
    expect(window.alert).toHaveBeenCalledWith('Password reset successful');

    // 4. Test Change Role select triggering patch
    const bobRow = screen.getByText('Bob Player').closest('tr')!;
    const bobRoleSelect = bobRow.querySelector('select')!;
    await userEvent.selectOptions(bobRoleSelect, 'administrator');
    await waitFor(() => expect(capturedPatchPayload).not.toBeNull());
    const rolePatchPayload = requirePayload(capturedPatchPayload);
    expect(rolePatchPayload.role).toBe('administrator');

    // 5. Delete account and verify it leaves the console
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    const bobRowForDelete = screen.getByText('Bob Player').closest('tr')!;
    const bobDeleteButton = bobRowForDelete.querySelector('button[aria-label="Delete account"]')!;
    await userEvent.click(bobDeleteButton);
    await waitFor(() => expect(deletedAccountId).toBe(2));
    await waitFor(() => expect(screen.queryByText('Bob Player')).not.toBeInTheDocument());
    const deletePatchPayload = requirePayload(capturedPatchPayload);
    expect(deletePatchPayload.status).toBe('deleted');

    // 6. Navigate to Active Rooms tab and Close room
    const roomsTab = screen.getByText('Active Rooms');
    await userEvent.click(roomsTab);

    await waitFor(() => expect(screen.getByText('Active Room 1')).toBeInTheDocument());

    const closeBtn = screen.getByText('Close Table');
    window.confirm = () => true;

    await userEvent.click(closeBtn);
    await waitFor(() => expect(closedRoomId).toBe('room-1'));

    // 7. Navigate to Match Logs tab and Void match
    const matchesTab = screen.getByText('Match Logs');
    await userEvent.click(matchesTab);

    await waitFor(() => expect(screen.getByText(/winner takes all/)).toBeInTheDocument());

    const voidBtn = screen.getByText('Void Match');
    await userEvent.click(voidBtn);
    await waitFor(() => expect(voidedMatchId).toBe('match-1'));

    // 8. Navigate to Chat Audits tab
    const chatsTab = screen.getByText('Chat Audits');
    await userEvent.click(chatsTab);

    await waitFor(() => expect(screen.getByText('Hello table')).toBeInTheDocument());

    // 9. Navigate to Audit Logs tab and expand JSON viewer
    const auditsTab = screen.getByText('Audit Logs');
    await userEvent.click(auditsTab);

    await waitFor(() => expect(screen.getByText('bootstrap administrator')).toBeInTheDocument());
    const viewStateBtn = screen.getByText('View State');
    await userEvent.click(viewStateBtn);

    await waitFor(() => expect(screen.getByText('None (Created)')).toBeInTheDocument());

    // Restore alert/confirm mocks
    window.alert = originalAlert;
    window.confirm = originalConfirm;
  });
});

function requirePayload(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) throw new Error('Expected a captured request payload');
  return payload;
}
