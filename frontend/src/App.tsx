import { lazy, Suspense, useState, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './api/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthenticatedRoute, GuestRoute, AdministratorRoute } from './components/RouteGuards';
import { Layout } from './components/Layout';
import { LoadingState } from './components/ui/Skeleton';
import { SoundProvider } from './sound';

const LazyLogin = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const LazyLobby = lazy(() => import('./pages/Lobby'));
const LazyPlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const LazyRoomContainer = lazy(() => import('./pages/RoomContainer'));
const LazyLeaderboard = lazy(() => import('./pages/Leaderboard'));
const LazyAdminConsole = lazy(() => import('./pages/AdminConsole'));

function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-canvas p-6 text-slate-100">
      <div className="max-w-md text-center font-sans">
        <div className="mb-4 text-4xl font-black text-accent-text">404</div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100">
          {t('routes.notFoundTitle')}
        </h1>
        <p className="mt-2 text-sm text-slate-400">{t('routes.notFoundDescription')}</p>
        <a
          href="/"
          className="focus-ring mt-6 inline-flex h-10 items-center justify-center rounded-control bg-accent-strong px-6 text-sm font-semibold text-white transition-colors hover:bg-accent"
        >
          {t('routes.returnToLobby')}
        </a>
      </div>
    </div>
  );
}

function PageFallback() {
  const { t } = useTranslation();
  return <LoadingState label={t('states.loadingSession')} />;
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      {
        path: '/login',
        element: withSuspense(<LazyLogin />),
      },
    ],
  },
  {
    element: <AuthenticatedRoute />,
    children: [
      {
        path: '/',
        element: <Layout>{withSuspense(<LazyLobby />)}</Layout>,
      },
      {
        path: '/leaderboard',
        element: <Layout>{withSuspense(<LazyLeaderboard />)}</Layout>,
      },
      {
        path: '/players/:playerId',
        element: <Layout>{withSuspense(<LazyPlayerProfile />)}</Layout>,
      },
      {
        path: '/rooms/:roomId',
        element: <Layout>{withSuspense(<LazyRoomContainer />)}</Layout>,
      },
    ],
  },
  {
    element: <AdministratorRoute />,
    children: [
      {
        path: '/admin/*',
        element: <Layout>{withSuspense(<LazyAdminConsole />)}</Layout>,
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SoundProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </SoundProvider>
    </QueryClientProvider>
  );
}

export default App;
