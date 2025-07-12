import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser, UserSession } from '../types';
import { api, setAuthToken } from '../api';

interface AuthContextType {
  user: AppUser | null;
  session: UserSession | null;
  loading: boolean;
  login: (session: UserSession) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on app start
  useEffect(() => {
    checkAuth();
    
    // Listen for auth logout events from API interceptor
    const handleAuthLogout = () => {
      setUser(null);
      setSession(null);
    };
    
    window.addEventListener('auth-logout', handleAuthLogout);
    return () => window.removeEventListener('auth-logout', handleAuthLogout);
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      // Verify token is still valid by getting current user
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
      
      // Create a minimal session object (we don't store full session in localStorage)
      setSession({
        session_token: token,
        user: currentUser,
        expires_at: '', // We don't store expiry in localStorage
      });
    } catch (error) {
      // Token is invalid, clear it
      localStorage.removeItem('auth_token');
      setAuthToken(null);
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (newSession: UserSession) => {
    setUser(newSession.user);
    setSession(newSession);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      // Even if logout API fails, clear local state
      console.warn('Logout API failed:', error);
    } finally {
      setUser(null);
      setSession(null);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    login,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};