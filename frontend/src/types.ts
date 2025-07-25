export interface Project {
  id: number;
  name: string;
  description?: string;
  llamastack_url: string;
  provider_id: string;
  git_repo_url?: string;
  test_backend_url?: string;
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
  has_merged_pr?: boolean;
  created_at: string;
}

export interface BackendTestHistory {
  id: number;
  project_id: number;
  user_prompt: string;
  system_prompt?: string;
  variables?: Record<string, string>;
  temperature?: number;
  max_len?: number;
  top_p?: number;
  top_k?: number;
  backend_response?: string;
  response_time_ms?: number;
  status_code?: number;
  error_message?: string;
  rating?: string;
  notes?: string;
  is_test?: boolean;
  created_at: string;
}

export interface ModelParameters {
  temperature: number;
  max_len: number;
  top_p: number;
  top_k: number;
}

export interface GitUser {
  id: number;
  git_platform: string;
  git_username: string;
  git_server_url?: string;
  created_at: string;
}

export interface PendingPR {
  id: number;
  project_id: number;
  prompt_history_id: number;
  pr_url: string;
  pr_number: number;
  is_merged: boolean;
  created_at: string;
}