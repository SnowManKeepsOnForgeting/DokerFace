import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../api/auth-context';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { PlayerAvatar } from './PlayerAvatar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LayoutDashboard, Trophy, User, LogOut, ShieldAlert, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const navItems = [
    { to: '/', label: t('nav.lobby'), icon: LayoutDashboard, end: true },
    { to: '/leaderboard', label: t('nav.leaderboard'), icon: Trophy },
  ];

  if (user) {
    navItems.push({ to: `/players/${user.account_id}`, label: t('nav.profile'), icon: User });
    if (user.role === 'administrator') {
      navItems.push({ to: '/admin/accounts', label: t('nav.admin'), icon: ShieldAlert });
    }
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-canvas font-sans text-slate-100">
      <a
        href="#main-content"
        className="focus-ring fixed top-3 left-3 z-50 -translate-y-20 rounded-control bg-accent-strong px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0"
      >
        {t('a11y.skipToContent')}
      </a>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised/80 p-3 md:flex lg:w-64 lg:p-4">
        <div className="mb-8 flex items-center gap-3 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-control bg-accent-strong text-lg font-black text-white shadow-lg shadow-purple-950/30">
            D
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-black tracking-tight text-slate-100">
              {t('appName')}
            </p>
            <p className="text-[9px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
              Texas Hold&apos;em
            </p>
          </div>
        </div>

        <nav aria-label={t('nav.label')} className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'focus-ring group relative flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent-muted text-accent-text'
                      : 'text-slate-400 hover:bg-surface-hover hover:text-slate-100',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'absolute top-1/2 -left-3 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity lg:-left-4',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {isActive ? <ChevronRight className="h-3.5 w-3.5 opacity-70" /> : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border-subtle pt-4">
          <LanguageSwitcher />
          {user ? (
            <>
              <div className="flex min-w-0 items-center gap-3 px-2">
                <PlayerAvatar
                  accountId={user.account_id}
                  fallbackName={user.display_name}
                  label={t('sidebar.avatarLabel')}
                  className="h-9 w-9 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-200">
                    {user.display_name}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {enumLabel('accountRole', user.role)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="focus-ring flex h-9 w-full items-center justify-center gap-2 rounded-control border border-border-subtle bg-surface-hover px-3 text-xs font-semibold text-slate-300 transition-colors hover:border-danger-border hover:bg-danger-surface hover:text-danger"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t('actions.logout')}
              </button>
            </>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-raised/90 px-4 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent-strong text-sm font-black text-white">
              D
            </div>
            <span className="text-base font-black tracking-tight text-slate-100">
              {t('appName')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                aria-label={t('actions.logout')}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-control text-slate-400 hover:text-danger"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            ) : null}
          </div>
        </header>

        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto bg-canvas p-4 md:p-6">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col">{children}</div>
        </main>

        <nav
          aria-label={t('nav.label')}
          className="flex h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 items-start justify-around border-t border-border-subtle bg-surface-raised/95 px-2 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'focus-ring flex min-w-16 flex-col items-center justify-center gap-1 rounded-control px-2 py-1 text-[10px] font-semibold transition-colors',
                    isActive ? 'text-accent-text' : 'text-slate-500 hover:text-slate-300',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        isActive && 'drop-shadow-[0_0_8px_rgba(167,139,250,0.55)]',
                      )}
                    />
                    <span className="max-w-20 truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
