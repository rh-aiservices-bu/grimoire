import axios from 'axios';
import { Project, PromptHistory, BackendTestHistory, GitUser, PendingPR } from './types';

// Runtime API base URL detection
const getApiBase = (): string => {
  // Use environment variable if set, otherwise detect environment at runtime
  if (import.meta.env.VITE_BACKEND_URL) {
    return `${import.meta.env.VITE_BACKEND_URL}/api`;
  }
  
  // Check hostname at runtime
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  
  // Use relative path for production deployment
  return '/api';
};

export const api = {
  // Projects
  getProjects: async (): Promise<Project[]> => {
    const response = await axios.get(`${getApiBase()}/projects`);
    return response.data;
  },

  createProject: async (data: {
    name: string;
    description?: string;
    llamastackUrl: string;
    providerId: string;
    gitRepoUrl?: string;
    testBackendUrl?: string;
  }): Promise<Project> => {
    const response = await axios.post(`${getApiBase()}/projects`, data);
    return response.data;
  },

  getProject: async (id: number): Promise<Project> => {
    const response = await axios.get(`${getApiBase()}/projects/${id}`);
    return response.data;
  },

  updateProject: async (
    id: number,
    data: {
      name?: string;
      description?: string;
      llamastackUrl?: string;
      providerId?: string;
      gitRepoUrl?: string;
      testBackendUrl?: string;
    }
  ): Promise<Project> => {
    const response = await axios.put(`${getApiBase()}/projects/${id}`, data);
    return response.data;
  },

  deleteProject: async (id: number): Promise<void> => {
    await axios.delete(`${getApiBase()}/projects/${id}`);
  },

  // Prompt History
  getPromptHistory: async (projectId: number): Promise<PromptHistory[]> => {
    const response = await axios.get(`${getApiBase()}/projects/${projectId}/history`);
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
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/history`, data);
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
    const response = await axios.put(`${getApiBase()}/projects/${projectId}/history/${historyId}`, data);
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
      const response = await fetch(`${getApiBase()}/projects/${projectId}/generate`, {
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
    const response = await axios.post(`${getApiBase()}/git/auth`, data);
    return response.data;
  },

  getCurrentGitUser: async (): Promise<GitUser | null> => {
    try {
      const response = await axios.get(`${getApiBase()}/git/user`);
      return response.data;
    } catch (error) {
      // Return null if no user is authenticated (404 is expected)
      return null;
    }
  },

  getGitAuthStatus: async (): Promise<{
    authenticated: boolean;
    user?: {
      username: string;
      platform: string;
      server_url?: string;
    };
    platform?: string;
    last_used?: string;
    error?: string;
  }> => {
    const response = await axios.get(`${getApiBase()}/git/auth-status`);
    return response.data;
  },

  testGitRepoAccess: async (projectId: number): Promise<void> => {
    await axios.post(`${getApiBase()}/projects/${projectId}/git/test-access`);
  },

  // Git operations
  tagPromptAsProd: async (projectId: number, historyId: number): Promise<{
    message: string;
    pr_url: string;
    pr_number: number;
  }> => {
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/history/${historyId}/tag-prod`);
    return response.data;
  },

  getPendingPRs: async (projectId: number): Promise<PendingPR[]> => {
    const response = await axios.get(`${getApiBase()}/projects/${projectId}/pending-prs`);
    return response.data;
  },

  getProdHistoryFromGit: async (projectId: number): Promise<PromptHistory[]> => {
    const response = await axios.get(`${getApiBase()}/projects/${projectId}/prod-history`);
    return response.data;
  },

  getGitHistory: async (projectId: number): Promise<any[]> => {
    const response = await axios.get(`${getApiBase()}/projects/${projectId}/git-history`);
    return response.data;
  },

  syncPRStatus: async (projectId: number): Promise<{ message: string }> => {
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/sync-prs`);
    return response.data;
  },

  // Backend test history
  getBackendTestHistory: async (projectId: number): Promise<BackendTestHistory[]> => {
    const response = await axios.get(`${getApiBase()}/projects/${projectId}/backend-history`);
    return response.data;
  },

  // Backend test history update
  updateBackendTestHistory: async (
    projectId: number,
    historyId: number,
    data: {
      is_test?: boolean;
      rating?: string;
      notes?: string;
    }
  ): Promise<BackendTestHistory> => {
    const response = await axios.put(`${getApiBase()}/projects/${projectId}/backend-history/${historyId}`, data);
    return response.data;
  },

  // Backend testing
  testBackend: async (
    projectId: number,
    data: {
      prompt: string;
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
      const response = await fetch(`${getApiBase()}/projects/${projectId}/test-backend`, {
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
              console.log('Received backend test SSE data:', data);
              if (data.delta && data.delta !== '') {
                onChunk(data.delta);
              } else if (data.status === 'started') {
                console.log('Backend test streaming started');
              } else if (data.error) {
                onError(data.error);
                return;
              } else if (data.done) {
                onComplete();
                return;
              }
            } catch (e) {
              console.warn('Failed to parse backend test SSE data:', line);
            }
          }
        }
      }
      
      onComplete();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error');
    }
  },

  // Evaluation
  runEvaluation: async (
    projectId: number,
    data: {
      dataset: string;
      eval_config: any;
      backend_url: string;
      user_prompt: string;
      system_prompt?: string;
      variables?: Record<string, string>;
      temperature?: number;
      max_len?: number;
      top_p?: number;
      top_k?: number;
    }
  ): Promise<{
    results: Array<{
      input_query: string;
      generated_answer: string;
      expected_answer: string;
      scoring_results?: Record<string, any>;
    }>;
    summary?: Record<string, any>;
    total_tests: number;
    avg_score?: number;
    status: string;
    scoring_functions?: Record<string, any>;
  }> => {
    const response = await axios.post(`${API_BASE}/projects/${projectId}/eval`, data);
    return response.data;
  },

  // Test Settings
  getTestSettings: async (projectId: number): Promise<{
    userPrompt?: string;
    systemPrompt?: string;
    variables?: Record<string, string>;
    temperature?: number;
    maxLen?: number;
    topP?: number;
    topK?: number;
  }> => {
    const response = await axios.get(`${getApiBase()}/projects/${projectId}/test-settings`);
    return response.data;
  },

  saveTestSettings: async (
    projectId: number,
    settings: {
      userPrompt?: string;
      systemPrompt?: string;
      variables?: Record<string, string>;
      temperature?: number;
      maxLen?: number;
      topP?: number;
      topK?: number;
    }
  ): Promise<{
    message: string;
    commit_sha?: string;
    commit_url?: string;
  }> => {
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/test-settings`, settings);
    return response.data;
  },

  // Tag backend test as test
  tagBackendTestAsTest: async (projectId: number, historyId: number): Promise<{
    message: string;
    commit_sha?: string;
    commit_url?: string;
  }> => {
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/backend-history/${historyId}/tag-test`);
    return response.data;
  },

  // Tag backend test as prod
  tagBackendTestAsProd: async (projectId: number, historyId: number): Promise<{
    message: string;
    pr_url: string;
    pr_number: number;
  }> => {
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/backend-history/${historyId}/tag-prod`);
    return response.data;
  },

  // Tag prompt as test (from experiment history)
  tagPromptAsTest: async (projectId: number, historyId: number): Promise<{
    message: string;
    commit_sha?: string;
    commit_url?: string;
  }> => {
    const response = await axios.post(`${getApiBase()}/projects/${projectId}/history/${historyId}/tag-test`);
    return response.data;
  },
};