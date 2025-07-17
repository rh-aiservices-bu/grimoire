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
from datetime import datetime

from llama_stack_client import LlamaStackClient
from llama_stack_client.lib.inference.event_logger import EventLogger

from database import get_db
from models import Project, PromptHistory, User, PendingPR, GitCommitCache, BackendTestHistory
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    PromptHistoryCreate, PromptHistoryResponse, PromptHistoryUpdate,
    GenerateRequest, GenerateResponse, LatestPromptResponse,
    ProjectSummary, ProjectsModelsResponse, UserCreate, UserResponse,
    PendingPRResponse, GitAuthRequest, ProdPromptData, BackendTestHistoryResponse,
    BackendTestRequest, BackendTestHistoryUpdate, TestPromptData,
    TestSettingsRequest, TestSettingsResponse
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
    allow_origins=["*"],  # Allow all origins for OpenShift deployment
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
async def get_prompt_history(project_id: int, db: Session = Depends(get_db)):
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = []
    
    # Add current prod/test entries from git if project has git repo
    # Rate limit git access to prevent excessive API calls during backend testing
    if project.git_repo_url:
        user = db.query(User).order_by(User.created_at.desc()).first()
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
                    token = git_service.decrypt_token(user.git_access_token)
                    
                    # Get current production prompt from git
                    try:
                        current_prod_result = git_service.get_prod_prompt_from_git(
                            user.git_platform,
                            token,
                            project.git_repo_url,
                            project.name,
                            project.provider_id
                        )
                        if current_prod_result:
                            current_prod = current_prod_result['prompt_data']
                            commit_timestamp = current_prod_result.get('commit_timestamp')
                            
                            # Use commit timestamp if available, otherwise fallback to current time
                            created_at = commit_timestamp if commit_timestamp else datetime.now()
                            if isinstance(created_at, str):
                                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            
                            prod_entry = PromptHistoryResponse(
                                id=-1,  # Special ID for current prod
                                project_id=project_id,
                                user_prompt=current_prod.user_prompt,
                                system_prompt=current_prod.system_prompt,
                                variables=current_prod.variables,
                                temperature=current_prod.temperature,
                                max_len=current_prod.max_len,
                                top_p=current_prod.top_p,
                                top_k=current_prod.top_k,
                                response=None,
                                backend_response=None,
                                rating=None,
                                notes="🚀 PRODUCTION - Active in git repository",
                                is_prod=True,
                                has_merged_pr=False,
                                created_at=created_at
                            )
                            result.append(prod_entry)
                    except Exception as e:
                        print(f"Failed to get current prod prompt: {e}")
                    
                    # Get current test settings from git
                    try:
                        current_test_result = git_service.get_test_settings_from_git(
                            user.git_platform,
                            token,
                            project.git_repo_url,
                            project.name,
                            project.provider_id
                        )
                        if current_test_result:
                            current_test = current_test_result['test_settings']
                            commit_timestamp = current_test_result.get('commit_timestamp')
                            
                            # Use commit timestamp if available, otherwise fallback to current time
                            created_at = commit_timestamp if commit_timestamp else datetime.now()
                            if isinstance(created_at, str):
                                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            
                            test_entry = PromptHistoryResponse(
                                id=-2,  # Special ID for current test
                                project_id=project_id,
                                user_prompt=current_test.get('userPrompt', ''),
                                system_prompt=current_test.get('systemPrompt', ''),
                                variables=current_test.get('variables', {}),
                                temperature=current_test.get('temperature', 0.7),
                                max_len=current_test.get('maxLen', 1000),
                                top_p=current_test.get('topP', 0.9),
                                top_k=current_test.get('topK', 50),
                                response=None,
                                backend_response=None,
                                rating=None,
                                notes="🧪 TEST - Active test configuration in git",
                                is_prod=False,
                                has_merged_pr=False,
                                created_at=created_at
                            )
                            result.append(test_entry)
                    except Exception as e:
                        print(f"Failed to get current test settings: {e}")
                else:
                    print(f"⏰ Skipping git access for project {project_id} (accessed recently)")
                    
            except Exception as e:
                print(f"Failed to decrypt token or access git: {e}")
    
    # Get regular history from database
    history = db.query(PromptHistory).filter(
        PromptHistory.project_id == project_id
    ).order_by(PromptHistory.is_prod.desc(), PromptHistory.created_at.desc()).all()
    
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
    
    # Check if user already exists
    existing_user = db.query(User).filter(
        User.git_platform == auth_request.platform,
        User.git_username == auth_request.username
    ).first()
    
    if existing_user:
        # Update existing user
        existing_user.git_access_token = git_service.encrypt_token(auth_request.access_token)
        existing_user.git_server_url = auth_request.server_url
        db.commit()
        db.refresh(existing_user)
        user = existing_user
    else:
        # Create new user
        encrypted_token = git_service.encrypt_token(auth_request.access_token)
        db_user = User(
            git_platform=auth_request.platform,
            git_username=auth_request.username,
            git_access_token=encrypted_token,
            git_server_url=auth_request.server_url
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        user = db_user
    
    # Trigger initial sync for all projects with git repos
    print("Triggering initial git sync for all projects...")
    projects_with_git = db.query(Project).filter(Project.git_repo_url.isnot(None)).all()
    
    for project in projects_with_git:
        try:
            print(f"Initial sync for project {project.id}: {project.name}")
            await sync_git_commits_for_project(project.id, db, user)
        except Exception as e:
            print(f"Failed initial sync for project {project.id}: {e}")
            # Continue with other projects even if one fails
    
    print(f"Initial git sync completed for {len(projects_with_git)} projects")
    return user

@app.post("/api/git/sync-all", tags=["Git"])
async def sync_all_git_projects(db: Session = Depends(get_db)):
    """Manually trigger sync for all projects with git repos"""
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
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
async def get_current_git_user(db: Session = Depends(get_db)):
    """Get current authenticated git user"""
    user = db.query(User).order_by(User.created_at.desc()).first()  # In production, get from session
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    return user

@app.get("/api/git/auth-status", tags=["Git"])
async def get_git_auth_status(db: Session = Depends(get_db)):
    """Check if git authentication is still valid"""
    user = db.query(User).order_by(User.created_at.desc()).first()
    if not user:
        return {
            "authenticated": False,
            "user": None,
            "platform": None,
            "last_used": None
        }
    
    # Test if the authentication is still valid
    try:
        token = git_service.decrypt_token(user.git_access_token)
        is_valid = git_service.test_git_access(
            user.git_platform,
            user.git_username,
            token,
            "https://github.com/test/test",  # dummy repo for testing
            user.git_server_url
        )
        
        return {
            "authenticated": is_valid,
            "user": {
                "username": user.git_username,
                "platform": user.git_platform,
                "server_url": user.git_server_url
            },
            "platform": user.git_platform,
            "last_used": user.created_at.isoformat()
        }
    except Exception as e:
        return {
            "authenticated": False,
            "user": {
                "username": user.git_username,
                "platform": user.git_platform,
                "server_url": user.git_server_url
            },
            "platform": user.git_platform,
            "last_used": user.created_at.isoformat(),
            "error": str(e)
        }

@app.post("/api/projects/{project_id}/git/test-access", tags=["Git"])
async def test_git_repo_access(project_id: int, db: Session = Depends(get_db)):
    """Test if current user has access to project's git repository"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        raise HTTPException(status_code=400, detail="Project has no git repository configured")
    
    user = db.query(User).order_by(User.created_at.desc()).first()  # In production, get from session
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
    
    # Get current user (most recently authenticated)
    user = db.query(User).order_by(User.created_at.desc()).first()  # In production, get from session
    if not user:
        raise HTTPException(status_code=404, detail="No authenticated git user found")
    
    try:
        # All platforms now support PR creation
        print(f"Creating production PR for platform: {user.git_platform}")
        
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
        
        print(f"🔍 tag_prompt_as_test: user platform={user.git_platform}")
        print(f"🔍 tag_prompt_as_test: repo_url={project.git_repo_url}")
        print(f"🔍 tag_prompt_as_test: project_name={project.name}")
        print(f"🔍 tag_prompt_as_test: settings_data={settings_data}")
        
        # Save test settings to git
        try:
            token = git_service.decrypt_token(user.git_access_token)
        except Exception as decrypt_error:
            print(f"❌ Failed to decrypt git token: {decrypt_error}")
            raise HTTPException(status_code=401, detail="Git authentication expired or invalid. Please re-authenticate with git.")
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
async def get_pending_prs(project_id: int, db: Session = Depends(get_db)):
    """Get pending pull requests for a project - checks live status from git"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.git_repo_url:
        return []
    
    user = db.query(User).order_by(User.created_at.desc()).first()
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
    
    user = db.query(User).order_by(User.created_at.desc()).first()
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

async def sync_git_commits_for_project(project_id: int, db: Session, user: User) -> None:
    """Incrementally sync git commits for a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.git_repo_url:
        return
    
    try:
        print(f"🚀 Starting sync for project {project_id}")
        print(f"   Project name: {project.name}")
        print(f"   Provider ID: {project.provider_id}")
        print(f"   Git repo: {project.git_repo_url}")
        print(f"   User platform: {user.git_platform}")
        
        print(f"🔐 Decrypting token...")
        try:
            token = git_service.decrypt_token(user.git_access_token)
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
                user.git_platform,
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
                        user.git_platform,
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
async def get_prod_history_from_git(project_id: int, db: Session = Depends(get_db)):
    """Get production prompt history from cached git commits with incremental sync"""
    print(f"📋 GET /api/projects/{project_id}/prod-history called")
    
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    print(f"📋 Project found: {project.name}, git_repo: {project.git_repo_url}")
    
    if not project.git_repo_url:
        print(f"📋 No git repo configured, returning empty history")
        return []  # No git repo, return empty history
    
    user = db.query(User).order_by(User.created_at.desc()).first()  # In production, get from session
    if not user:
        print(f"📋 No authenticated user found, returning empty history")
        return []  # No authenticated user, return empty history
    
    print(f"📋 User found: {user.git_username}@{user.git_platform}")
    
    try:
        # First, test if the user's token can be decrypted
        try:
            git_service.decrypt_token(user.git_access_token)
        except Exception as decrypt_error:
            print(f"❌ Token decryption test failed: {decrypt_error}")
            print(f"❌ User needs to re-authenticate with git")
            # Return empty history with a message that auth is needed
            return []
        
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
    
    print(f"📋 User found: {user.git_username}@{user.git_platform}")
    
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