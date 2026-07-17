import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { CurrentUserResponse, LoginApiV1AuthLoginPostData } from '../contracts/rest/types.gen';

export interface AuthContextType {
  user: CurrentUserResponse | null;
  isLoading: boolean;
  login: (data: LoginApiV1AuthLoginPostData['body']) => Promise<CurrentUserResponse>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export type AuthProviderProps = { children: ReactNode };
