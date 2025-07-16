from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    llamastackUrl: str
    providerId: str
    gitRepoUrl: Optional[str] = None
    testBackendUrl: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    llamastackUrl: Optional[str] = None
    providerId: Optional[str] = None
    gitRepoUrl: Optional[str] = None
    testBackendUrl: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    llamastack_url: str
    provider_id: str
    git_repo_url: Optional[str] = None
    test_backend_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class PromptHistoryCreate(BaseModel):
    userPrompt: str
    systemPrompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = None
    maxLen: Optional[int] = None
    topP: Optional[float] = None
    topK: Optional[int] = None
    response: Optional[str] = None

class PromptHistoryResponse(BaseModel):
    id: int
    project_id: int
    user_prompt: str
    system_prompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = None
    max_len: Optional[int] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    response: Optional[str] = None
    backend_response: Optional[str] = None
    rating: Optional[str] = None
    notes: Optional[str] = None
    is_prod: Optional[bool] = False
    has_merged_pr: Optional[bool] = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class GenerateRequest(BaseModel):
    userPrompt: str
    systemPrompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = 0.7
    maxLen: Optional[int] = 1000
    topP: Optional[float] = 0.9
    topK: Optional[int] = 50

class GenerateResponse(BaseModel):
    response: str

class PromptHistoryUpdate(BaseModel):
    rating: Optional[str] = None
    notes: Optional[str] = None
    is_prod: Optional[bool] = None

class LatestPromptResponse(BaseModel):
    userPrompt: str
    systemPrompt: Optional[str] = None
    temperature: Optional[float] = None
    maxLen: Optional[int] = None
    topP: Optional[float] = None
    topK: Optional[int] = None
    variables: Optional[Dict[str, str]] = None
    is_prod: Optional[bool] = False

class ProjectSummary(BaseModel):
    name: str
    provider_id: str
    llamastack_url: str

class ProjectsModelsResponse(BaseModel):
    projects: List[ProjectSummary]

class UserCreate(BaseModel):
    git_platform: str  # github, gitlab, gitea
    git_username: str
    git_access_token: str

class UserResponse(BaseModel):
    id: int
    git_platform: str
    git_username: str
    git_server_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class PendingPRResponse(BaseModel):
    id: int
    project_id: int
    prompt_history_id: int
    pr_url: str
    pr_number: int
    is_merged: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class GitAuthRequest(BaseModel):
    platform: str  # github, gitlab, gitea
    username: str
    access_token: str
    server_url: Optional[str] = None  # Required for GitLab/Gitea self-hosted instances

class ProdPromptData(BaseModel):
    user_prompt: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_len: Optional[int] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    variables: Optional[Dict[str, str]] = None
    created_at: Optional[str] = None

class BackendTestRequest(BaseModel):
    prompt: str
    systemPrompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = None
    maxLen: Optional[int] = None
    topP: Optional[float] = None
    topK: Optional[int] = None

class BackendTestHistoryResponse(BaseModel):
    id: int
    project_id: int
    user_prompt: str
    system_prompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = None
    max_len: Optional[int] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    backend_response: Optional[str] = None
    response_time_ms: Optional[int] = None
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    rating: Optional[str] = None
    notes: Optional[str] = None
    is_test: Optional[bool] = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class BackendTestHistoryUpdate(BaseModel):
    is_test: Optional[bool] = None
    rating: Optional[str] = None
    notes: Optional[str] = None

class TestPromptData(BaseModel):
    user_prompt: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_len: Optional[int] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    variables: Optional[Dict[str, str]] = None
    created_at: Optional[str] = None

class TestSettingsRequest(BaseModel):
    userPrompt: Optional[str] = None
    systemPrompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = 0.7
    maxLen: Optional[int] = 1000
    topP: Optional[float] = 0.9
    topK: Optional[int] = 50

class TestSettingsResponse(BaseModel):
    userPrompt: Optional[str] = None
    systemPrompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = 0.7
    maxLen: Optional[int] = 1000
    topP: Optional[float] = 0.9
    topK: Optional[int] = 50

class EvalRequest(BaseModel):
    dataset: str
    eval_config: Dict[str, Any]
    backend_url: str
    user_prompt: str
    system_prompt: Optional[str] = None
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = 0.7
    max_len: Optional[int] = 1000
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 50

class EvalTestResult(BaseModel):
    input_query: str
    generated_answer: str
    expected_answer: str
    scoring_results: Optional[Dict[str, Any]] = None  # All scoring function results

class EvalResponse(BaseModel):
    results: List[EvalTestResult]
    summary: Optional[Dict[str, Any]] = None
    total_tests: int
    avg_score: Optional[float] = None
    status: str = "completed"
    scoring_functions: Optional[Dict[str, Any]] = None  # All scoring function results
    variables: Optional[Dict[str, str]] = None
    temperature: Optional[float] = 0.7
    maxLen: Optional[int] = 1000
    topP: Optional[float] = 0.9
    topK: Optional[int] = 50