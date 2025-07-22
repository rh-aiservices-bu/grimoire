# Grimoire - AI Prompt Experimentation Platform API Documentation

## 🌐 Interactive Documentation

The API provides comprehensive interactive documentation through multiple interfaces:

- **Swagger UI**: http://localhost:3001/docs - Interactive testing interface with live examples
- **ReDoc**: http://localhost:3001/redoc - Clean, mobile-friendly documentation interface  
- **OpenAPI JSON**: http://localhost:3001/openapi.json - Raw OpenAPI 3.0 specification
- **Health Check**: http://localhost:3001/api - OpenShift-compatible health endpoint

## 🚀 Quick Start

### 1. Authenticate with Git (Optional)

**GitHub:**
```bash
curl -X POST http://localhost:3001/api/git/auth \
  -H "Content-Type: application/json" \
  -d '{"platform": "github", "username": "your-username", "access_token": "your-token"}'
```

**GitLab (hosted gitlab.com):**
```bash
curl -X POST http://localhost:3001/api/git/auth \
  -H "Content-Type: application/json" \
  -d '{"platform": "gitlab", "username": "your-username", "access_token": "your-token"}'
```

**GitLab (self-hosted):**
```bash
curl -X POST http://localhost:3001/api/git/auth \
  -H "Content-Type: application/json" \
  -d '{"platform": "gitlab", "username": "your-username", "access_token": "your-token", "server_url": "https://gitlab.example.com"}'
```

**Gitea:**
```bash
curl -X POST http://localhost:3001/api/git/auth \
  -H "Content-Type: application/json" \
  -d '{"platform": "gitea", "username": "your-username", "access_token": "your-token", "server_url": "https://git.example.com"}'
```

**Authentication Testing:**
- **GitHub**: Tests access to public repository `octocat/Hello-World`
- **GitLab**: Tests access to public repository `gitlab-org/gitlab`  
- **Gitea**: Tests authentication using user info endpoint (`/api/v1/user`) and validates username match

### 2. List All Projects and Models
```bash
curl http://localhost:3001/api/projects-models
```

**Response Example:**
```json
{
  "projects": [
    {
      "name": "document-summarizer",
      "provider_id": "llama-3.1-8b-instruct",
      "llamastack_url": "http://llama-stack-server.example.com"
    },
    {
      "name": "code-assistant", 
      "provider_id": "llama-3.1-70b-instruct",
      "llamastack_url": "http://llama-stack-server.example.com"
    }
  ]
}
```

### 3. Get Latest Prompt Configuration
```bash
curl http://localhost:3001/prompt/document-summarizer/llama-3.1-8b-instruct
```

**Response Example:**
```json
{
  "userPrompt": "Summarize this document: {{content}}",
  "systemPrompt": "You are a helpful document summarizer",
  "temperature": 0.7,
  "maxLen": 1000,
  "topP": 0.9,
  "topK": 50,
  "variables": {
    "content": "Document text here..."
  },
  "is_prod": false
}
```

### 4. Get Production Prompt Configuration
```bash
curl http://localhost:3001/prompt/document-summarizer/llama-3.1-8b-instruct/prod
```

**Response Example:**
```json
{
  "userPrompt": "Summarize this document: {{content}}",
  "systemPrompt": "You are a production-ready document summarizer",
  "temperature": 0.6,
  "maxLen": 800,
  "topP": 0.85,
  "topK": 40,
  "variables": {
    "content": "Document text here..."
  },
  "is_prod": true
}
```

### 5. Backend Testing
```bash
curl -X POST http://localhost:3001/api/projects/1/test-backend \
  -H "Content-Type: application/json" \
  -d '{
    "test_backend_url": "http://localhost:8000",
    "user_prompt": "Help me with {{task}}",
    "system_prompt": "You are a helpful coding assistant",
    "variables": {"task": "Python debugging"},
    "temperature": 0.7,
    "max_len": 500,
    "top_p": 0.9,
    "top_k": 50
  }'
```

