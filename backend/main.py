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
from models import Project, PromptHistory
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    PromptHistoryCreate, PromptHistoryResponse, PromptHistoryUpdate,
    GenerateRequest, GenerateResponse, LatestPromptResponse,
    ProjectSummary, ProjectsModelsResponse
)

app = FastAPI(
    title="Prompt Experimentation Tool API",
    description="""
    A comprehensive API for managing prompt experiments with Llamastack models.
    
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
        provider_id=project.providerId
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
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
    ).order_by(PromptHistory.created_at.desc()).all()
    
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
    
    db.commit()
    db.refresh(history_item)
    
    # Parse variables for response
    if history_item.variables:
        try:
            history_item.variables = json.loads(history_item.variables)
        except:
            history_item.variables = None
    
    return history_item

# Generate response using Llamastack (streaming)
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
    
    print(f"Making request to Llamastack: {project.llamastack_url}")
    print(f"Model: {project.provider_id}")
    print(f"Messages: {messages}")
    print(f"Sampling params: {sampling_params}")
    
    # Create queue for streaming
    q = queue.Queue()
    full_response = ""
    
    def worker():
        nonlocal full_response
        try:
            # Create Llamastack client
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


@app.get("/api/projects-models", response_model=ProjectsModelsResponse, tags=["External API"])
async def get_projects_and_models(db: Session = Depends(get_db)):
    """
    Get all available projects and their model configurations.
    
    This endpoint provides a list of all projects in the system along with their
    associated model names (provider_id) and Llamastack URLs. Useful for discovering
    available projects and their configurations.
    
    **Example Response:**
    ```json
    {
      "projects": [
        {
          "name": "newsummary",
          "provider_id": "llama32-full",
          "llamastack_url": "http://llamastack-server.example.com"
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
        variables=variables
    )

@app.get("/", tags=["Documentation"])
async def root():
    """
    Welcome to the Prompt Experimentation Tool API!
    
    This API provides comprehensive prompt experimentation capabilities with Llamastack models.
    
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