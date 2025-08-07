import React, { createContext, useContext, useReducer, useEffect, ReactNode, useRef } from 'react';
import { Project, GitUser } from '../types';
import { api } from '../api';

// State interface
interface AppState {
  projects: Project[];
  selectedProject: Project | null;
  gitUser: GitUser | null;
  isLoading: boolean;
  isCreatingProject: boolean;
  error: string;
  notifications: Notification[];
}

// Notification interface
interface Notification {
  id: string;
  title: string;
  variant: 'success' | 'danger' | 'warning' | 'info';
  message?: string;
  actionLinks?: Array<{ text: string; url: string }>;
  actionButton?: { text: string; onClick: () => void };
}

// Action types
type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CREATING_PROJECT'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'SET_SELECTED_PROJECT'; payload: Project | null }
  | { type: 'SET_GIT_USER'; payload: GitUser | null }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: number }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id'> }
  | { type: 'REMOVE_NOTIFICATION'; payload: string };

// Initial state
const initialState: AppState = {
  projects: [],
  selectedProject: null,
  gitUser: null,
  isLoading: true,
  error: '',
  notifications: [],
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_CREATING_PROJECT':
      return { ...state, isCreatingProject: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };
    case 'SET_SELECTED_PROJECT':
      return { ...state, selectedProject: action.payload };
    case 'SET_GIT_USER':
      return { ...state, gitUser: action.payload };
    case 'ADD_PROJECT':
      return { ...state, projects: [action.payload, ...state.projects] };
    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map(p => 
          p.id === action.payload.id ? action.payload : p
        ),
        selectedProject: state.selectedProject?.id === action.payload.id 
          ? action.payload 
          : state.selectedProject,
      };
    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.payload),
        selectedProject: state.selectedProject?.id === action.payload 
          ? null 
          : state.selectedProject,
      };
    case 'ADD_NOTIFICATION':
      const id = Date.now().toString();
      return {
        ...state,
        notifications: [...state.notifications, { ...action.payload, id }],
      };
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };
    default:
      return state;
  }
}

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    loadProjects: () => Promise<void>;
    loadGitUser: (forceRefresh?: boolean) => Promise<void>;
    createProject: (data: {
      name: string;
      llamastackUrl: string;
      providerId: string;
      gitRepoUrl?: string;
    }) => Promise<void>;
    selectProject: (project: Project | null) => void;
    updateProject: (project: Project) => void;
    deleteProject: (projectId: number) => void;
    addNotification: (notification: Omit<Notification, 'id'>) => void;
    removeNotification: (id: string) => void;
    authenticateGit: (data: { 
      platform: string; 
      username: string; 
      access_token: string 
    }) => Promise<void>;
  };
} | null>(null);