### 6. Generate Streaming Response
```bash
curl -X POST http://localhost:3001/api/projects/1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "user_prompt": "Explain {{concept}} in simple terms",
    "system_prompt": "You are a helpful teacher",
    "variables": {"concept": "machine learning"},
    "temperature": 0.7,
    "max_len": 200,
    "top_p": 0.9,
    "top_k": 50
  }'
```

### 7. Run Evaluation
```bash
curl -X POST http://localhost:3001/api/projects/1/eval \
  -H "Content-Type: application/json" \
  -d '{
    "user_prompt": "Summarize: {{text}}",
    "system_prompt": "You are a summarization expert",
    "eval_dataset": "xsum",
    "num_samples": 10,
    "scoring_functions": ["relevance", "coherence", "conciseness"]
  }'
```

### 8. Get Test Settings from Git
```bash
curl http://localhost:3001/api/projects/1/test-settings
```

**Response Example:**
```json
{
  "test_backend_url": "http://localhost:8000",
  "user_prompt": "Help me with {{task}}",
  "system_prompt": "You are a helpful coding assistant",
  "variables": {"task": "Python debugging"},
  "temperature": 0.7,
  "max_len": 500,
  "top_p": 0.9,
  "top_k": 50
}
```

## 📋 Key External API Endpoints

### Projects and Models Discovery
- **GET** `/api/projects-models` - Get all available projects and their model configurations
- **Tag**: `External API`
- **Use Case**: Discover available projects for integration

### Latest Prompt Configuration  
- **GET** `/prompt/{project_name}/{provider_id}` - Get most recent prompt configuration
- **Tag**: `External API`
- **Use Case**: Retrieve tested prompt templates for external use

### Production Prompt Configuration
- **GET** `/prompt/{project_name}/{provider_id}/prod` - Get production-ready prompt configuration
- **Tag**: `External API`
- **Use Case**: Access only production-tested, approved prompts for deployment
- **Note**: Serves from git repository when available, falls back to database

### Git Integration
- **POST** `/api/git/auth` - Authenticate with git platform (GitHub/GitLab/Gitea)
- **GET** `/api/git/user` - Get current authenticated git user
- **GET** `/api/git/auth-status` - Check authentication status
- **POST** `/api/git/sync-all` - Sync all git projects
- **Tag**: `Git`
- **Use Case**: Enable git-based production workflow
- **Supports**: GitHub.com, GitHub Enterprise, GitLab.com, self-hosted GitLab, self-hosted Gitea
- **Authentication**: Different token types per platform (GitHub: Personal Access Token, GitLab: Private Token, Gitea: Access Token)

### Production Workflow
- **POST** `/api/projects/{id}/history/{historyId}/tag-prod` - Create production pull request
- **POST** `/api/projects/{id}/history/{historyId}/tag-test` - Save test settings to git
- **GET** `/api/projects/{id}/pending-prs` - Get pending pull requests with live status
- **GET** `/api/projects/{id}/prod-history` - Get production history from git commits
- **GET** `/api/projects/{id}/git-history` - Get unified git history
- **POST** `/api/projects/{id}/sync-prs` - Sync PR statuses from git
- **POST** `/api/projects/{id}/git/test-access` - Test git repository access
- **Tag**: `Git`
- **Use Case**: Git-based production deployment workflow
- **Platform Support**: GitHub, GitLab, and Gitea fully supported

