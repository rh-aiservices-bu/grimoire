import axios from 'axios';
import { Project, PromptHistory } from './types';

const API_BASE = 'http://localhost:3001/api';

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
              if (data.delta) {
                onChunk(data.delta);
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
};