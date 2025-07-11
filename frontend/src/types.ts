export interface Project {
  id: number;
  name: string;
  llamastack_url: string;
  provider_id: string;
  created_at: string;
}

export interface PromptHistory {
  id: number;
  project_id: number;
  user_prompt: string;
  system_prompt?: string;
  variables?: Record<string, string>;
  temperature?: number;
  max_len?: number;
  top_p?: number;
  top_k?: number;
  response?: string;
  rating?: string;
  notes?: string;
  is_prod?: boolean;
  created_at: string;
}

export interface ModelParameters {
  temperature: number;
  max_len: number;
  top_p: number;
  top_k: number;
}