import axios from 'axios';
import { Project, PromptHistory, GitUser, PendingPR, AppUser, UserSession, ProjectCollaborator } from './types';

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`;

// Auth token management
let authToken: string | null = localStorage.getItem('auth_token');

// Set up axios interceptor to include auth token
axios.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Set up axios interceptor to handle auth errors
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid token
      authToken = null;
      localStorage.removeItem('auth_token');
      // Optionally redirect to login
      window.dispatchEvent(new Event('auth-logout'));
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
};

export const api = {
  // Projects
  getProjects: async (): Promise<Project[]> => {
    const response = await axios.get(`${API_BASE}/projects`);
    return response.data;
  },

  createProject: async (data: {
    name: string;
    llamastackUrl: string;
    providerId: string;
    gitRepoUrl?: string;
  }): Promise<Project> => {
    const response = await axios.post(`${API_BASE}/projects`, data);
    return response.data;
  },

  getProject: async (id: number): Promise<Project> => {
    const response = await axios.get(`${API_BASE}/projects/${id}`);
    return response.data;
  },

  updateProject: async (
    id: number,
    data: {
      name?: string;
      llamastackUrl?: string;
      providerId?: string;
      gitRepoUrl?: string;
    }
  ): Promise<Project> => {
    const response = await axios.put(`${API_BASE}/projects/${id}`, data);
    return response.data;
  },

  deleteProject: async (id: number): Promise<void> => {
    await axios.delete(`${API_BASE}/projects/${id}`);
  },

  // Prompt History
  getPromptHistory: async (projectId: number): Promise<PromptHistory[]> => {
    const response = await axios.get(`${API_BASE}/projects/${projectId}/history`);
    return response.data;
  },

  savePromptHistory: async (
    projectId: number,
    data: {
      userPrompt: string;
      systemPrompt?: string;
      variables?: Record<string, string>;
      temperature?: number;
      maxLen?: number;
      topP?: number;
      topK?: number;
      response?: string;
    }
  ): Promise<PromptHistory> => {
    const response = await axios.post(`${API_BASE}/projects/${projectId}/history`, data);
    return response.data;
  },

  updatePromptHistory: async (
    projectId: number,
    historyId: number,
    data: {
      rating?: string;
      notes?: string;
      is_prod?: boolean;
    }
  ): Promise<PromptHistory> => {
    const response = await axios.put(`${API_BASE}/projects/${projectId}/history/${historyId}`, data);
    return response.data;
  },

  // Generate response (streaming)
  generateResponseStream: async (
    projectId: number,
    data: {
      userPrompt: string;
      systemPrompt?: string;
      variables?: Record<string, string>;
      temperature?: number;
      maxLen?: number;
      topP?: number;
      topK?: number;
    },
    onChunk: (chunk: string) => void,
    onError: (error: string) => void,
    onComplete: () => void
  ): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('Received SSE data:', data);
              if (data.delta && data.delta !== '') {
                onChunk(data.delta);
              } else if (data.status === 'started') {
                console.log('Streaming started');
              } else if (data.error) {
                onError(data.error);
                return;
              } else if (data.done) {
                onComplete();
                return;
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }
      
      onComplete();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error');
    }
  },

  // Git authentication
  authenticateGit: async (data: {
    platform: string;
    username: string;
    access_token: string;
    server_url?: string;
  }): Promise<GitUser> => {
    const response = await axios.post(`${API_BASE}/git/auth`, data);
    return response.data;
  },

  getCurrentGitUser: async (): Promise<GitUser | null> => {
    try {
      const response = await axios.get(`${API_BASE}/git/user`);
      return response.data;
    } catch (error) {
      // Return null if no git user is authenticated (404 is expected)
      return null;
    }
  },

  testGitRepoAccess: async (projectId: number): Promise<void> => {
    await axios.post(`${API_BASE}/projects/${projectId}/git/test-access`);
  },

  // Git operations
  tagPromptAsProd: async (projectId: number, historyId: number): Promise<{
    message: string;
    pr_url: string;
    pr_number: number;
  }> => {
    const response = await axios.post(`${API_BASE}/projects/${projectId}/history/${historyId}/tag-prod`);
    return response.data;
  },

  getPendingPRs: async (projectId: number): Promise<PendingPR[]> => {
    const response = await axios.get(`${API_BASE}/projects/${projectId}/pending-prs`);
    return response.data;
  },

  getProdHistoryFromGit: async (projectId: number): Promise<PromptHistory[]> => {
    const response = await axios.get(`${API_BASE}/projects/${projectId}/prod-history`);
    return response.data;
  },

  syncPRStatus: async (projectId: number): Promise<{ message: string }> => {
    const response = await axios.post(`${API_BASE}/projects/${projectId}/sync-prs`);
    return response.data;
  },

  // Authentication
  register: async (data: {
    email: string;
    name: string;
    password: string;
  }): Promise<UserSession> => {
    const response = await axios.post(`${API_BASE}/auth/register`, data);
    const session = response.data;
    setAuthToken(session.session_token);
    return session;
  },

  login: async (data: {
    email: string;
    password: string;
  }): Promise<UserSession> => {
    const response = await axios.post(`${API_BASE}/auth/login`, data);
    const session = response.data;
    setAuthToken(session.session_token);
    return session;
  },

  logout: async (): Promise<void> => {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
    } finally {
      setAuthToken(null);
    }
  },

  getCurrentUser: async (): Promise<AppUser> => {
    const response = await axios.get(`${API_BASE}/auth/me`);
    return response.data;
  },

  // Project Collaboration
  addCollaborator: async (projectId: number, data: {
    email: string;
    role: 'owner' | 'editor' | 'viewer';
  }): Promise<ProjectCollaborator> => {
    const response = await axios.post(`${API_BASE}/projects/${projectId}/collaborators`, data);
    return response.data;
  },

  getCollaborators: async (projectId: number): Promise<ProjectCollaborator[]> => {
    const response = await axios.get(`${API_BASE}/projects/${projectId}/collaborators`);
    return response.data;
  },

  removeCollaborator: async (projectId: number, collaboratorId: number): Promise<void> => {
    await axios.delete(`${API_BASE}/projects/${projectId}/collaborators/${collaboratorId}`);
  },

  updateCollaboratorRole: async (projectId: number, collaboratorId: number, role: string): Promise<ProjectCollaborator> => {
    const response = await axios.put(`${API_BASE}/projects/${projectId}/collaborators/${collaboratorId}/role`, { role });
    return response.data;
  },
};