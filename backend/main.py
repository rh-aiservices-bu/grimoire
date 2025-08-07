from fastapi import FastAPI, Depends, HTTPException, Request, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import re
import asyncio
import threading
import queue
import logging
import httpx
import requests
import time
from datetime import datetime

from llama_stack_client import LlamaStackClient
from llama_stack_client.lib.inference.event_logger import EventLogger
from llama_stack_client import NotFoundError as LlamaStackNotFoundError

from database import get_db
from models import Project, PromptHistory, User, PendingPR, GitCommitCache, BackendTestHistory
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    PromptHistoryCreate, PromptHistoryResponse, PromptHistoryUpdate,
    GenerateRequest, GenerateResponse, LatestPromptResponse,
    ProjectSummary, ProjectsModelsResponse, UserCreate, UserResponse,
    PendingPRResponse, GitAuthRequest, ProdPromptData, BackendTestHistoryResponse,
    BackendTestRequest, BackendTestHistoryUpdate, TestPromptData,
    TestSettingsRequest, TestSettingsResponse, EvalRequest, EvalResponse, EvalTestResult
)
from git_service import GitService
from session_manager import session_manager

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
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev server
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ],  # Specific origins for credentials
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint for OpenShift probes
@app.get("/api", tags=["Health"])
async def health_check():
    """Health check endpoint for OpenShift readiness and liveness probes"""
    return {"status": "healthy", "message": "200"}

# Initialize Git Service
git_service = GitService()

def get_session_user(request: Request) -> Optional[dict]:
    """Get current user from session"""
    session_id = request.cookies.get('git_session_id')
    if not session_id:
        return None
    
    return session_manager.get_git_credentials(session_id)

def require_auth(request: Request) -> dict:
    """Require authentication and return user credentials"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Git authentication required")
    return user

def get_user_credentials(request: Request, db: Session) -> Optional[dict]:
    """Get user credentials - tries session first, falls back to database"""
    # Try session-based auth first
    session_user = get_session_user(request)
    if session_user:
        return session_user
    
    # Fallback to database (for compatibility during transition)
    db_user = db.query(User).order_by(User.created_at.desc()).first()
    if not db_user:
        return None
        
    try:
        decrypted_token = git_service.decrypt_token(db_user.git_access_token)
        return {
            'platform': db_user.git_platform,
            'username': db_user.git_username,
            'access_token': decrypted_token,
            'server_url': db_user.git_server_url,
            'created_at': db_user.created_at
        }
    except Exception:
        return None

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
        description=project.description,
        llamastack_url=project.llamastackUrl,
        provider_id=project.providerId,
        git_repo_url=project.gitRepoUrl,
        test_backend_url=project.testBackendUrl
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # If git repo URL is provided, create initial PR
    if project.gitRepoUrl:
        # Get current user (for now, just get the first user - in production you'd get from session)
        user = db.query(User).order_by(User.created_at.desc()).first()
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
    if project_update.description is not None:
        project.description = project_update.description
    if project_update.llamastackUrl is not None:
        project.llamastack_url = project_update.llamastackUrl
    if project_update.providerId is not None:
        project.provider_id = project_update.providerId
    if project_update.gitRepoUrl is not None:
        project.git_repo_url = project_update.gitRepoUrl
    if project_update.testBackendUrl is not None:
        project.test_backend_url = project_update.testBackendUrl
    
    db.commit()
    db.refresh(project)
    return project

@app.delete("/api/projects/{project_id}", tags=["Projects"])
async def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete all associated data first (cascade delete)
    db.query(PromptHistory).filter(PromptHistory.project_id == project_id).delete()
    db.query(BackendTestHistory).filter(BackendTestHistory.project_id == project_id).delete()
    db.query(GitCommitCache).filter(GitCommitCache.project_id == project_id).delete()
    db.query(PendingPR).filter(PendingPR.project_id == project_id).delete()
    
    # Delete the project
    db.delete(project)
    db.commit()
    
    return {"message": "Project deleted successfully"}

# Prompt history endpoints
@app.get("/api/projects/{project_id}/history", response_model=List[PromptHistoryResponse], tags=["History"])
async def get_prompt_history(project_id: int, request: Request, db: Session = Depends(get_db)):
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = []
    
    # Add current prod/test entries from git if project has git repo
    # Rate limit git access to prevent excessive API calls during backend testing
    if project.git_repo_url:
        user = get_user_credentials(request, db)
        if user:
            try:
                # Check if we've accessed git recently (within last 10 seconds)
                last_history_entry = db.query(PromptHistory).filter(
                    PromptHistory.project_id == project_id
                ).order_by(PromptHistory.created_at.desc()).first()
                
                recent_access = (
                    last_history_entry is not None and
                    (datetime.now() - last_history_entry.created_at).total_seconds() < 10
                )
                
                if not recent_access:
                    token = user['access_token']
                    
                    # NOTE: Removed duplicate prod/test cards creation logic
                    # The System Status section in the frontend now handles 
                    # displaying current prod/test status more elegantly
                    
            except Exception as e:
                print(f"Failed to decrypt token or access git: {e}")
    
    # Get regular history from database - keep in natural chronological order
    # DO NOT sort by is_prod status - prompts should remain in their natural creation order
    history = db.query(PromptHistory).filter(
        PromptHistory.project_id == project_id
    ).order_by(PromptHistory.created_at.desc()).all()
    
    # Parse variables JSON and check for merged PRs
    for item in history:
        if item.variables:
            try:
                item.variables = json.loads(item.variables)
            except:
                item.variables = None
        
        # Check if this prompt has a merged PR
        merged_pr = db.query(PendingPR).filter(
            PendingPR.prompt_history_id == item.id,
            PendingPR.is_merged == True
        ).first()
        
        # Create response with merged PR info
        response_item = PromptHistoryResponse(
            id=item.id,
            project_id=item.project_id,
            user_prompt=item.user_prompt,
            system_prompt=item.system_prompt,
            variables=item.variables,
            temperature=item.temperature,
            max_len=item.max_len,
            top_p=item.top_p,
            top_k=item.top_k,
            response=item.response,
            backend_response=None,  # This field exists in schema but not in PromptHistory model
            rating=item.rating,
            notes=item.notes,
            is_prod=item.is_prod,
            has_merged_pr=merged_pr is not None,
            created_at=item.created_at
        )
        result.append(response_item)
    
    return result

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
            # Also clear test tag from all backend tests in this project
            db.query(BackendTestHistory).filter(
                BackendTestHistory.project_id == project_id
            ).update({"is_test": False})
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

# Backend test history endpoints
@app.get("/api/projects/{project_id}/backend-history", response_model=List[BackendTestHistoryResponse], tags=["Backend Testing"])
async def get_backend_test_history(project_id: int, db: Session = Depends(get_db)):
    """Get backend test history for a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    history = db.query(BackendTestHistory).filter(
        BackendTestHistory.project_id == project_id
    ).order_by(BackendTestHistory.created_at.desc()).all()
    
    return history

