import { Navigate, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../api/auth-context';

function SessionLoading() {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        <span className="text-sm font-medium tracking-wide">{t('states.loadingSession')}</span>
      </div>
    </div>
  );
}

export function AuthenticatedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <SessionLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AdministratorRoute() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return <SessionLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'administrator') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold tracking-tight text-red-500 mb-2">
            {t('routes.forbiddenTitle')}
          </h1>
          <p className="text-slate-400 mb-6">{t('routes.forbiddenDescription')}</p>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-purple-600 px-6 font-medium text-white hover:bg-purple-500 transition-colors"
          >
            {t('routes.returnToLobby')}
          </a>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <SessionLoading />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
