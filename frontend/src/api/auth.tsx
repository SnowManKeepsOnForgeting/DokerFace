import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  currentUserApiV1MeGet,
  loginApiV1AuthLoginPost,
  logoutApiV1AuthLogoutPost,
} from '../contracts/rest';
import type { CurrentUserResponse, LoginApiV1AuthLoginPostData } from '../contracts/rest/types.gen';
import { ApiError } from './client';
import { socket } from './socket';
import { AuthContext, type AuthProviderProps } from './auth-context';

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    refetch,
  } = useQuery<CurrentUserResponse | null, ApiError>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await currentUserApiV1MeGet({ throwOnError: true });
        return res;
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          return null; // Silent catch for unauthenticated state
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 5000,
  });

  useEffect(() => {
    if (user) {
      socket.connect();
    } else {
      socket.disconnect();
    }
    return () => {
      socket.disconnect();
    };
  }, [user]);

  const loginMutation = useMutation<
    CurrentUserResponse,
    ApiError,
    LoginApiV1AuthLoginPostData['body']
  >({
    mutationFn: async (body) => {
      return await loginApiV1AuthLoginPost({ body, throwOnError: true });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
    },
  });

  const logoutMutation = useMutation<void, ApiError, void>({
    mutationFn: async () => {
      await logoutApiV1AuthLogoutPost();
    },
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
    },
  });

  const login = async (body: LoginApiV1AuthLoginPostData['body']) => {
    return loginMutation.mutateAsync(body);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        login,
        logout,
        refetch: async () => {
          await refetch();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
