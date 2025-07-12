from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import json
import re
import asyncio
import threading
import queue

from llama_stack_client import LlamaStackClient
from llama_stack_client.lib.inference.event_logger import EventLogger

from database import get_db
from models import Project, PromptHistory, User, PendingPR
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    PromptHistoryCreate, PromptHistoryResponse, PromptHistoryUpdate,
    GenerateRequest, GenerateResponse, LatestPromptResponse,
    ProjectSummary, ProjectsModelsResponse, UserCreate, UserResponse,
    PendingPRResponse, GitAuthRequest, ProdPromptData
)
from git_service import GitService

app = FastAPI(
    title="Prompt Experimentation Tool API",
    description="""
    A comprehensive API for managing prompt experiments with Llama Stack models.
    
    ## Features
    
    * **Project Management**: Create, update, delete, and manage prompt experimentation projects
    * **Prompt History**: Track and manage prompt history with ratings and notes
    * **Template Variables**: Support for dynamic prompt templates with variable substitution
    * **Model Parameters**: Configure temperature, max length, top-p, and top-k parameters
    * **Streaming Responses**: Real-time streaming of model responses
    * **External Integration**: Endpoints for accessing latest prompt configurations
    
    ## Quick Start
    
    1. **Browse all projects**: `GET /api/projects-models`
    2. **Get latest prompt**: `GET /prompt/{project_name}/{provider_id}`
    3. **Create a project**: `POST /api/projects`
    4. **Generate responses**: `POST /api/projects/{project_id}/generate`
    
    ## Variable Templates
    
    Use `{{variable_name}}` syntax in prompts and provide variables as key-value pairs.
    
    Example:
    - Prompt: `"Hello {{name}}, you are {{age}} years old"`
    - Variables: `{"name": "Alice", "age": "25"}`
    - Result: `"Hello Alice, you are 25 years old"`
    """,
    version="1.0.0",
    contact={
        "name": "API Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT",
    },
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Git Service
git_service = GitService()

def process_template_variables(text: str, variables: dict) -> str:
    """Process template variables in text"""
    if not variables:
        return text
    
    for key, value in variables.items():
        pattern = r'\{\{\s*' + re.escape(key) + r'\s*\}\}'
        text = re.sub(pattern, str(value), text)
    
    return text

# Projects endpoints
@app.get("/api/projects", response_model=List[ProjectResponse], tags=["Projects"])
async def get_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return projects

@app.post("/api/projects", response_model=ProjectResponse, tags=["Projects"])
async def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(
        name=project.name,
        llamastack_url=project.llamastackUrl,
        provider_id=project.providerId,
        git_repo_url=project.gitRepoUrl
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # If git repo URL is provided, create initial PR
    if project.gitRepoUrl:
        # Get current user (for now, just get the first user - in production you'd get from session)
        user = db.query(User).first()
        if user:
            try:
                token = git_service.decrypt_token(user.git_access_token)
                pr_result = git_service.create_initial_pr(
                    user.git_platform, 
                    token, 
                    project.gitRepoUrl, 
                    project.name, 
                    project.providerId
                )
                if pr_result:
                    print(f"Created initial PR: {pr_result['pr_url']}")
            except Exception as e:
                print(f"Failed to create initial PR: {e}")
    
    return db_project

@app.get("/api/projects/{project_id}", response_model=ProjectResponse, tags=["Projects"])
async def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.put("/api/projects/{project_id}", response_model=ProjectResponse, tags=["Projects"])
async def update_project(
    project_id: int, 
    project_update: ProjectUpdate, 
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update only provided fields
    if project_update.name is not None:
        project.name = project_update.name
    if project_update.llamastackUrl is not None:
        project.llamastack_url = project_update.llamastackUrl
    if project_update.providerId is not None:
        project.provider_id = project_update.providerId
    if project_update.gitRepoUrl is not None:
        project.git_repo_url = project_update.gitRepoUrl
    
    db.commit()
    db.refresh(project)
    return project

@app.delete("/api/projects/{project_id}", tags=["Projects"])
async def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete all associated prompt history first (cascade delete)
    db.query(PromptHistory).filter(PromptHistory.project_id == project_id).delete()
    
    # Delete the project
    db.delete(project)
    db.commit()
    
    return {"message": "Project deleted successfully"}

# Prompt history endpoints
@app.get("/api/projects/{project_id}/history", response_model=List[PromptHistoryResponse], tags=["History"])
async def get_prompt_history(project_id: int, db: Session = Depends(get_db)):
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    history = db.query(PromptHistory).filter(
        PromptHistory.project_id == project_id
    ).order_by(PromptHistory.is_prod.desc(), PromptHistory.created_at.desc()).all()
    
    # Parse variables JSON
    for item in history:
        if item.variables:
            try:
                item.variables = json.loads(item.variables)
            except:
                item.variables = None
    
    return history

@app.post("/api/projects/{project_id}/history", response_model=PromptHistoryResponse, tags=["History"])
async def save_prompt_history(
    project_id: int, 
    history: PromptHistoryCreate, 
    db: Session = Depends(get_db)
):
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db_history = PromptHistory(
        project_id=project_id,
        user_prompt=history.userPrompt,
        system_prompt=history.systemPrompt,
        variables=json.dumps(history.variables) if history.variables else None,
        temperature=history.temperature,
        max_len=history.maxLen,
        top_p=history.topP,
        top_k=history.topK,
        response=history.response
    )
    db.add(db_history)
    db.commit()
    db.refresh(db_history)
    
    # Parse variables for response
    if db_history.variables:
        try:
            db_history.variables = json.loads(db_history.variables)
        except:
            db_history.variables = None
    
    return db_history

@app.put("/api/projects/{project_id}/history/{history_id}", response_model=PromptHistoryResponse, tags=["History"])
async def update_prompt_history(
    project_id: int,
    history_id: int,
    history_update: PromptHistoryUpdate,
    db: Session = Depends(get_db)
):
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get history item
    history_item = db.query(PromptHistory).filter(
        PromptHistory.id == history_id,
        PromptHistory.project_id == project_id
    ).first()
    if not history_item:
        raise HTTPException(status_code=404, detail="History item not found")
    
    # Update fields
    if history_update.rating is not None:
        history_item.rating = history_update.rating
    if history_update.notes is not None:
        history_item.notes = history_update.notes
    if history_update.is_prod is not None:
        # If setting as prod, remove prod status from other items in the same project
        if history_update.is_prod:
            db.query(PromptHistory).filter(
                PromptHistory.project_id == project_id,
                PromptHistory.id != history_id
            ).update({"is_prod": False})
        history_item.is_prod = history_update.is_prod
    
    db.commit()
    db.refresh(history_item)
    
    # Parse variables for response
    if history_item.variables:
        try:
            history_item.variables = json.loads(history_item.variables)
        except:
            history_item.variables = None
    
    return history_item

# Generate response using Llama Stack (streaming)
@app.post("/api/projects/{project_id}/generate", tags=["Generation"])
async def generate_response(
    project_id: int,
    request: GenerateRequest,
    db: Session = Depends(get_db)
):
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Process template variables
    processed_user_prompt = process_template_variables(
        request.userPrompt, request.variables or {}
    )
    
    processed_system_prompt = None
    if request.systemPrompt:
        processed_system_prompt = process_template_variables(
            request.systemPrompt, request.variables or {}
        )
    
    # Prepare messages
    messages = []
    if processed_system_prompt:
        messages.append({"role": "system", "content": processed_system_prompt})
    messages.append({"role": "user", "content": processed_user_prompt})
    
    # Prepare sampling parameters
    sampling_params = {
        "max_tokens": request.maxLen or 1000,
        "temperature": request.temperature or 0.7,
        "top_p": request.topP or 0.9,
        "top_k": request.topK or 50,
    }
    
    print(f"Making request to Llama Stack: {project.llamastack_url}")
    print(f"Model: {project.provider_id}")
    print(f"Messages: {messages}")
    print(f"Sampling params: {sampling_params}")
    
    # Create queue for streaming
    q = queue.Queue()
    full_response = ""
    
    def worker():
        nonlocal full_response
        try:
            # Create Llama Stack client
            base_url = project.llamastack_url
            client = LlamaStackClient(base_url=base_url)
            
            # Send streaming request
            response = client.inference.chat_completion(
                model_id=project.provider_id,
                messages=messages,
                sampling_params=sampling_params,
                stream=True,
            )
            
            for r in response:
                if hasattr(r, 'event') and hasattr(r.event, 'delta') and hasattr(r.event.delta, 'text'):
                    chunk_text = r.event.delta.text
                    full_response += chunk_text
                    chunk = f"data: {json.dumps({'delta': chunk_text})}\n\n"
                    q.put(chunk)
                elif hasattr(r, 'event') and hasattr(r.event, 'delta') and hasattr(r.event.delta, 'content'):
                    chunk_text = r.event.delta.content
                    full_response += chunk_text
                    chunk = f"data: {json.dumps({'delta': chunk_text})}\n\n"
                    q.put(chunk)
                    
        except Exception as e:
            error_chunk = f"data: {json.dumps({'error': str(e)})}\n\n"
            q.put(error_chunk)
            print(f"Streaming error: {e}")
        finally:
            # Save to history after streaming is complete
            try:
                db_history = PromptHistory(
                    project_id=project_id,
                    user_prompt=request.userPrompt,
                    system_prompt=request.systemPrompt,
                    variables=json.dumps(request.variables) if request.variables else None,
                    temperature=request.temperature,
                    max_len=request.maxLen,
                    top_p=request.topP,
                    top_k=request.topK,
                    response=full_response
                )
                db.add(db_history)
                db.commit()
            except Exception as db_error:
                print(f"Database save error: {db_error}")
            
            # Signal end of stream
            q.put(f"data: {json.dumps({'done': True})}\n\n")
            q.put(None)
    
    # Start the worker thread
    threading.Thread(target=worker).start()
    
    async def streamer():
        while True:
            chunk = await asyncio.get_event_loop().run_in_executor(None, q.get)
            if chunk is None:
                break
            yield chunk
    
    return StreamingResponse(streamer(), media_type="text/event-stream")


@app.get("/api/debug/projects", tags=["Debug"])
async def debug_projects(db: Session = Depends(get_db)):
    """Debug endpoint to show all projects with their exact names and provider IDs"""
    projects = db.query(Project).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "provider_id": p.provider_id,
            "git_repo_url": p.git_repo_url,
            "prod_url": f"/prompt/{p.name}/{p.provider_id}/prod"
        }
        for p in projects
    ]

@app.get("/api/projects-models", response_model=ProjectsModelsResponse, tags=["External API"])
async def get_projects_and_models(db: Session = Depends(get_db)):
    """
    Get all available projects and their model configurations.
    
    This endpoint provides a list of all projects in the system along with their
    associated model names (provider_id) and Llama Stack URLs. Useful for discovering
    available projects and their configurations.
    
    **Example Response:**
    ```json
    {
      "projects": [
        {
          "name": "newsummary",
          "provider_id": "llama32-full",
          "llamastack_url": "http://llama-stack-server.example.com"
        }
      ]
    }
    ```
    """
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    
    project_summaries = [
        ProjectSummary(
            name=project.name,
            provider_id=project.provider_id,
            llamastack_url=project.llamastack_url
        )
        for project in projects
    ]
    
    return ProjectsModelsResponse(projects=project_summaries)

@app.get("/prompt/{project_name}/{provider_id}/prod", response_model=LatestPromptResponse, tags=["External API"])
async def get_prod_prompt(project_name: str, provider_id: str, db: Session = Depends(get_db)):
    """
    Get the production-ready prompt configuration for a specific project and model.
    
    Returns the prompt from git repository for the specified project and provider 
    combination. If project has git repo, serves from git; otherwise falls back to database.
    
    **Path Parameters:**
    - `project_name`: The name of the project (e.g., "newsummary")
    - `provider_id`: The model provider ID (e.g., "llama32-full")
    
    **Example Request:**
    ```
    GET /prompt/newsummary/llama32-full/prod
    ```
    
    **Use Case:** Get only production-ready, tested prompts for deployment
    """
    # Find project by name and provider_id
    print(f"Looking for project: name='{project_name}', provider_id='{provider_id}'")
    project = db.query(Project).filter(
        Project.name == project_name,
        Project.provider_id == provider_id
    ).first()
    
    if not project:
        # Show available projects for debugging
        all_projects = db.query(Project).all()
        print(f"Available projects: {[(p.name, p.provider_id) for p in all_projects]}")
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"Found project: {project.name}, git_repo: {project.git_repo_url}")
    
    # If project has git repo, try to get from git first
    if project.git_repo_url:
        user = db.query(User).first()
        if user:
            try:
                token = git_service.decrypt_token(user.git_access_token)
                prod_prompt = git_service.get_prod_prompt_from_git(
                    user.git_platform,
                    token,
                    project.git_repo_url,
                    project.name,
                    project.provider_id
                )
                
                if prod_prompt:
                    return LatestPromptResponse(
                        userPrompt=prod_prompt.user_prompt,
                        systemPrompt=prod_prompt.system_prompt,
                        temperature=prod_prompt.temperature,
                        maxLen=prod_prompt.max_len,
                        topP=prod_prompt.top_p,
                        topK=prod_prompt.top_k,
                        variables=prod_prompt.variables,
                        is_prod=True
                    )
            except Exception as e:
                print(f"Failed to get prod prompt from git: {e}")
                # Fall through to database lookup
    
    # Fallback: Get from database (for projects without git or when git fails)
    prod_history = db.query(PromptHistory).filter(
        PromptHistory.project_id == project.id,
        PromptHistory.is_prod == True
    ).first()
    
    if not prod_history:
        raise HTTPException(status_code=404, detail="No production prompt found for this project")
    
    # Parse variables if they exist
    variables = None
    if prod_history.variables:
        try:
            variables = json.loads(prod_history.variables)
        except:
            variables = None
    
    return LatestPromptResponse(
        userPrompt=prod_history.user_prompt,
        systemPrompt=prod_history.system_prompt,
        temperature=prod_history.temperature,
        maxLen=prod_history.max_len,
        topP=prod_history.top_p,
        topK=prod_history.top_k,
        variables=variables,
        is_prod=prod_history.is_prod
    )