// Provider component
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  // Cache for auth status to prevent excessive checks
  const authStatusCache = useRef<{ 
    timestamp: number; 
    authenticated: boolean; 
    user?: GitUser | null 
  } | null>(null);
  const AUTH_CACHE_DURATION = 30000; // 30 seconds cache for auth status

  // Actions
  const actions = {
    loadProjects: async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        const projectsData = await api.getProjects();
        dispatch({ type: 'SET_PROJECTS', payload: projectsData });
        
        // Auto-select first project if none is selected and projects exist
        if (!state.selectedProject && projectsData.length > 0) {
          dispatch({ type: 'SET_SELECTED_PROJECT', payload: projectsData[0] });
        }
      } catch (error) {
        dispatch({ 
          type: 'SET_ERROR', 
          payload: 'Failed to load projects. Make sure the backend server is running.' 
        });
        console.error('Failed to load projects:', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    loadGitUser: async (forceRefresh: boolean = false) => {
      try {
        // Check cache first unless forced refresh
        if (!forceRefresh && authStatusCache.current) {
          const now = Date.now();
          if (now - authStatusCache.current.timestamp < AUTH_CACHE_DURATION) {
            dispatch({ type: 'SET_GIT_USER', payload: authStatusCache.current.user || null });
            return;
          }
        }
        
        // Use instant check for immediate response (just DB lookup)
        const instantStatus = await api.getInstantGitAuthStatus();
        const user = instantStatus.authenticated && instantStatus.user ? instantStatus.user as GitUser : null;
        
        // Update cache and dispatch immediately
        authStatusCache.current = {
          timestamp: Date.now(),
          authenticated: instantStatus.authenticated,
          user
        };
        
        dispatch({ type: 'SET_GIT_USER', payload: user });
        
        // Optional background verification if we have a user (don't await)
        if (instantStatus.authenticated && !forceRefresh) {
          api.getQuickGitAuthStatus().then(status => {
            const verifiedUser = status.authenticated && status.user ? status.user as GitUser : null;
            authStatusCache.current = {
              timestamp: Date.now(),
              authenticated: status.authenticated,
              user: verifiedUser
            };
            dispatch({ type: 'SET_GIT_USER', payload: verifiedUser });
          }).catch(err => {
            console.warn('Background git user verification failed:', err);
          });
        }
      } catch (error) {
        // No git user authenticated yet, that's fine
        authStatusCache.current = {
          timestamp: Date.now(),
          authenticated: false,
          user: null
        };
        dispatch({ type: 'SET_GIT_USER', payload: null });
      }
    },

    createProject: async (data: {
      name: string;
      llamastackUrl: string;
      providerId: string;
      gitRepoUrl?: string;
    }) => {
      try {
        dispatch({ type: 'SET_CREATING_PROJECT', payload: true });
        const newProject = await api.createProject(data);
        dispatch({ type: 'ADD_PROJECT', payload: newProject });
        dispatch({ type: 'SET_SELECTED_PROJECT', payload: newProject });
        dispatch({ type: 'SET_CREATING_PROJECT', payload: false });
      } catch (error) {
        dispatch({ type: 'SET_CREATING_PROJECT', payload: false });
        dispatch({ type: 'SET_ERROR', payload: 'Failed to create project' });
        console.error('Failed to create project:', error);
      }
    },

    selectProject: (project: Project | null) => {
      dispatch({ type: 'SET_SELECTED_PROJECT', payload: project });
    },

    updateProject: (project: Project) => {
      dispatch({ type: 'UPDATE_PROJECT', payload: project });
    },

    deleteProject: (projectId: number) => {
      dispatch({ type: 'DELETE_PROJECT', payload: projectId });
    },

    addNotification: (notification: Omit<Notification, 'id'>) => {
      dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
      
      // Auto-remove after 10 seconds unless it has action links or buttons
      if (!notification.actionLinks?.length && !notification.actionButton) {
        setTimeout(() => {
          const id = Date.now().toString();
          dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
        }, 10000);
      }
    },

    removeNotification: (id: string) => {
      dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
    },

    authenticateGit: async (data: { 
      platform: string; 
      username: string; 
      access_token: string 
    }) => {
      try {
        const user = await api.authenticateGit(data);
        
        // Immediately update auth cache with new authenticated status
        authStatusCache.current = {
          timestamp: Date.now(),
          authenticated: true,
          user: {
            git_platform: user.git_platform,
            git_username: user.git_username,
            git_server_url: user.git_server_url
          }
        };
        
        dispatch({ type: 'SET_GIT_USER', payload: user });
        dispatch({ type: 'SET_ERROR', payload: '' });
        
        actions.addNotification({
          title: 'Git Authentication Successful',
          variant: 'success',
          message: `Successfully authenticated as ${user.git_username} on ${user.git_platform}`
        });
      } catch (error) {
        // Invalidate cache on error too
        authStatusCache.current = null;
        
        actions.addNotification({
          title: 'Git Authentication Failed',
          variant: 'danger',
          message: 'Please check your credentials and ensure your access token has repository permissions.'
        });
        console.error('Git authentication failed:', error);
      }
    },
  };

  // Load initial data
  useEffect(() => {
    actions.loadProjects();
    actions.loadGitUser();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}