### Backend Testing & Evaluation
- **POST** `/api/projects/{id}/test-backend` - Test backend with streaming responses and performance metrics
- **GET** `/api/projects/{id}/backend-history` - Get comprehensive backend test history
- **PUT** `/api/projects/{id}/backend-history/{historyId}` - Update backend test status and ratings
- **POST** `/api/projects/{id}/backend-history/{historyId}/tag-prod` - Create production PR from backend test
- **POST** `/api/projects/{id}/backend-history/{historyId}/tag-test` - Save test settings from backend test
- **POST** `/api/projects/{id}/eval` - Run LlamaStack evaluation with scoring functions and datasets
- **POST** `/api/projects/{id}/generate` - Generate responses using LlamaStack with streaming
- **Tag**: `Backend Testing`, `Generation`, `Evaluation`
- **Use Case**: Test prompts against configured backend URLs, evaluate with datasets, generate streaming responses
- **Features**: 
  - Server-Sent Events (SSE) streaming
  - Performance metrics and error tracking
  - Template variable substitution (`{{variable}}`)
  - LLM-as-judge evaluation scoring
  - Dataset integration (HuggingFace compatible)
  - Response time analytics

### Settings Management
- **GET** `/api/projects/{id}/test-settings` - Get test settings from git
- **POST** `/api/projects/{id}/test-settings` - Save test settings to git
- **Tag**: `Settings`
- **Use Case**: Git-based settings storage and retrieval
- **Features**: Version control for configurations, team collaboration

## 🏷️ API Organization

Endpoints are organized into logical groups:

- **📁 Projects** - Project CRUD operations with automatic git integration
- **📜 History** - Comprehensive prompt and test history management  
- **⚡ Generation** - LlamaStack response generation with streaming
- **🧪 Backend Testing** - External API testing with performance analytics
- **🔬 Evaluation** - Advanced prompt evaluation with LLM scoring
- **🔀 Git** - Multi-platform Git authentication and workflow operations
- **⚙️ Settings** - Git-based configuration management with version control
- **🌍 External API** - Production integration endpoints for external systems
- **🏥 Health** - Monitoring and debugging endpoints
- **📖 Documentation** - Interactive API documentation and guides

## 📊 Advanced Features

### **Streaming Support**
All generation and testing endpoints support Server-Sent Events (SSE):
- **Content-Type**: `text/event-stream`
- **Event Types**: `token`, `done`, `error`, `status`
- **Performance Metrics**: Response time, token count, error tracking

### **Template Engine**
Dynamic prompt templates with variable substitution:
- **Syntax**: `{{variable_name}}`
- **Validation**: Template validation and variable requirement checking
- **Nested Variables**: Support for complex data structures

### **Evaluation System** ⭐ **NEW**
Comprehensive prompt evaluation framework:
- **LLM-as-Judge**: Automated scoring using LlamaStack models
- **Dataset Integration**: HuggingFace dataset compatibility
- **Scoring Functions**: Configurable evaluation criteria
- **Batch Processing**: Evaluate prompts against multiple test cases

### **GitOps Integration**
Full Git workflow with enterprise support:
- **Platforms**: GitHub (cloud/enterprise), GitLab (cloud/self-hosted), Gitea
- **Security**: Fernet-encrypted token storage
- **Workflows**: Automatic PR creation, commit tracking, branch management
- **Caching**: Git commit caching for improved performance

## 🔗 Template Variables

The API supports dynamic prompt templates using `{{variable_name}}` syntax:

**Template Example:**
```
Help me debug this {{language}} code: {{code}}
```

**Variables:**
```json
{
  "language": "Python",
  "code": "def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n-1)"
}
```

**Result:**
```
Help me debug this Python code: def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n-1)
```

## 🛠️ Development

### Starting the Server
```bash
cd backend
source myenv/bin/activate
python main.py
```

### Accessing Documentation
Once the server is running:
- Open http://localhost:3001/docs for Swagger UI
- Open http://localhost:3001/redoc for ReDoc interface
- Visit http://localhost:3001/ for API overview

## 📝 Example Integration

