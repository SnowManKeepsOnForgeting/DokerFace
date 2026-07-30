import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../api/auth-context';
import { useEnumLabel } from '../i18n/useEnumLabel';
import { PlayerAvatar } from './PlayerAvatar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LayoutDashboard, Trophy, User, LogOut, ShieldAlert } from 'lucide-react';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const navItems = [
    { to: '/', label: t('nav.lobby'), icon: LayoutDashboard },
    { to: '/leaderboard', label: t('nav.leaderboard'), icon: Trophy },
  ];

  if (user) {
    navItems.push({ to: `/players/${user.account_id}`, label: t('nav.profile'), icon: User });
    if (user.role === 'administrator') {
      navItems.push({ to: '/admin/accounts', label: t('nav.admin'), icon: ShieldAlert });
    }
  }

  return (
    <div className="flex h-dvh w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 p-4">
        <div className="flex items-center gap-3 px-2 py-4 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600 text-white font-bold text-lg tracking-wider shadow-lg shadow-purple-900/30">
            D
          </div>
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
            {t('appName')}
          </span>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-600/15 text-purple-400 border border-purple-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }
              >
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-800 pt-4 flex flex-col gap-3">
          <LanguageSwitcher />

          {user && (
            <>
              <div className="flex items-center gap-3 px-2">
                <PlayerAvatar
                  accountId={user.account_id}
                  fallbackName={user.display_name}
                  label={t('sidebar.avatarLabel')}
                  className="h-10 w-10 text-sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user.display_name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {enumLabel('accountRole', user.role)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 hover:text-red-400 text-slate-300 px-3 py-2 text-sm font-medium transition-colors border border-slate-700/50"
              >
                <LogOut className="h-4 w-4" />
                {t('actions.logout')}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 flex-col min-w-0 overflow-hidden">
        <header className="flex md:hidden shrink-0 items-center justify-between h-16 bg-slate-900 border-b border-slate-800 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-purple-600 text-white font-bold text-sm">
              D
            </div>
            <span className="font-bold tracking-tight text-lg">{t('appName')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            {user && (
              <button
                onClick={handleLogout}
                aria-label={t('actions.logout')}
                className="text-slate-400 hover:text-red-400 p-1"
              >
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950">
          <div className="max-w-7xl mx-auto min-h-full lg:h-full flex flex-col">{children}</div>
        </main>

        <nav className="flex md:hidden shrink-0 bg-slate-900 border-t border-slate-800 h-16 items-center justify-around px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