@app.get("/prompt/{project_name}/{provider_id}", response_model=LatestPromptResponse, tags=["External API"])
async def get_latest_prompt(
    project_name: str, 
    provider_id: str, 
    db: Session = Depends(get_db)
):
    """
    Get the latest prompt configuration for a specific project and model.
    
    Retrieves the most recently used prompt configuration including user prompt,
    system prompt, model parameters, and template variables for the specified
    project and provider combination.
    
    **Path Parameters:**
    - `project_name`: The name of the project (e.g., "newsummary")
    - `provider_id`: The model provider ID (e.g., "llama32-full")
    
    **Example Request:**
    ```
    GET /prompt/newsummary/llama32-full
    ```
    
    **Example Response:**
    ```json
    {
      "userPrompt": "Summarize this article: {{content}}",
      "systemPrompt": "You are a helpful news summarizer",
      "temperature": 0.7,
      "maxLen": 1000,
      "topP": 0.9,
      "topK": 50,
      "variables": {
        "content": "Article text here..."
      }
    }
    ```
    
    **Error Responses:**
    - `404`: Project not found or no prompt history exists
    """
    # Find project by name and provider_id
    project = db.query(Project).filter(
        Project.name == project_name,
        Project.provider_id == provider_id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get the latest prompt history for this project
    latest_history = db.query(PromptHistory).filter(
        PromptHistory.project_id == project.id
    ).order_by(PromptHistory.created_at.desc()).first()
    
    if not latest_history:
        raise HTTPException(status_code=404, detail="No prompt history found for this project")
    
    # Parse variables if they exist
    variables = None
    if latest_history.variables:
        try:
            variables = json.loads(latest_history.variables)
        except:
            variables = None
    
    return LatestPromptResponse(
        userPrompt=latest_history.user_prompt,
        systemPrompt=latest_history.system_prompt,
        temperature=latest_history.temperature,
        maxLen=latest_history.max_len,
        topP=latest_history.top_p,
        topK=latest_history.top_k,
        variables=variables,
        is_prod=latest_history.is_prod
    )

# Git authentication endpoints
@app.post("/api/git/auth", response_model=UserResponse, tags=["Git"])
async def authenticate_git(auth_request: GitAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with git platform and store credentials"""
    # Test the credentials first
    test_repo = "https://github.com/octocat/Hello-World"  # Public repo for testing
    if not git_service.test_git_access(auth_request.platform, auth_request.username, auth_request.access_token, test_repo):
        raise HTTPException(status_code=401, detail="Invalid git credentials")
    
    # Check if user already exists
    existing_user = db.query(User).filter(
        User.git_platform == auth_request.platform,
        User.git_username == auth_request.username
    ).first()
    
    if existing_user:
        # Update existing user
        existing_user.git_access_token = git_service.encrypt_token(auth_request.access_token)
        db.commit()
        db.refresh(existing_user)
        return existing_user
    else:
        # Create new user
        encrypted_token = git_service.encrypt_token(auth_request.access_token)
        db_user = User(
            git_platform=auth_request.platform,
            git_username=auth_request.username,
            git_access_token=encrypted_token
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

@app.get("/api/git/user", response_model=UserResponse, tags=["Git"])
async def get_current_git_user(db: Session = Depends(get_db)):
    """Get current authenticated git user"""
    user = db.query(User).first()  # In production, get from session
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    return user

@app.post("/api/projects/{project_id}/git/test-access", tags=["Git"])
async def test_git_repo_access(project_id: int, db: Session = Depends(get_db)):
    """Test if current user has access to project's git repository"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    user = db.query(User).first()  # In production, get from session
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
    try:
        token = git_service.decrypt_token(user.git_access_token)
        has_access = git_service.test_git_access(user.git_platform, user.git_username, token, project.git_repo_url)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="No access to git repository")
        
        return {"message": "Git repository access confirmed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to test git access: {str(e)}")

@app.post("/api/projects/{project_id}/history/{history_id}/tag-prod", tags=["Git"])
async def tag_prompt_as_prod(
    project_id: int,
    history_id: int,
    db: Session = Depends(get_db)
):
    """Tag a prompt as production - creates git PR instead of direct database update"""
    
    # Get project and history
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    history_item = db.query(PromptHistory).filter(
        PromptHistory.id == history_id,
        PromptHistory.project_id == project_id
    ).first()
    if not history_item:
        raise HTTPException(status_code=404, detail="History item not found")
    
    # Check if project has git repo
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    # Get current user
    user = db.query(User).first()  # In production, get from session
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
    try:
        # Prepare prompt data
        variables = None
        if history_item.variables:
            try:
                variables = json.loads(history_item.variables)
            except:
                variables = None
        
        prompt_data = ProdPromptData(
            user_prompt=history_item.user_prompt,
            system_prompt=history_item.system_prompt,
            temperature=history_item.temperature,
            max_len=history_item.max_len,
            top_p=history_item.top_p,
            top_k=history_item.top_k,
            variables=variables,
            created_at=history_item.created_at.isoformat()
        )
        
        # Create PR
        token = git_service.decrypt_token(user.git_access_token)
        pr_result = git_service.create_prompt_pr(
            user.git_platform,
            token,
            project.git_repo_url,
            project.name,
            project.provider_id,
            prompt_data
        )
        
        if not pr_result:
            raise HTTPException(status_code=500, detail="Failed to create pull request")
        
        # Save PR info to database
        pending_pr = PendingPR(
            project_id=project_id,
            prompt_history_id=history_id,
            pr_url=pr_result['pr_url'],
            pr_number=pr_result['pr_number'],
            is_merged=False
        )
        db.add(pending_pr)
        db.commit()
        
        return {
            "message": "Pull request created successfully",
            "pr_url": pr_result['pr_url'],
            "pr_number": pr_result['pr_number']
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create production PR: {str(e)}")

@app.get("/api/projects/{project_id}/pending-prs", response_model=List[PendingPRResponse], tags=["Git"])
async def get_pending_prs(project_id: int, db: Session = Depends(get_db)):
    """Get pending pull requests for a project - checks live status from git"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return []
    
    user = db.query(User).first()
    if not user:
        return []
    
    try:
        token = git_service.decrypt_token(user.git_access_token)
        
        # Get all PRs for this project from database
        all_prs = db.query(PendingPR).filter(
            PendingPR.project_id == project_id
        ).order_by(PendingPR.created_at.desc()).all()
        
        pending_prs = []
        for pr in all_prs:
            # Check live status from git
            status = git_service.check_pr_status(
                user.git_platform,
                token,
                project.git_repo_url,
                pr.pr_number
            )
            
            # Only include if still open/pending
            if status == 'open':
                pending_prs.append(pr)
            # Update database status if changed
            elif status in ['merged', 'closed'] and not pr.is_merged:
                pr.is_merged = True
        
        db.commit()
        return pending_prs
        
    except Exception as e:
        print(f"Failed to check pending PRs: {e}")
        return []

@app.post("/api/projects/{project_id}/sync-prs", tags=["Git"])
async def sync_pr_status(project_id: int, db: Session = Depends(get_db)):
    """Sync PR statuses and mark merged/closed PRs as resolved"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return {"message": "Project has no git repository configured"}
    
    user = db.query(User).first()
    if not user:
        return {"message": "No authenticated git user found"}
    
    try:
        token = git_service.decrypt_token(user.git_access_token)
        pending_prs = db.query(PendingPR).filter(
            PendingPR.project_id == project_id,
            PendingPR.is_merged == False
        ).all()
        
        print(f"Found {len(pending_prs)} pending PRs to check")
        
        updated_count = 0
        for pr in pending_prs:
            print(f"Checking PR #{pr.pr_number} status...")
            status = git_service.check_pr_status(
                user.git_platform,
                token,
                project.git_repo_url,
                pr.pr_number
            )
            print(f"PR #{pr.pr_number} status: {status}")
            
            if status in ['merged', 'closed']:
                pr.is_merged = True
                updated_count += 1
                print(f"Marked PR #{pr.pr_number} as merged")
        
        db.commit()
        return {"message": f"Synced {updated_count} PR statuses"}
        
    except Exception as e:
        print(f"Sync PR error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to sync PR statuses: {str(e)}")

@app.get("/api/projects/{project_id}/prod-history", response_model=List[PromptHistoryResponse], tags=["Git"])
async def get_prod_history_from_git(project_id: int, db: Session = Depends(get_db)):
    """Get production prompt history from git repository showing all changes to the prompt file"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return []  # No git repo, return empty history
    
    user = db.query(User).first()  # In production, get from session
    if not user:
        return []  # No authenticated user, return empty history
    
    history_items = []
    
    try:
        token = git_service.decrypt_token(user.git_access_token)
        
        # Get git commit history for the production prompt file
        file_path = f"{project.name}/{project.provider_id}/prompt_prod.json"
        print(f"Getting commit history for file: {file_path}")
        
        commits = git_service.get_file_commit_history(
            user.git_platform,
            token,
            project.git_repo_url,
            file_path,
            limit=20
        )
        
        print(f"Found {len(commits)} commits for production prompt file")
        
        # Convert each commit to PromptHistoryResponse
        for i, commit in enumerate(commits):
            try:
                # Get the prompt content at this commit
                prompt_data = git_service.get_file_content_at_commit(
                    user.git_platform,
                    token,
                    project.git_repo_url,
                    file_path,
                    commit['sha']
                )
                
                if prompt_data:
                    # Determine commit type from message
                    commit_msg = commit['message']
                    if "🚀" in commit_msg or "Update production prompt" in commit_msg:
                        notes = f"🚀 PR merge: {commit_msg[:80]}{'...' if len(commit_msg) > 80 else ''}"
                        commit_type = "pr"
                    elif "✨" in commit_msg or "Initialize project" in commit_msg:
                        notes = f"✨ Project setup: {commit_msg[:80]}{'...' if len(commit_msg) > 80 else ''}"
                        commit_type = "init"
                    else:
                        notes = f"📝 Direct commit: {commit_msg[:80]}{'...' if len(commit_msg) > 80 else ''}"
                        commit_type = "direct"
                    
                    # Add current badge to the most recent commit
                    if i == 0:
                        notes = f"⚡ CURRENT - {notes}"
                    
                    commit_response = PromptHistoryResponse(
                        id=hash(commit['sha']) % 100000,  # Generate consistent ID from commit SHA
                        project_id=project_id,
                        user_prompt=prompt_data.user_prompt,
                        system_prompt=prompt_data.system_prompt,
                        variables=prompt_data.variables,
                        temperature=prompt_data.temperature,
                        max_len=prompt_data.max_len,
                        top_p=prompt_data.top_p,
                        top_k=prompt_data.top_k,
                        response=None,
                        rating=None,
                        notes=notes,
                        is_prod=True,
                        created_at=commit['date']
                    )
                    history_items.append(commit_response)
                    
            except Exception as e:
                print(f"Failed to get content for commit {commit['sha']}: {e}")
                continue
        
        print(f"Successfully processed {len(history_items)} commits into history items")
        return history_items
            
    except Exception as e:
        print(f"Failed to get prod history from git: {e}")
        import traceback
        traceback.print_exc()
        return []

@app.get("/", tags=["Documentation"])
async def root():
    """
    Welcome to the Prompt Experimentation Tool API!
    
    This API provides comprehensive prompt experimentation capabilities with Llama Stack models.
    
    ## 🚀 Quick Links
    
    - **Interactive API Documentation**: [/docs](/docs) - Swagger UI with live testing
    - **Alternative Documentation**: [/redoc](/redoc) - ReDoc interface
    - **OpenAPI Schema**: [/openapi.json](/openapi.json) - Raw OpenAPI specification
    
    ## 📋 Most Used Endpoints
    
    - `GET /api/projects-models` - List all projects and models
    - `GET /prompt/{project_name}/{provider_id}` - Get latest prompt configuration
    - `POST /api/projects` - Create a new project
    - `POST /api/projects/{id}/generate` - Generate responses (streaming)
    
    ## 💡 External Integration Examples
    
    ```bash
    # Get all available projects and models
    curl http://localhost:3001/api/projects-models
    
    # Get latest prompt for specific project
    curl http://localhost:3001/prompt/newsummary/llama32-full
    ```
    """
    return {
        "message": "Prompt Experimentation Tool API",
        "version": "1.0.0",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc", 
            "openapi_json": "/openapi.json"
        },
        "external_endpoints": {
            "projects_and_models": "/api/projects-models",
            "latest_prompt": "/prompt/{project_name}/{provider_id}"
        },
        "examples": {
            "get_projects": "curl http://localhost:3001/api/projects-models",
            "get_prompt": "curl http://localhost:3001/prompt/newsummary/llama32-full"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)