### Python Example
```python
import requests

# Optional: Authenticate with git for production workflow
git_auth = {
    "platform": "github",
    "username": "your-username", 
    "access_token": "your-personal-access-token"
}
auth_response = requests.post("http://localhost:3001/api/git/auth", json=git_auth)
if auth_response.status_code == 200:
    print("Git authentication successful")

# Get available projects
response = requests.get("http://localhost:3001/api/projects-models")
projects = response.json()["projects"]

# Get latest prompt for first project
if projects:
    project = projects[0]
    prompt_response = requests.get(
        f"http://localhost:3001/prompt/{project['name']}/{project['provider_id']}"
    )
    prompt_config = prompt_response.json()
    print(f"Latest prompt: {prompt_config['userPrompt']}")
    print(f"Is production: {prompt_config['is_prod']}")
    
    # Get production prompt specifically (from git when available)
    try:
        prod_response = requests.get(
            f"http://localhost:3001/prompt/{project['name']}/{project['provider_id']}/prod"
        )
        if prod_response.status_code == 200:
            prod_config = prod_response.json()
            print(f"Production prompt: {prod_config['userPrompt']}")
            print("Source: Git repository" if prod_config.get('is_prod') else "Source: Database")
        else:
            print("No production prompt available")
    except requests.exceptions.RequestException:
        print("Error getting production prompt")
        
    # Check for pending production PRs
    try:
        prs_response = requests.get(f"http://localhost:3001/api/projects/{project['id']}/pending-prs")
        if prs_response.status_code == 200:
            pending_prs = prs_response.json()
            print(f"Pending PRs: {len(pending_prs)}")
            for pr in pending_prs:
                print(f"  - PR #{pr['pr_number']}: {pr['pr_url']}")
    except requests.exceptions.RequestException:
        print("Error getting pending PRs")
```

