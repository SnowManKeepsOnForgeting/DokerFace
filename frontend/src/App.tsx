import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './api/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthenticatedRoute, GuestRoute, AdministratorRoute } from './components/RouteGuards';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Lobby } from './pages/Lobby';
import { PlayerProfile } from './pages/PlayerProfile';
import { RoomContainer } from './pages/RoomContainer';

const router = createBrowserRouter([
  // Guest only routes
  {
    element: <GuestRoute />,
    children: [
      {
        path: '/login',
        element: <Login />,
      },
    ],
  },
  // Authenticated player routes
  {
    element: <AuthenticatedRoute />,
    children: [
      {
        path: '/',
        element: (
          <Layout>
            <Lobby />
          </Layout>
        ),
      },
      {
        path: '/leaderboard',
        element: (
          <Layout>
            <div className="flex flex-col gap-4">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent self-start">
                Leaderboard
              </h1>
              <p className="text-slate-400 text-sm">Player rankings will show here.</p>
            </div>
          </Layout>
        ),
      },
      {
        path: '/players/:playerId',
        element: (
          <Layout>
            <PlayerProfile />
          </Layout>
        ),
      },
      {
        path: '/rooms/:roomId',
        element: (
          <Layout>
            <RoomContainer />
          </Layout>
        ),
      },
    ],
  },
  // Authenticated administrator routes
  {
    element: <AdministratorRoute />,
    children: [
      {
        path: '/admin/*',
        element: (
          <Layout>
            <div className="flex flex-col gap-4">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent self-start">
                Admin Console
              </h1>
              <p className="text-slate-400 text-sm">Admin management actions will show here.</p>
            </div>
          </Layout>
        ),
      },
    ],
  },
  // Catch-all route (404)
  {
    path: '*',
    element: (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center font-sans">
          <h1 className="text-3xl font-bold tracking-tight text-purple-500 mb-2">404 Not Found</h1>
          <p className="text-slate-400 mb-6">The page you are looking for does not exist.</p>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-purple-600 px-6 font-medium text-white hover:bg-purple-500 transition-colors"
          >
            Return to Lobby
          </a>
        </div>
      </div>
    ),
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
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