@app.put("/api/projects/{project_id}/backend-history/{history_id}", response_model=BackendTestHistoryResponse, tags=["Backend Testing"])
async def update_backend_test_history(
    project_id: int,
    history_id: int,
    request: BackendTestHistoryUpdate,
    db: Session = Depends(get_db)
):
    """Update backend test history item (e.g., mark as test)."""
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get backend test history item
    history_item = db.query(BackendTestHistory).filter(
        BackendTestHistory.id == history_id,
        BackendTestHistory.project_id == project_id
    ).first()
    
    if not history_item:
        raise HTTPException(status_code=404, detail="Backend test history item not found")
    
    # Update fields
    if request.is_test is not None:
        # If setting as test, remove test status from other backend tests in the same project
        if request.is_test:
            db.query(BackendTestHistory).filter(
                BackendTestHistory.project_id == project_id,
                BackendTestHistory.id != history_id
            ).update({"is_test": False})
            # Also clear test tag from all prompts in this project
            db.query(PromptHistory).filter(
                PromptHistory.project_id == project_id
            ).update({"is_prod": False})
        history_item.is_test = request.is_test
    
    if request.rating is not None:
        history_item.rating = request.rating
    
    if request.notes is not None:
        history_item.notes = request.notes
    
    db.commit()
    db.refresh(history_item)
    
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
            
            # Send initial message to confirm streaming started
            chunk = f"data: {json.dumps({'delta': '', 'status': 'started'})}\n\n"
            q.put(chunk)
            
            for r in response:
                print(f"Received response chunk: {type(r)} - {r}")
                if hasattr(r, 'event') and hasattr(r.event, 'delta') and hasattr(r.event.delta, 'text'):
                    chunk_text = r.event.delta.text
                    print(f"Text chunk: {chunk_text}")
                    full_response += chunk_text
                    chunk = f"data: {json.dumps({'delta': chunk_text})}\n\n"
                    q.put(chunk)
                elif hasattr(r, 'event') and hasattr(r.event, 'delta') and hasattr(r.event.delta, 'content'):
                    chunk_text = r.event.delta.content
                    print(f"Content chunk: {chunk_text}")
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
    
    return StreamingResponse(
        streamer(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Backend testing endpoint
@app.post("/api/projects/{project_id}/test-backend", tags=["Backend Testing"])
async def test_backend(
    project_id: int,
    request: BackendTestRequest,
    db: Session = Depends(get_db)
):
    """Test a user prompt against the project's configured backend URL."""
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.test_backend_url:
        raise HTTPException(status_code=400, detail="No test backend URL configured for this project")
    
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    user_prompt = request.prompt
    
    # Create queue for streaming
    q = queue.Queue()
    full_response = ""
    response_time_ms = None
    status_code = None
    error_message = None
    
    def worker():
        nonlocal full_response, response_time_ms, status_code, error_message
        try:
            import requests
            import time
            
            # Send request to backend with timing
            start_time = time.time()
            backend_response = requests.post(
                project.test_backend_url,
                json={"prompt": user_prompt},
                stream=True,
                timeout=30
            )
            response_time_ms = int((time.time() - start_time) * 1000)
            status_code = backend_response.status_code
            
            if not backend_response.ok:
                error_msg = f"Backend returned {backend_response.status_code}: {backend_response.text}"
                error_chunk = f"data: {json.dumps({'error': error_msg})}\n\n"
                q.put(error_chunk)
                return
            
            # Send initial message to confirm streaming started
            chunk = f"data: {json.dumps({'delta': '', 'status': 'started'})}\n\n"
            q.put(chunk)
            
            # Handle streaming response
            for line in backend_response.iter_lines():
                if line:
                    line_text = line.decode('utf-8')
                    if line_text.startswith('data: '):
                        try:
                            data = json.loads(line_text[6:])
                            if data.get('delta'):
                                full_response += data['delta']
                                chunk = f"data: {json.dumps({'delta': data['delta']})}\n\n"
                                q.put(chunk)
                            elif data.get('done'):
                                break
                        except json.JSONDecodeError:
                            # Handle non-JSON responses
                            full_response += line_text
                            chunk = f"data: {json.dumps({'delta': line_text})}\n\n"
                            q.put(chunk)
                    else:
                        # Handle non-SSE responses
                        full_response += line_text
                        chunk = f"data: {json.dumps({'delta': line_text})}\n\n"
                        q.put(chunk)
                        
        except requests.exceptions.Timeout:
            error_message = 'Backend request timed out after 30 seconds'
            error_chunk = f"data: {json.dumps({'error': error_message})}\n\n"
            q.put(error_chunk)
        except requests.exceptions.ConnectionError:
            error_message = 'Could not connect to backend URL'
            error_chunk = f"data: {json.dumps({'error': error_message})}\n\n"
            q.put(error_chunk)
        except Exception as e:
            error_message = f'Backend test failed: {str(e)}'
            error_chunk = f"data: {json.dumps({'error': error_message})}\n\n"
            q.put(error_chunk)
        finally:
            # Save backend test to separate table
            try:
                db_backend_test = BackendTestHistory(
                    project_id=project_id,
                    user_prompt=user_prompt,
                    system_prompt=request.systemPrompt,
                    variables=json.dumps(request.variables) if request.variables else None,
                    temperature=request.temperature,
                    max_len=request.maxLen,
                    top_p=request.topP,
                    top_k=request.topK,
                    backend_response=full_response,
                    response_time_ms=response_time_ms,
                    status_code=status_code,
                    error_message=error_message
                )
                db.add(db_backend_test)
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
    
    return StreamingResponse(
        streamer(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Evaluation endpoint
@app.post("/api/projects/{project_id}/eval", response_model=EvalResponse, tags=["Backend Testing"])
async def run_evaluation(
    project_id: int,
    request: EvalRequest,
    db: Session = Depends(get_db)
):
    """Run evaluation against a dataset using LlamaStack scoring."""
    import yaml
    
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    logger.info(f"Starting evaluation for project {project_id}")
    logger.info(f"Request data: dataset={request.dataset}, backend_url={request.backend_url}")
    
    # Debug the request object
    try:
        logger.info(f"Request type: {type(request)}")
        logger.info(f"Request dict: {request.dict()}")
        logger.info(f"Eval config type: {type(request.eval_config)}")
        logger.info(f"Eval config: {request.eval_config}")
    except Exception as e:
        logger.error(f"Error logging request details: {str(e)}")
    
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        logger.error(f"Project {project_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")
    
    logger.info(f"Project found: {project.name}, llamastack_url={project.llamastack_url}")
    
    if not project.llamastack_url:
        logger.error("No LlamaStack URL configured")
        raise HTTPException(status_code=400, detail="No LlamaStack URL configured for this project")
        
    if not request.backend_url:
        logger.error("Backend URL is required")
        raise HTTPException(status_code=400, detail="Backend URL is required")
    
    try:
        logger.info("Initializing LlamaStack client...")
        # Initialize LlamaStack client
        lls_client = LlamaStackClient(
            base_url=project.llamastack_url,
            timeout=600.0
        )
        logger.info("LlamaStack client initialized successfully")
        
        # For now, use the test data from eval_config
        # TODO: In the future, load actual dataset from HuggingFace
        logger.info("Extracting tests from eval_config...")
        tests = request.eval_config.get("tests", [])
        logger.info(f"Found {len(tests)} tests in eval_config")
        
        if not tests:
            logger.error("No tests found in eval config")
            raise HTTPException(status_code=400, detail="No tests found in eval config")
        
        # Function to send request to backend
        def send_request_to_backend(prompt, backend_url):
            full_response = ""
            
            try:
                logger.info(f"Sending prompt to backend: {prompt[:100]}...")
                # Process template variables
                processed_prompt = process_template_variables(prompt, request.variables or {})
                
                # Use the same simple payload format as the working backend test endpoint
                payload = {"prompt": processed_prompt}
                
                logger.info(f"Payload: {payload}")
                logger.info(f"Backend URL: {backend_url}")
                
                # Send request to backend with timing (same as working backend test)
                start_time = time.time()
                backend_response = requests.post(
                    backend_url,
                    json=payload,
                    stream=True,
                    timeout=30
                )
                response_time_ms = int((time.time() - start_time) * 1000)
                logger.info(f"Backend response status: {backend_response.status_code}, time: {response_time_ms}ms")
                
                if not backend_response.ok:
                    error_msg = f"Backend returned {backend_response.status_code}: {backend_response.text}"
                    logger.error(error_msg)
                    return f"Error: {error_msg}"
                
                # Handle streaming response (same as working backend test)
                for line in backend_response.iter_lines():
                    if line:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            try:
                                data = json.loads(line_text[6:])
                                if data.get('delta'):
                                    full_response += data['delta']
                            except json.JSONDecodeError:
                                continue
                
                logger.info(f"Full response length: {len(full_response)}")
                return full_response
                            
            except Exception as e:
                logger.error(f"Error in send_request_to_backend: {str(e)}")
                return f"Error: {str(e)}"
        
        # Create eval_rows by running tests through backend
        logger.info("Starting to run tests through backend...")
        eval_rows = []
        for i, test in enumerate(tests):
            logger.info(f"Processing test {i+1}/{len(tests)}")
            prompt = test.get("prompt", "")
            expected_result = test.get("expected_result", "")
            
            logger.info(f"Test {i+1}: prompt='{prompt}', expected='{expected_result}'")
            
            generated_answer = send_request_to_backend(prompt, request.backend_url)
            logger.info(f"Test {i+1}: generated_answer='{generated_answer[:100]}...'")
            
            eval_rows.append({
                "input_query": prompt,
                "generated_answer": generated_answer,
                "expected_answer": expected_result,
            })
        
        logger.info(f"Created {len(eval_rows)} eval rows")
        
        # Get scoring params from eval_config
        logger.info("Processing scoring params...")
        scoring_params = request.eval_config.get("scoring_params", {})
        logger.info(f"Original scoring_params: {scoring_params}")
        
        # Replace template variables in scoring params
        if "llm-as-judge::base" in scoring_params:
            judge_config = scoring_params["llm-as-judge::base"]
            if "judge_model" in judge_config:
                judge_config["judge_model"] = project.provider_id
                logger.info(f"Set judge_model to: {project.provider_id}")
            if "prompt_template" in judge_config:
                judge_config["prompt_template"] = request.eval_config.get("judge_prompt", judge_config["prompt_template"])
                logger.info(f"Set prompt_template to: {judge_config['prompt_template'][:100]}...")
        
        logger.info(f"Final scoring_params: {scoring_params}")
        
        # Run scoring through LlamaStack
        try:
            logger.info("Sending scoring request to LlamaStack...")
            logger.info(f"Input rows for scoring: {eval_rows}")
            logger.info(f"Scoring functions: {scoring_params}")
            
            scoring_response = lls_client.scoring.score(
                input_rows=eval_rows,
                scoring_functions=scoring_params
            )
            logger.info("Received scoring response from LlamaStack")
            logger.info(f"Scoring response type: {type(scoring_response)}")
            logger.info(f"Scoring response: {scoring_response}")
            
            # Log detailed response structure
            if hasattr(scoring_response, 'results'):
                logger.info(f"Scoring response results keys: {list(scoring_response.results.keys())}")
                for func_name, result in scoring_response.results.items():
                    logger.info(f"Function {func_name}:")
                    logger.info(f"  Result type: {type(result)}")
                    logger.info(f"  Result attributes: {dir(result)}")
                    if hasattr(result, 'score_rows'):
                        logger.info(f"  Score rows: {result.score_rows}")
                        if result.score_rows:
                            logger.info(f"  First score row: {result.score_rows[0]}")
                            logger.info(f"  First score row keys: {list(result.score_rows[0].keys())}")
                    if hasattr(result, 'aggregated_results'):
                        logger.info(f"  Aggregated results: {result.aggregated_results}")
            else:
                logger.info("No results attribute found in scoring response")
            
            # Process results from all scoring functions
            results = []
            total_score = 0
            scored_count = 0
            all_scoring_results = {}
            
            logger.info(f"Processing {len(scoring_response.results)} scoring functions")
            
            # Process all scoring functions
            if scoring_response.results:
                # First, collect all scoring results for each test
                for scoring_function_name, result in scoring_response.results.items():
                    logger.info(f"Processing scoring function: {scoring_function_name}")
                    all_scoring_results[scoring_function_name] = {
                        "aggregated_results": getattr(result, 'aggregated_results', None),
                        "score_rows": getattr(result, 'score_rows', [])
                    }
                
                # Create results by combining all scoring functions per test
                for i, eval_row in enumerate(eval_rows):
                    test_scoring_results = {}
                    primary_score = None
                    
                    # Collect results from all scoring functions for this test
                    for scoring_function_name, result in scoring_response.results.items():
                        if hasattr(result, 'score_rows') and result.score_rows and i < len(result.score_rows):
                            score_row = result.score_rows[i]
                            test_scoring_results[scoring_function_name] = {
                                "score": score_row.get('score', 'Unknown'),
                                "explanation": score_row.get('explanation', ''),
                                "judge_feedback": score_row.get('judge_feedback', ''),
                                "raw_data": score_row  # Include all raw data
                            }
                            
                            # Use the first scoring function's score as primary for averaging
                            if primary_score is None:
                                primary_score = score_row.get('score', 'Unknown')
                    
                    # Try to extract numeric score for averaging (using primary score)
                    if primary_score is not None:
                        try:
                            if isinstance(primary_score, str) and primary_score in ['A', 'B', 'C', 'D', 'E']:
                                # Convert A-E to numeric score
                                numeric_score = {'A': 1, 'B': 0.75, 'C': 0.5, 'D': 0.25, 'E': 0}[primary_score]
                                total_score += numeric_score
                                scored_count += 1
                            elif isinstance(primary_score, (int, float)):
                                total_score += float(primary_score)
                                scored_count += 1
                        except:
                            pass
                    
                    results.append(EvalTestResult(
                        input_query=eval_row["input_query"],
                        generated_answer=eval_row["generated_answer"],
                        expected_answer=eval_row["expected_answer"],
                        scoring_results=test_scoring_results
                    ))
                
                # Calculate average score
                avg_score = total_score / scored_count if scored_count > 0 else None
                
                # Get summary from aggregated results if available (combine all functions)
                summary = {}
                for scoring_function_name, result in scoring_response.results.items():
                    if hasattr(result, 'aggregated_results') and result.aggregated_results:
                        summary[scoring_function_name] = result.aggregated_results
                
                logger.info(f"Processed {len(results)} test results with {len(all_scoring_results)} scoring functions")
                
                return EvalResponse(
                    results=results,
                    summary=summary if summary else None,
                    total_tests=len(eval_rows),
                    avg_score=avg_score,
                    status="completed",
                    scoring_functions=all_scoring_results
                )
            else:
                return EvalResponse(
                    results=[],
                    summary=None,
                    total_tests=0,
                    avg_score=None,
                    status="failed"
                )
                
        except Exception as e:
            logger.error(f"LlamaStack scoring error: {str(e)}")
            logger.error(f"Error type: {type(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            # Check for specific LlamaStack scoring endpoint not available error
            if isinstance(e, LlamaStackNotFoundError) or ("NotFoundError" in str(type(e)) and "404" in str(e)):
                raise HTTPException(
                    status_code=400, 
                    detail="LlamaStack scoring endpoint not available. The scoring service is not enabled on your LlamaStack server. Please enable the scoring service or use a different LlamaStack server that supports evaluation."
                )
            
            raise HTTPException(status_code=500, detail=f"LlamaStack scoring error: {str(e)}")
    
    except Exception as e:
        logger.error(f"General evaluation error: {str(e)}")
        logger.error(f"Error type: {type(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Evaluation error: {str(e)}")


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
          "name": "document-summarizer",
          "provider_id": "llama-3.1-8b-instruct",
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
    - `project_name`: The name of the project (e.g., "document-summarizer")
    - `provider_id`: The model provider ID (e.g., "llama-3.1-8b-instruct")
    
    **Example Request:**
    ```
    GET /prompt/document-summarizer/llama-3.1-8b-instruct/prod
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
        user = db.query(User).order_by(User.created_at.desc()).first()
        if user:
            try:
                token = git_service.decrypt_token(user.git_access_token)
                prod_prompt_result = git_service.get_prod_prompt_from_git(
                    user.git_platform,
                    token,
                    project.git_repo_url,
                    project.name,
                    project.provider_id
                )
                
                if prod_prompt_result:
                    prod_prompt = prod_prompt_result['prompt_data']
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
    - `project_name`: The name of the project (e.g., "document-summarizer")
    - `provider_id`: The model provider ID (e.g., "llama-3.1-8b-instruct")
    
    **Example Request:**
    ```
    GET /prompt/document-summarizer/llama-3.1-8b-instruct
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
async def authenticate_git(auth_request: GitAuthRequest, response: Response, db: Session = Depends(get_db)):
    """Authenticate with git platform and store credentials in session"""
    # Validate required fields for each platform
    if auth_request.platform == 'gitea' and not auth_request.server_url:
        raise HTTPException(status_code=400, detail="Server URL is required for Gitea")
    
    # Test the credentials first
    test_repo = None
    if auth_request.platform == 'github':
        test_repo = "https://github.com/octocat/Hello-World"  # Public repo for testing
    elif auth_request.platform == 'gitlab':
        # For GitLab, we'll use a dummy repo URL since test_git_access will use the user endpoint
        test_repo = "https://gitlab.com/dummy/repo"  # Won't be used, just needed for function call
    elif auth_request.platform == 'gitea' and auth_request.server_url:
        # For Gitea, we'll use a dummy repo URL since test_git_access will use the user endpoint
        test_repo = f"{auth_request.server_url}/dummy/repo"  # Won't be used, just needed for function call
    
    # Always test credentials if we have the required information
    if test_repo and not git_service.test_git_access(auth_request.platform, auth_request.username, auth_request.access_token, test_repo, auth_request.server_url):
        raise HTTPException(status_code=401, detail="Invalid git credentials or insufficient permissions")
    
    # Create session with git credentials
    git_data = {
        'platform': auth_request.platform,
        'username': auth_request.username,
        'access_token': auth_request.access_token,
        'server_url': auth_request.server_url
    }
    
    session_id = session_manager.create_session(git_data)
    
    # Set session cookie (no expiration - lasts for backend lifetime)
    response.set_cookie(
        key="git_session_id",
        value=session_id,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax"
        # No max_age - cookie persists until backend restart or manual logout
    )
    
    # Trigger initial sync for all projects with git repos
    print("Triggering initial git sync for all projects...")
    projects_with_git = db.query(Project).filter(Project.git_repo_url.isnot(None)).all()
    
    user_creds = session_manager.get_git_credentials(session_id)
    for project in projects_with_git:
        try:
            print(f"Initial sync for project {project.id}: {project.name}")
            await sync_git_commits_for_project(project.id, db, user_creds)
        except Exception as e:
            print(f"Failed initial sync for project {project.id}: {e}")
            # Continue with other projects even if one fails
    
    print(f"Initial git sync completed for {len(projects_with_git)} projects")
    
    # Return user-like response for compatibility
    return {
        "id": 1,  # Dummy ID for compatibility
        "git_platform": auth_request.platform,
        "git_username": auth_request.username,
        "git_server_url": auth_request.server_url,
        "created_at": datetime.now()
    }

@app.post("/api/git/sync-all", tags=["Git"])
async def sync_all_git_projects(request: Request, db: Session = Depends(get_db)):
    """Manually trigger sync for all projects with git repos"""
    user = get_user_credentials(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Git authentication required")
    
    projects_with_git = db.query(Project).filter(Project.git_repo_url.isnot(None)).all()
    
    sync_results = []
    for project in projects_with_git:
        try:
            print(f"Manual sync for project {project.id}: {project.name}")
            await sync_git_commits_for_project(project.id, db, user)
            sync_results.append({"project_id": project.id, "status": "success"})
        except Exception as e:
            print(f"Failed manual sync for project {project.id}: {e}")
            sync_results.append({"project_id": project.id, "status": "failed", "error": str(e)})
    
    return {
        "message": f"Sync completed for {len(projects_with_git)} projects",
        "results": sync_results
    }

@app.get("/api/git/user", response_model=UserResponse, tags=["Git"])
async def get_current_git_user(request: Request):
    """Get current authenticated git user"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
    return {
        "id": 1,  # Dummy ID for compatibility
        "git_platform": user['platform'],
        "git_username": user['username'],
        "git_server_url": user['server_url'],
        "created_at": user['created_at']
    }

@app.get("/api/git/auth-status", tags=["Git"])
async def get_git_auth_status(request: Request):
    """Check if git authentication is still valid"""
    user = get_session_user(request)
    if not user:
        return {
            "authenticated": False,
            "user": None,
            "platform": None,
            "last_used": None
        }
    
    # Test if the authentication is still valid
    try:
        is_valid = git_service.test_git_access(
            user['platform'],
            user['username'],
            user['access_token'],
            "https://github.com/test/test",  # dummy repo for testing
            user['server_url']
        )
        
        return {
            "authenticated": is_valid,
            "user": {
                "username": user['username'],
                "platform": user['platform'],
                "server_url": user['server_url']
            },
            "platform": user['platform'],
            "last_used": user['created_at'].isoformat()
        }
    except Exception as e:
        return {
            "authenticated": False,
            "user": {
                "username": user['username'],
                "platform": user['platform'],
                "server_url": user['server_url']
            },
            "platform": user['platform'],
            "last_used": user['created_at'].isoformat(),
            "error": str(e)
        }

@app.get("/api/git/quick-status", tags=["Git"])
async def get_quick_git_status(request: Request):
    """Get quick git authentication status (optimized for frequent calls)"""
    session_id = request.cookies.get('git_session_id')
    if not session_id or not session_manager.is_authenticated(session_id):
        return {
            "authenticated": False,
            "user": None,
            "platform": None,
            "cached": False
        }
    
    user = session_manager.get_git_credentials(session_id)
    if not user:
        return {
            "authenticated": False,
            "user": None,
            "platform": None,
            "cached": False
        }
    
    return {
        "authenticated": True,
        "user": {
            "username": user['username'],
            "platform": user['platform'],
            "server_url": user['server_url']
        },
        "platform": user['platform'],
        "last_used": user['created_at'].isoformat(),
        "cached": True  # Session-based auth is inherently cached
    }

@app.post("/api/git/logout", tags=["Git"])
async def logout_git(request: Request, response: Response):
    """Logout and clear git authentication session"""
    session_id = request.cookies.get('git_session_id')
    if session_id:
        session_manager.delete_session(session_id)
    
    response.delete_cookie(key="git_session_id")
    return {"message": "Successfully logged out"}

@app.post("/api/projects/{project_id}/git/test-access", tags=["Git"])
async def test_git_repo_access(project_id: int, request: Request, db: Session = Depends(get_db)):
    """Test if current user has access to project's git repository"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    user_creds = get_user_credentials(request, db)
    if not user_creds:
        raise HTTPException(status_code=401, detail="Git authentication required")
    
    try:
        has_access = git_service.test_git_access(
            user_creds['platform'], 
            user_creds['username'], 
            user_creds['access_token'], 
            project.git_repo_url
        )
        
        if not has_access:
            raise HTTPException(status_code=403, detail="No access to git repository")
        
        return {"message": "Git repository access confirmed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to test git access: {str(e)}")

@app.post("/api/projects/{project_id}/history/{history_id}/tag-prod", tags=["Git"])
async def tag_prompt_as_prod(
    project_id: int,
    history_id: int,
    request: Request,
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
    
    # Get current user credentials from session or database
    user_creds = get_user_credentials(request, db)
    if not user_creds:
        raise HTTPException(status_code=401, detail="Git authentication required")
    
    try:
        # All platforms now support PR creation
        print(f"Creating production PR for platform: {user_creds['platform']}")
        
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
        pr_result = git_service.create_prompt_pr(
            user_creds['platform'],
            user_creds['access_token'],
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
        error_msg = str(e)
        # Handle empty repository error specifically
        if "EMPTY_REPOSITORY:" in error_msg:
            cleaned_msg = error_msg.replace("EMPTY_REPOSITORY: ", "")
            raise HTTPException(status_code=400, detail=cleaned_msg)
        raise HTTPException(status_code=500, detail=f"Failed to create production PR: {error_msg}")

@app.post("/api/projects/{project_id}/backend-history/{history_id}/tag-test", tags=["Git"])
async def tag_backend_test_as_test(
    project_id: int,
    history_id: int,
    db: Session = Depends(get_db)
):
    """Tag a backend test as test - creates git commit instead of direct database update"""
    print(f"🔍 tag_backend_test_as_test called with project_id={project_id}, history_id={history_id}")
    
    # Get project and history
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        print(f"❌ Project {project_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"✅ Found project: {project.name}")
    
    history_item = db.query(BackendTestHistory).filter(
        BackendTestHistory.id == history_id,
        BackendTestHistory.project_id == project_id
    ).first()
    if not history_item:
        print(f"❌ Backend test history item {history_id} not found for project {project_id}")
        # Let's check what backend test items exist
        all_items = db.query(BackendTestHistory).filter(BackendTestHistory.project_id == project_id).all()
        print(f"Available backend test items for project {project_id}: {[item.id for item in all_items]}")
        raise HTTPException(status_code=404, detail="Backend test history item not found")
    
    print(f"✅ Found backend test history item: {history_item.id}")
    
    # Check if project has git repo
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    # Get current user (most recently authenticated)
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
    try:
        # Prepare test prompt data
        variables = None
        if history_item.variables:
            try:
                variables = json.loads(history_item.variables)
            except:
                variables = None
        
        test_data = TestPromptData(
            user_prompt=history_item.user_prompt,
            system_prompt=history_item.system_prompt,
            temperature=history_item.temperature,
            max_len=history_item.max_len,
            top_p=history_item.top_p,
            top_k=history_item.top_k,
            variables=variables,
            created_at=history_item.created_at.isoformat()
        )
        
        # Create test settings file in git (similar to Save Settings functionality)
        try:
            token = git_service.decrypt_token(user.git_access_token)
        except Exception as decrypt_error:
            print(f"❌ Failed to decrypt git token: {decrypt_error}")
            raise HTTPException(status_code=401, detail="Git authentication expired or invalid. Please re-authenticate with git.")
        
        # Convert test data to settings format
        settings_data = {
            "user_prompt": test_data.user_prompt,
            "system_prompt": test_data.system_prompt,
            "variables": test_data.variables,
            "temperature": test_data.temperature,
            "max_len": test_data.max_len,
            "top_p": test_data.top_p,
            "top_k": test_data.top_k,
            "created_at": test_data.created_at  # Already a string from isoformat()
        }
        
        # Save test settings to git
        result = git_service.save_test_settings_to_git(
            user.git_platform,
            token,
            project.git_repo_url,
            project.name,
            project.provider_id,
            settings_data
        )
        
        if not result:
            raise HTTPException(status_code=500, detail="Failed to save test settings to git")
        
        # Update database to mark as test
        # First, clear test tag from all other backend tests in this project
        db.query(BackendTestHistory).filter(
            BackendTestHistory.project_id == project_id,
            BackendTestHistory.id != history_id
        ).update({"is_test": False})
        
        # Also clear test tag from all prompts in this project
        db.query(PromptHistory).filter(
            PromptHistory.project_id == project_id
        ).update({"is_prod": False})
        
        # Then mark this backend test as test
        history_item.is_test = True
        db.commit()
        
        return {
            "message": "Test settings saved to git successfully",
            "commit_sha": result.get('commit_sha'),
            "commit_url": result.get('commit_url')
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ tag_backend_test_as_test error: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save test settings: {error_msg}")

@app.post("/api/projects/{project_id}/backend-history/{history_id}/tag-prod", tags=["Git"])
async def tag_backend_test_as_prod(
    project_id: int,
    history_id: int,
    db: Session = Depends(get_db)
):
    """Tag a backend test as production - creates PR for production deployment"""
    print(f"🔍 tag_backend_test_as_prod called with project_id={project_id}, history_id={history_id}")
    
    # Get project and history
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        print(f"❌ Project {project_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"✅ Found project: {project.name}")
    
    history_item = db.query(BackendTestHistory).filter(
        BackendTestHistory.id == history_id,
        BackendTestHistory.project_id == project_id
    ).first()
    if not history_item:
        print(f"❌ Backend test history item {history_id} not found for project {project_id}")
        raise HTTPException(status_code=404, detail="Backend test history item not found")
    
    print(f"✅ Found backend test history item: {history_item.id}")
    
    # Check if project has git repo
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    # Get current user (most recently authenticated)
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
    try:
        # Prepare prompt data for production
        variables = None
        if history_item.variables:
            try:
                variables = json.loads(history_item.variables)
            except:
                variables = None
        
        prod_data = ProdPromptData(
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
        try:
            token = git_service.decrypt_token(user.git_access_token)
        except Exception as decrypt_error:
            print(f"❌ Failed to decrypt git token: {decrypt_error}")
            raise HTTPException(status_code=401, detail="Git authentication expired or invalid. Please re-authenticate with git.")
        
        pr_result = git_service.create_prompt_pr(
            user.git_platform,
            token,
            project.git_repo_url,
            project.name,
            project.provider_id,
            prod_data
        )
        
        if not pr_result:
            raise HTTPException(status_code=500, detail="Failed to create production PR")
        
        return {
            "message": "Production PR created successfully",
            "pr_url": pr_result.get('pr_url'),
            "pr_number": pr_result.get('pr_number')
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ tag_backend_test_as_prod error: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create production PR: {error_msg}")

@app.post("/api/projects/{project_id}/history/{history_id}/tag-test", tags=["Git"])
async def tag_prompt_as_test(
    project_id: int,
    history_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Tag a prompt as test - creates git commit instead of direct database update"""
    print(f"🔍 tag_prompt_as_test called with project_id={project_id}, history_id={history_id}")
    
    # Get project and history
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        print(f"❌ tag_prompt_as_test: Project {project_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"🔍 tag_prompt_as_test: Found project: {project.name}")
    
    # Check what history items exist for this project
    all_history = db.query(PromptHistory).filter(PromptHistory.project_id == project_id).all()
    print(f"🔍 tag_prompt_as_test: Found {len(all_history)} history items for project {project_id}")
    for h in all_history:
        print(f"🔍 tag_prompt_as_test: History ID={h.id}, user_prompt='{h.user_prompt[:50]}...'")
    
    history_item = db.query(PromptHistory).filter(
        PromptHistory.id == history_id,
        PromptHistory.project_id == project_id
    ).first()
    if not history_item:
        print(f"❌ tag_prompt_as_test: History item {history_id} not found for project {project_id}")
        raise HTTPException(status_code=404, detail="History item not found")
    
    # Check if project has git repo
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    # Get current user credentials from session or database
    user_creds = get_user_credentials(request, db)
    if not user_creds:
        raise HTTPException(status_code=401, detail="Git authentication required")
    
    try:
        # Prepare test prompt data
        variables = None
        if history_item.variables:
            try:
                variables = json.loads(history_item.variables)
            except:
                variables = None
        
        # Convert prompt data to settings format
        settings_data = {
            "userPrompt": history_item.user_prompt,
            "systemPrompt": history_item.system_prompt,
            "variables": variables,
            "temperature": history_item.temperature,
            "maxLen": history_item.max_len,
            "topP": history_item.top_p,
            "topK": history_item.top_k,
            "created_at": history_item.created_at.isoformat()
        }
        
        print(f"🔍 tag_prompt_as_test: user platform={user_creds['platform']}")
        print(f"🔍 tag_prompt_as_test: repo_url={project.git_repo_url}")
        print(f"🔍 tag_prompt_as_test: project_name={project.name}")
        print(f"🔍 tag_prompt_as_test: settings_data={settings_data}")
        
        # Save test settings to git
        result = git_service.save_test_settings_to_git(
            user_creds['platform'],
            user_creds['access_token'],
            project.git_repo_url,
            project.name,
            project.provider_id,
            settings_data
        )
        
        if not result:
            raise HTTPException(status_code=500, detail="Failed to save test settings to git")
        
        # Update database to mark as test (using is_prod field since it's the same concept)
        # First, clear test tag from all other prompts in this project
        db.query(PromptHistory).filter(
            PromptHistory.project_id == project_id,
            PromptHistory.id != history_id
        ).update({"is_prod": False})
        
        # Also clear test tag from all backend tests in this project
        db.query(BackendTestHistory).filter(
            BackendTestHistory.project_id == project_id
        ).update({"is_test": False})
        
        # Then mark this prompt as test
        history_item.is_prod = True
        db.commit()
        
        return {
            "message": "Test settings saved to git successfully",
            "commit_sha": result.get('commit_sha'),
            "commit_url": result.get('commit_url')
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ tag_prompt_as_test error: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save test settings: {error_msg}")

@app.get("/api/projects/{project_id}/pending-prs", response_model=List[PendingPRResponse], tags=["Git"])
async def get_pending_prs(project_id: int, request: Request, db: Session = Depends(get_db)):
    """Get pending pull requests for a project - checks live status from git"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return []
    
    user = get_user_credentials(request, db)
    if not user:
        return []
    
    try:
        token = user['access_token']
        print(f"✅ Decrypted token successfully")
        
        # Get all PRs for this project from database
        all_prs = db.query(PendingPR).filter(
            PendingPR.project_id == project_id
        ).order_by(PendingPR.created_at.desc()).all()
        
        print(f"🔍 Found {len(all_prs)} PRs in database for project {project_id}")
        for pr in all_prs:
            print(f"   PR #{pr.pr_number}: {pr.pr_url}, is_merged: {pr.is_merged}, created_at: {pr.created_at}")
        
        # If no PRs in database, return empty list immediately
        if not all_prs:
            print("🔍 No PRs found in database, returning empty list")
            return []
        
        pending_prs = []
        for pr in all_prs:
            # Skip if already marked as merged
            if pr.is_merged:
                print(f"🔍 PR #{pr.pr_number} already marked as merged, skipping")
                continue
                
            print(f"🔍 Checking status for PR #{pr.pr_number} with platform: {user['platform']}")
            print(f"🔍 Repository URL: {project.git_repo_url}")
            print(f"🔍 User server URL: {user['server_url']}")
            
            # Check live status from git
            status = git_service.check_pr_status(
                user['platform'],
                token,
                project.git_repo_url,
                pr.pr_number
            )
            
            print(f"🔍 PR #{pr.pr_number} status returned: {status}")
            
            # If we couldn't get status (None), assume it's still open to be safe
            if status is None:
                print(f"⚠️  Could not check PR #{pr.pr_number} status, assuming it's still open")
                pending_prs.append(pr)
            # Only include if still open/pending
            elif status == 'open':
                print(f"✅ Including PR #{pr.pr_number} as pending")
                pending_prs.append(pr)
            # Update database status if changed
            elif status in ['merged', 'closed']:
                print(f"🔄 Marking PR #{pr.pr_number} as merged/closed in database")
                pr.is_merged = True
            else:
                print(f"🔍 PR #{pr.pr_number} excluded - status: {status}, is_merged: {pr.is_merged}")
        
        print(f"🔍 Final pending PRs list has {len(pending_prs)} items")
        for pr in pending_prs:
            print(f"   Final PR: #{pr.pr_number}, URL: {pr.pr_url}")
        
        db.commit()
        return pending_prs
        
    except Exception as e:
        print(f"❌ Failed to check pending PRs: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback: return all non-merged PRs if git checking fails
        try:
            print("🔄 Falling back to database-only check")
            fallback_prs = db.query(PendingPR).filter(
                PendingPR.project_id == project_id,
                PendingPR.is_merged == False
            ).order_by(PendingPR.created_at.desc()).all()
            
            print(f"📋 Returning {len(fallback_prs)} PRs from database fallback")
            return fallback_prs
        except Exception as fallback_error:
            print(f"❌ Fallback also failed: {fallback_error}")
            return []

@app.post("/api/projects/{project_id}/sync-prs", tags=["Git"])
async def sync_pr_status(project_id: int, request: Request, db: Session = Depends(get_db)):
    """Sync PR statuses and mark merged/closed PRs as resolved"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return {"message": "Project has no git repository configured"}
    
    user = get_user_credentials(request, db)
    if not user:
        return {"message": "No authenticated git user found"}
    
    try:
        token = user['access_token']
        pending_prs = db.query(PendingPR).filter(
            PendingPR.project_id == project_id,
            PendingPR.is_merged == False
        ).all()
        
        print(f"Found {len(pending_prs)} pending PRs to check")
        
        updated_count = 0
        for pr in pending_prs:
            print(f"Checking PR #{pr.pr_number} status...")
            # Force refresh to ensure we get fresh status (bypass cache)
            status = git_service.check_pr_status(
                user['platform'],
                token,
                project.git_repo_url,
                pr.pr_number,
                force_refresh=True
            )
            print(f"PR #{pr.pr_number} status: {status}")
            
            if status in ['merged', 'closed']:
                pr.is_merged = True
                updated_count += 1
                print(f"Marked PR #{pr.pr_number} as merged")
        
        # Update the last sync commit hash after successful sync
        try:
            current_commit = git_service.get_repository_head_commit(
                user['platform'], token, project.git_repo_url
            )
            if current_commit:
                project.last_git_sync_commit = current_commit
                print(f"Updated last sync commit to: {current_commit}")
        except Exception as commit_err:
            print(f"Failed to update sync commit hash: {commit_err}")
        
        db.commit()
        return {"message": f"Synced {updated_count} PR statuses"}
        
    except Exception as e:
        print(f"Sync PR error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to sync PR statuses: {str(e)}")

@app.get("/api/projects/{project_id}/git-changes", tags=["Git"])
async def check_git_changes(project_id: int, db: Session = Depends(get_db)):
    """Check if git repository has changes since last sync (lightweight check)"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return {"has_changes": False, "reason": "no_git_repo"}
    
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        return {"has_changes": False, "reason": "no_git_user"}
    
    try:
        token = git_service.decrypt_token(user.git_access_token)
        change_info = git_service.has_repository_changed(
            user.git_platform,
            token,
            project.git_repo_url,
            project.last_git_sync_commit
        )
        
        return {
            "has_changes": change_info.get("changed", False),
            "current_commit": change_info.get("current_commit"),
            "last_known_commit": change_info.get("last_known_commit"),
            "reason": change_info.get("reason"),
            "error": change_info.get("error")
        }
        
    except Exception as e:
        print(f"Git changes check error: {e}")
        return {"has_changes": False, "reason": "error", "error": str(e)}

@app.post("/api/projects/{project_id}/clear-pr-cache", tags=["Git"])
async def clear_pr_cache(project_id: int, db: Session = Depends(get_db)):
    """Clear PR status cache for a project (useful when PR statuses are stale)"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return {"message": "Project has no git repository configured"}
    
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        return {"message": "No authenticated git user found"}
    
    try:
        # Clear cache for all PRs in this repository
        git_service.invalidate_pr_cache_for_repo(user.git_platform, project.git_repo_url)
        return {"message": "PR cache cleared successfully"}
    except Exception as e:
        print(f"Failed to clear PR cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def sync_git_commits_for_project(project_id: int, db: Session, user_creds: dict) -> None:
    """Incrementally sync git commits for a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.git_repo_url:
        return
    
    try:
        print(f"🚀 Starting sync for project {project_id}")
        print(f"   Project name: {project.name}")
        print(f"   Provider ID: {project.provider_id}")
        print(f"   Git repo: {project.git_repo_url}")
        print(f"   User platform: {user_creds['platform']}")
        
        print(f"🔐 Using session token...")
        try:
            token = user_creds['access_token']
            print(f"🔐 Token decrypted successfully")
        except Exception as decrypt_error:
            print(f"❌ Token decryption failed: {decrypt_error}")
            print(f"❌ This usually means you need to re-authenticate with git")
            # Instead of raising error, just return empty - user needs to re-authenticate
            return
            
        file_path = f"{project.name}/{project.provider_id}/prompt_prod.json"
        
        print(f"   Looking for file: {file_path}")
        
        # Get latest commits from git
        print(f"🔍 Calling get_file_commit_history...")
        try:
            commits = git_service.get_file_commit_history(
                user_creds['platform'],
                token,
                project.git_repo_url,
                file_path,
                limit=50  # Get more commits to ensure we catch everything
            )
            print(f"🔍 Got {len(commits)} commits from git")
        except Exception as git_error:
            print(f"❌ Error in get_file_commit_history: {git_error}")
            import traceback
            traceback.print_exc()
            raise git_error
        
        # Get existing commit SHAs from database
        existing_shas = set()
        existing_commits = db.query(GitCommitCache).filter(
            GitCommitCache.project_id == project_id
        ).all()
        existing_shas = {commit.commit_sha for commit in existing_commits}
        
        print(f"Project {project_id}: Found {len(commits)} git commits, {len(existing_shas)} already cached")
        
        # Process only new commits
        new_commits_count = 0
        for commit in commits:
            if commit['sha'] not in existing_shas:
                # This is a new commit, fetch its content and cache it
                try:
                    prompt_data = git_service.get_file_content_at_commit(
                        user_creds['platform'],
                        token,
                        project.git_repo_url,
                        file_path,
                        commit['sha']
                    )
                    
                    if prompt_data:
                        # Store in cache
                        commit_date = datetime.fromisoformat(commit['date'].replace('Z', '+00:00'))
                        cached_commit = GitCommitCache(
                            project_id=project_id,
                            commit_sha=commit['sha'],
                            commit_message=commit['message'],
                            commit_date=commit_date,
                            author=commit['author'],
                            prompt_data=json.dumps({
                                'user_prompt': prompt_data.user_prompt,
                                'system_prompt': prompt_data.system_prompt,
                                'variables': prompt_data.variables,
                                'temperature': prompt_data.temperature,
                                'max_len': prompt_data.max_len,
                                'top_p': prompt_data.top_p,
                                'top_k': prompt_data.top_k,
                                'created_at': prompt_data.created_at
                            })
                        )
                        db.add(cached_commit)
                        new_commits_count += 1
                        
                except Exception as e:
                    print(f"Failed to cache commit {commit['sha']}: {e}")
                    continue
        
        if new_commits_count > 0:
            db.commit()
            print(f"Cached {new_commits_count} new commits for project {project_id}")
        else:
            print(f"No new commits to cache for project {project_id}")
            
    except Exception as e:
        print(f"❌ Failed to sync git commits for project {project_id}: {e}")
        print(f"❌ Exception type: {type(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()

@app.get("/api/projects/{project_id}/prod-history", response_model=List[PromptHistoryResponse], tags=["Git"])
async def get_prod_history_from_git(project_id: int, request: Request, db: Session = Depends(get_db)):
    """Get production prompt history from cached git commits with incremental sync"""
    print(f"📋 GET /api/projects/{project_id}/prod-history called")
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"📋 Project found: {project.name}, git_repo: {project.git_repo_url}")
    
    if not project.git_repo_url:
        print(f"📋 No git repo configured, returning empty history")
        return []  # No git repo, return empty history
    
    user = get_user_credentials(request, db)
    if not user:
        print(f"📋 No authenticated user found, returning empty history")
        return []  # No authenticated user, return empty history
    
    print(f"📋 User found: {user['username']}@{user['platform']}")
    
    try:
        # Token is already decrypted in session-based auth
        token = user['access_token']
        print(f"✅ Using session token for git operations")
        
        # First, sync any new commits (with rate limiting to prevent excessive syncing)
        # Check if we've synced recently (within last 30 seconds)
        last_commit = db.query(GitCommitCache).filter(
            GitCommitCache.project_id == project_id
        ).order_by(GitCommitCache.created_at.desc()).first()
        
        should_sync = (
            last_commit is None or 
            (datetime.now() - last_commit.created_at).total_seconds() > 30
        )
        
        if should_sync:
            await sync_git_commits_for_project(project_id, db, user)
        else:
            print(f"⏰ Skipping git sync for project {project_id} (synced recently)")
        
        # Then, get cached commits from database (much faster!)
        cached_commits = db.query(GitCommitCache).filter(
            GitCommitCache.project_id == project_id
        ).order_by(GitCommitCache.commit_date.desc()).limit(20).all()
        
        print(f"Retrieved {len(cached_commits)} cached commits for project {project_id}")
        
        history_items = []
        for i, cached_commit in enumerate(cached_commits):
            try:
                # Parse cached prompt data
                prompt_data_dict = json.loads(cached_commit.prompt_data)
                
                # Determine commit type from message
                commit_msg = cached_commit.commit_message
                if "🚀" in commit_msg or "Update production prompt" in commit_msg:
                    notes = f"🚀 PR merge: {commit_msg[:80]}{'...' if len(commit_msg) > 80 else ''}"
                elif "✨" in commit_msg or "Initialize project" in commit_msg:
                    notes = f"✨ Project setup: {commit_msg[:80]}{'...' if len(commit_msg) > 80 else ''}"
                else:
                    notes = f"📝 Direct commit: {commit_msg[:80]}{'...' if len(commit_msg) > 80 else ''}"
                
                # Add current badge to the most recent commit
                if i == 0:
                    notes = f"⚡ CURRENT - {notes}"
                
                commit_response = PromptHistoryResponse(
                    id=hash(cached_commit.commit_sha) % 100000,
                    project_id=project_id,
                    user_prompt=prompt_data_dict.get('user_prompt', ''),
                    system_prompt=prompt_data_dict.get('system_prompt', ''),
                    variables=prompt_data_dict.get('variables', {}),
                    temperature=prompt_data_dict.get('temperature', 0.7),
                    max_len=prompt_data_dict.get('max_len', 2048),
                    top_p=prompt_data_dict.get('top_p', 0.9),
                    top_k=prompt_data_dict.get('top_k', 50),
                    response=None,
                    rating=None,
                    notes=notes,
                    is_prod=True,
                    created_at=cached_commit.commit_date.isoformat()
                )
                history_items.append(commit_response)
                
            except Exception as e:
                print(f"Failed to process cached commit {cached_commit.commit_sha}: {e}")
                continue
        
        print(f"Successfully processed {len(history_items)} cached commits into history items")
        return history_items
            
    except Exception as e:
        print(f"Failed to get prod history from git: {e}")
        import traceback
        traceback.print_exc()
        return []

# Git History endpoint
@app.get("/api/projects/{project_id}/git-history", tags=["Git"])
async def get_git_history(project_id: int, db: Session = Depends(get_db)):
    """Get unified git history for both prod and test files"""
    print(f"📋 GET /api/projects/{project_id}/git-history called")
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"📋 Project found: {project.name}, git_repo: {project.git_repo_url}")
    
    if not project.git_repo_url:
        print(f"📋 No git repo configured, returning empty history")
        return []  # No git repo, return empty history
    
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        print(f"📋 No authenticated user found, returning empty history")
        return []  # No authenticated user, return empty history
    
    print(f"📋 User found: {user['username']}@{user['platform']}")
    
    try:
        # Test if the user's token can be decrypted
        try:
            token = git_service.decrypt_token(user.git_access_token)
        except Exception as decrypt_error:
            print(f"❌ Token decryption failed: {decrypt_error}")
            print(f"❌ User needs to re-authenticate with git")
            return []
        
        # Get unified git history
        git_history = git_service.get_unified_git_history(
            user.git_platform,
            token,
            project.git_repo_url,
            project.name,
            project.provider_id,
            limit=30
        )
        
        print(f"Retrieved {len(git_history)} git commits for project {project_id}")
        return git_history
            
    except Exception as e:
        print(f"Failed to get git history: {e}")
        import traceback
        traceback.print_exc()
        return []

# Test Settings endpoints
@app.get("/api/projects/{project_id}/test-settings", response_model=TestSettingsResponse, tags=["Test Settings"])
async def get_test_settings(project_id: int, db: Session = Depends(get_db)):
    """Get test settings from git repository."""
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # If project has git repo, try to get settings from git
    if project.git_repo_url:
        user = db.query(User).order_by(User.created_at.desc()).first()
        if user:
            try:
                token = git_service.decrypt_token(user.git_access_token)
                test_settings_result = git_service.get_test_settings_from_git(
                    user.git_platform,
                    token,
                    project.git_repo_url,
                    project.name,
                    project.provider_id
                )
                
                if test_settings_result:
                    test_settings = test_settings_result['test_settings']
                    return TestSettingsResponse(**test_settings)
            except Exception as e:
                print(f"Failed to get test settings from git: {e}")
    
    # Return default settings if not found in git or no git repo
    return TestSettingsResponse()

@app.post("/api/projects/{project_id}/test-settings", response_model=dict, tags=["Test Settings"])
async def save_test_settings(
    project_id: int,
    settings: TestSettingsRequest,
    db: Session = Depends(get_db)
):
    """Save test settings to git repository."""
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="No git repository configured for this project")
    
    # Get authenticated user
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        raise HTTPException(status_code=400, detail="No authenticated git user found")
    
    try:
        token = git_service.decrypt_token(user.git_access_token)
        
        # Convert settings to dict
        settings_dict = {
            "user_prompt": settings.userPrompt,
            "system_prompt": settings.systemPrompt,
            "variables": settings.variables,
            "temperature": settings.temperature,
            "max_len": settings.maxLen,
            "top_p": settings.topP,
            "top_k": settings.topK
        }
        
        # Save to git
        commit_info = git_service.save_test_settings_to_git(
            user.git_platform,
            token,
            project.git_repo_url,
            project.name,
            project.provider_id,
            settings_dict
        )
        
        return {
            "message": "Test settings saved successfully",
            "commit_sha": commit_info.get("commit_sha"),
            "commit_url": commit_info.get("commit_url")
        }
    
    except Exception as e:
        print(f"Failed to save test settings to git: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save test settings: {str(e)}")

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
    curl http://localhost:3001/prompt/document-summarizer/llama-3.1-8b-instruct
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
            "get_prompt": "curl http://localhost:3001/prompt/document-summarizer/llama-3.1-8b-instruct"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)