### JavaScript Example
```javascript
// Get available projects
const projectsResponse = await fetch('http://localhost:3001/api/projects-models');
const { projects } = await projectsResponse.json();

// Get latest prompt configuration
if (projects.length > 0) {
    const project = projects[0];
    const promptResponse = await fetch(
        `http://localhost:3001/prompt/${project.name}/${project.provider_id}`
    );
    const promptConfig = await promptResponse.json();
    console.log('Latest prompt:', promptConfig.userPrompt);
    console.log('Is production:', promptConfig.is_prod);
    
    // Get production prompt specifically
    try {
        const prodResponse = await fetch(
            `http://localhost:3001/prompt/${project.name}/${project.provider_id}/prod`
        );
        if (prodResponse.ok) {
            const prodConfig = await prodResponse.json();
            console.log('Production prompt:', prodConfig.userPrompt);
        } else {
            console.log('No production prompt available');
        }
    } catch (error) {
        console.log('Error getting production prompt:', error);
    }
    
    // Test backend with streaming
    const testResponse = await fetch(`http://localhost:3001/api/projects/${project.id}/test-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            test_backend_url: 'http://localhost:8000',
            user_prompt: 'Help me with {{task}}',
            system_prompt: 'You are a helpful coding assistant',
            variables: { task: 'JavaScript debugging' },
            temperature: 0.7,
            max_len: 500,
            top_p: 0.9,
            top_k: 50
        })
    });
    
    if (testResponse.ok) {
        const reader = testResponse.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'token') {
                        console.log('Token:', data.content);
                    } else if (data.type === 'done') {
                        console.log('Response complete');
                    }
                }
            }
        }
    }
}
```

## 🔧 Error Handling

All endpoints return standard HTTP status codes:

- **200** - Success
- **201** - Created
- **404** - Resource not found
- **422** - Validation error
- **500** - Internal server error

Error responses include descriptive messages:
```json
{
  "detail": "Project not found"
}
```

## 📡 Streaming Responses

Both `/generate` and `/test-backend` endpoints support Server-Sent Events (SSE) streaming:

**Content-Type**: `text/event-stream`

**Response Format**:
```
data: {"type": "token", "content": "Hello"}
data: {"type": "token", "content": " world"}
data: {"type": "done", "response_time": 1.23}
```

**Event Types**:
- `token`: Partial response content
- `done`: End of stream with performance metrics
- `error`: Error occurred during streaming

## 🔍 Complete Endpoint Reference

### **Health & Monitoring**
- **GET** `/` - API overview and documentation home
- **GET** `/api` - Health check endpoint (OpenShift compatible)
- **GET** `/api/debug/projects` - Debug information with project relationships

### **Project Management**
- **GET** `/api/projects` - List all projects with basic information
- **POST** `/api/projects` - Create new project (auto-creates git PRs if configured)
- **GET** `/api/projects/{project_id}` - Get specific project details
- **PUT** `/api/projects/{project_id}` - Update project configuration
- **DELETE** `/api/projects/{project_id}` - Delete project (cascades to all related data)

### **Prompt History & Management**
- **GET** `/api/projects/{project_id}/history` - Get prompt history with git integration
- **POST** `/api/projects/{project_id}/history` - Save new prompt to history
- **PUT** `/api/projects/{project_id}/history/{history_id}` - Update prompt (rating, notes, production status)
- **POST** `/api/projects/{project_id}/history/{history_id}/tag-prod` - Create production PR
- **POST** `/api/projects/{project_id}/history/{history_id}/tag-test` - Commit to git as test

### **Generation & AI Operations**
- **POST** `/api/projects/{project_id}/generate` - **STREAMING** - Generate responses with LlamaStack
- **POST** `/api/projects/{project_id}/eval` - **ADVANCED** - Run evaluation with scoring functions

### **Backend Testing**
- **GET** `/api/projects/{project_id}/backend-history` - Get backend test results
- **PUT** `/api/projects/{project_id}/backend-history/{history_id}` - Update backend test
- **POST** `/api/projects/{project_id}/test-backend` - **STREAMING** - Test external backend APIs
- **POST** `/api/projects/{project_id}/backend-history/{history_id}/tag-prod` - Create production PR from test
- **POST** `/api/projects/{project_id}/backend-history/{history_id}/tag-test` - Save test settings to git

### **Git Integration & Workflows**
- **POST** `/api/git/auth` - Authenticate with GitHub/GitLab/Gitea
- **GET** `/api/git/user` - Get authenticated git user information
- **GET** `/api/git/auth-status` - Check git authentication status
- **POST** `/api/git/sync-all` - Sync all projects with git repositories
- **POST** `/api/projects/{project_id}/git/test-access` - Test git repository access
- **GET** `/api/projects/{project_id}/pending-prs` - Get pending PRs with live status
- **POST** `/api/projects/{project_id}/sync-prs` - Sync PR statuses from git
- **GET** `/api/projects/{project_id}/prod-history` - Get production history from git
- **GET** `/api/projects/{project_id}/git-history` - Get unified git history

### **Settings & Configuration**
- **GET** `/api/projects/{project_id}/test-settings` - Get test settings from git
- **POST** `/api/projects/{project_id}/test-settings` - Save test settings to git

### **External Integration APIs**
- **GET** `/api/projects-models` - List projects and models for external integration
- **GET** `/prompt/{project_name}/{provider_id}` - Get latest prompt configuration
- **GET** `/prompt/{project_name}/{provider_id}/prod` - Get production prompt from git

## 🚨 Important Notes

### **Streaming Endpoints**
The following endpoints return Server-Sent Events:
- `/api/projects/{id}/generate` - Token-by-token LlamaStack generation
- `/api/projects/{id}/test-backend` - Real-time backend testing responses

### **Git Platform Support**
Fully supports authentication and operations with:
- **GitHub**: Personal Access Tokens, GitHub Enterprise
- **GitLab**: Private Tokens, self-hosted GitLab instances
- **Gitea**: Access Tokens, self-hosted Gitea instances

### **Security Features**
- Token encryption using Fernet symmetric encryption
- Rate limiting on git operations
- CORS middleware for OpenShift deployment
- Secure credential storage and management