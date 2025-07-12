from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class ProjectCreate(BaseModel):
    name: str
    llamastackUrl: str
    providerId: str
    gitRepoUrl: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    llamastackUrl: Optional[str] = None
    providerId: Optional[str] = None
    gitRepoUrl: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    llamastack_url: str
    provider_id: str
    git_repo_url: Optional[str] = None
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
    rating: Optional[str] = None
    notes: Optional[str] = None
    is_prod: Optional[bool] = False
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

class ProdPromptData(BaseModel):
    user_prompt: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_len: Optional[int] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    variables: Optional[Dict[str, str]] = None
    created_at: str