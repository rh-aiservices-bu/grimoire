# Grimoire - AI Prompt Experimentation Platform API Documentation

A comprehensive FastAPI-based backend service providing advanced prompt experimentation, evaluation, and production deployment capabilities with multi-platform Git integration and real-time streaming support. Built with Python 3.9+ and modern async architecture.

## 🌐 Interactive Documentation

The API provides comprehensive interactive documentation through multiple interfaces:

- **📖 Swagger UI**: http://localhost:3001/docs - Interactive testing interface with live examples and authentication
- **📚 ReDoc**: http://localhost:3001/redoc - Clean, mobile-friendly documentation with detailed schemas
- **🔧 OpenAPI JSON**: http://localhost:3001/openapi.json - Machine-readable OpenAPI 3.0 specification
- **🏥 Health Check**: http://localhost:3001/api - OpenShift-compatible health endpoint with status information
- **🔍 Debug**: http://localhost:3001/api/debug/projects - Development debugging information with project relationships

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
    "prompt": "Help me with {{task}}",
    "variables": {"task": "Python debugging"}
  }'
```

### 5.1. Backend Testing with Chat Interface
```bash
curl -X POST http://localhost:3001/api/projects/1/test-backend \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Debug this Python code: {{code}}",
    "variables": {"code": "def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n-1)"}
  }'
```

### 5.2. Get Backend Test History
```bash
curl http://localhost:3001/api/projects/1/backend-history
```

### 5.3. Update Backend Test Status
```bash
curl -X PUT http://localhost:3001/api/projects/1/backend-history/1 \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "notes": "Excellent debugging response",
    "is_test": true
  }'
```

### 5.4. Tag Backend Test as Production
```bash
curl -X POST http://localhost:3001/api/projects/1/backend-history/1/tag-prod \
  -H "Content-Type: application/json" \
  -d '{
    "commit_message": "Promote debugging assistant to production"
  }'
```

### 6. Generate Streaming Response
```bash
curl -X POST http://localhost:3001/api/projects/1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "userPrompt": "Explain {{concept}} in simple terms",
    "systemPrompt": "You are a helpful teacher",
    "variables": {"concept": "machine learning"},
    "temperature": 0.7,
    "maxLen": 200,
    "topP": 0.9,
    "topK": 50
  }'
```

### 6.1. Generate Multi-Message Conversation
```bash
curl -X POST http://localhost:3001/api/projects/1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful coding assistant"},
      {"role": "user", "content": "How do I write a Python function?"},
      {"role": "assistant", "content": "Here\'s how you write a basic Python function..."},
      {"role": "user", "content": "Can you show me an example with {{topic}}?"}
    ],
    "variables": {"topic": "error handling"},
    "temperature": 0.7,
    "maxLen": 500
  }'
```

### 7. Run Evaluation
```bash
curl -X POST http://localhost:3001/api/projects/1/eval \
  -H "Content-Type: application/json" \
  -d '{
    "userPrompt": "Summarize: {{text}}",
    "systemPrompt": "You are a summarization expert",
    "evalDataset": "xsum",
    "numSamples": 10,
    "scoringFunctions": ["relevance", "coherence", "conciseness"],
    "variables": {"text": "sample text"}
  }'
```

### 7.1. Run LLM-as-Judge Evaluation
```bash
curl -X POST http://localhost:3001/api/projects/1/eval \
  -H "Content-Type: application/json" \
  -d '{
    "userPrompt": "Rate the quality of this summary: {{summary}}",
    "systemPrompt": "You are an expert evaluator. Rate from 1-10.",
    "evalDataset": "custom_evaluation_set",
    "numSamples": 50,
    "scoringFunctions": ["accuracy", "completeness", "clarity"],
    "variables": {"summary": "This is a test summary"}
  }'
```

### 8. Git-based Settings Management

### 8.1. Get Test Settings from Git
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

### 8.2. Save Test Settings to Git
```bash
curl -X POST http://localhost:3001/api/projects/1/test-settings \
  -H "Content-Type: application/json" \
  -d '{
    "test_backend_url": "http://localhost:8000",
    "user_prompt": "Debug {{code_type}} code: {{code}}",
    "system_prompt": "You are an expert code debugger",
    "variables": {
      "code_type": "Python",
      "code": "example code here"
    },
    "temperature": 0.8,
    "max_len": 1000
  }'
```

### 8.3. Tag Backend Test Settings
```bash
curl -X POST http://localhost:3001/api/projects/1/backend-history/1/tag-test \
  -H "Content-Type: application/json" \
  -d '{
    "commit_message": "Save debugging configuration as test settings"
  }'
```

### 8.4. Check Git Repository Changes
```bash
curl http://localhost:3001/api/projects/1/git-changes
```

**Response Example:**
```json
{
  "has_changes": true,
  "modified_files": ["prompt.json", "settings.json"],
  "untracked_files": ["new_config.json"],
  "branch": "main",
  "last_commit": "a1b2c3d"
}
```

### 8.5. Clear Pull Request Cache
```bash
curl -X POST http://localhost:3001/api/projects/1/clear-pr-cache
```

### 8.6. Quick Git Authentication Status
```bash
curl http://localhost:3001/api/git/quick-status
```

**Response Example:**
```json
{
  "authenticated": true,
  "platform": "github",
  "username": "your-username",
  "last_validated": "2024-01-15T10:30:00Z"
}
```

## 📋 Key External API Endpoints

### **Projects and Models Discovery**
- **GET** `/api/projects-models` - Get all available projects and their model configurations
- **Tag**: `External API`
- **Use Case**: Discover available projects for integration with external systems
- **Response**: Includes project names, provider IDs, LlamaStack URLs, and Git repository information

### **Latest Prompt Configuration**
- **GET** `/prompt/{project_name}/{provider_id}` - Get most recent prompt configuration from database
- **Tag**: `External API`
- **Use Case**: Retrieve latest tested prompt templates for external use
- **Features**: Includes template variables, model parameters, and metadata

### **Production Prompt Configuration** ⭐ **RECOMMENDED**
- **GET** `/prompt/{project_name}/{provider_id}/prod` - Get production-ready prompt configuration
- **Tag**: `External API`
- **Use Case**: Access only production-tested, approved prompts for deployment
- **Priority**: Serves from Git repository when available, falls back to database
- **Security**: Only returns prompts that have gone through production approval workflow

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
- **POST** `/api/projects/{id}/backend-history/{historyId}/tag-prod` - Create production PR from backend test
- **POST** `/api/projects/{id}/backend-history/{historyId}/tag-test` - Save backend test as test configuration
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
- **Conversation Support**: Multi-message streaming with role-based context
- **Thought Process Extraction**: Automatic parsing of `<think>` tags for model reasoning display

### **Template Engine**
Dynamic prompt templates with variable substitution:
- **Syntax**: `{{variable_name}}`
- **Validation**: Template validation and variable requirement checking
- **Nested Variables**: Support for complex data structures
- **Live Preview**: Real-time template processing and variable substitution display
- **Multi-Context Support**: Template processing across prompts, backend tests, and evaluations

### **Evaluation System** ⭐ **ENHANCED**
Comprehensive prompt evaluation framework:
- **LLM-as-Judge**: Automated scoring using LlamaStack models with customizable evaluation criteria
- **Dataset Integration**: HuggingFace dataset compatibility with custom dataset support
- **Scoring Functions**: Configurable evaluation criteria (relevance, coherence, accuracy, etc.)
- **Batch Processing**: Evaluate prompts against multiple test cases with parallel processing
- **Evaluation History**: Track evaluation results over time with performance analytics
- **Custom Evaluation Prompts**: Define your own evaluation criteria and scoring methodologies

### **GitOps Integration**
Full Git workflow with enterprise support:
- **Platforms**: GitHub (cloud/enterprise), GitLab (cloud/self-hosted), Gitea
- **Security**: Fernet-encrypted token storage with platform-specific validation
- **Workflows**: Automatic PR creation, commit tracking, branch management
- **Caching**: Git commit caching for improved performance
- **Production Pipeline**: Visual Test → Production promotion workflow with approval gates
- **Settings Management**: Git-based configuration storage with version control
- **Backend Test Integration**: Promote backend test results directly to production via Git workflow

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
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
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

# Optional: Authenticate with Git for production workflow
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
- `status`: Status updates for multi-step operations
- `thought`: Extracted model reasoning from `<think>` tags

## 🔍 Complete Endpoint Reference

### **💬 New Conversation & Multi-Message Support**
- **POST** `/api/projects/{project_id}/generate` - Now supports both single prompts and multi-message conversations
- **Message Format**: `{"role": "system|user|assistant", "content": "message text"}`
- **Conversation Context**: Maintains conversation history across multiple exchanges
- **Role-based Streaming**: Streaming responses maintain conversation context and role information

### **🧠 Enhanced Thought Process Extraction**
- **Automatic Detection**: Identifies and extracts `<think>...</think>` tags from model responses
- **Real-time Display**: Shows model reasoning process during streaming
- **Structured Output**: Separates reasoning from final response for better UX

### **🎯 Production Promotion Pipeline**
- **Visual Workflow**: Test → Production promotion with approval gates
- **Status Tracking**: Real-time monitoring of promotion pipeline status
- **Git Integration**: Automatic PR creation with detailed commit messages and metadata

### **🏥 Health & Monitoring**
- **GET** `/` - API overview and documentation home with feature summary
- **GET** `/api` - OpenShift-compatible health check endpoint with detailed status
- **GET** `/api/debug/projects` - Development debugging with project relationships and database state
- **GET** `/api/git/quick-status` - Quick Git authentication status check with minimal response time

### **📁 Project Management**
- **GET** `/api/projects` - List all projects with Git integration status and model information
- **POST** `/api/projects` - Create new project with automatic Git PR creation (if repository configured)
- **GET** `/api/projects/{project_id}` - Get specific project details including Git configuration
- **PUT** `/api/projects/{project_id}` - Update project configuration (triggers Git synchronization)
- **DELETE** `/api/projects/{project_id}` - Delete project with cascading removal of all related data

### **📜 Prompt History & Management**
- **GET** `/api/projects/{project_id}/history` - Get prompt history with Git commit integration and metadata
- **POST** `/api/projects/{project_id}/history` - Save new prompt to history with automatic timestamping
- **PUT** `/api/projects/{project_id}/history/{history_id}` - Update prompt metadata (rating, notes, production status)
- **POST** `/api/projects/{project_id}/history/{history_id}/tag-prod` - Create production pull request with approval workflow
- **POST** `/api/projects/{project_id}/history/{history_id}/tag-test` - Commit prompt to Git as test configuration

### **⚡ Generation & AI Operations**
- **POST** `/api/projects/{project_id}/generate` - **🌊 STREAMING** - Generate responses with LlamaStack using Server-Sent Events
- **POST** `/api/projects/{project_id}/eval` - **🧠 ADVANCED** - Run comprehensive evaluation with scoring functions and datasets

### **🧪 Backend Testing & Validation**
- **GET** `/api/projects/{project_id}/backend-history` - Get backend test results with performance analytics
- **PUT** `/api/projects/{project_id}/backend-history/{history_id}` - Update backend test metadata and ratings
- **POST** `/api/projects/{project_id}/test-backend` - **🌊 STREAMING** - Test external backend APIs with real-time response streaming
- **POST** `/api/projects/{project_id}/backend-history/{history_id}/tag-prod` - Create production PR from successful backend test
- **POST** `/api/projects/{project_id}/backend-history/{history_id}/tag-test` - Save test settings to Git repository
- **POST** `/api/projects/{project_id}/eval` - **🧠 EVALUATION** - Run LLM-as-judge evaluations with dataset integration

### **🔀 Git Integration & Workflows**
- **POST** `/api/git/auth` - Authenticate with GitHub/GitLab/Gitea using platform-specific tokens
- **GET** `/api/git/user` - Get authenticated Git user information and permissions
- **GET** `/api/git/auth-status` - Check Git authentication status and token validity
- **POST** `/api/git/sync-all` - Synchronize all projects with their Git repositories
- **POST** `/api/projects/{project_id}/git/test-access` - Test Git repository access and permissions
- **GET** `/api/projects/{project_id}/pending-prs` - Get pending pull requests with live status updates
- **POST** `/api/projects/{project_id}/sync-prs` - Sync PR statuses from Git platforms with caching
- **GET** `/api/projects/{project_id}/git-changes` - Check for Git repository changes and uncommitted files
- **POST** `/api/projects/{project_id}/clear-pr-cache` - Clear pull request cache for immediate status refresh
- **GET** `/api/projects/{project_id}/prod-history` - Get production history from Git commits with metadata
- **GET** `/api/projects/{project_id}/git-history` - Get unified Git history with commit details and timestamps

### **⚙️ Settings & Configuration Management**
- **GET** `/api/projects/{project_id}/test-settings` - Get test settings from Git repository with version tracking
- **POST** `/api/projects/{project_id}/test-settings` - Save test settings to Git with commit message and branching

### **🌍 External Integration APIs**
- **GET** `/api/projects-models` - List all projects and models for external system integration
- **GET** `/prompt/{project_name}/{provider_id}` - Get latest prompt configuration with template variables
- **GET** `/prompt/{project_name}/{provider_id}/prod` - Get production prompt from Git repository (preferred) or database

## 🚨 Important Notes & Technical Specifications

### **🌊 Streaming Endpoints**
The following endpoints return Server-Sent Events (SSE) with real-time streaming:
- **`/api/projects/{id}/generate`** - Token-by-token LlamaStack generation with delta updates
- **`/api/projects/{id}/test-backend`** - Real-time backend testing responses with performance metrics
- **Content-Type**: `text/event-stream`
- **Keep-Alive**: Automatic connection management with heartbeat
- **Error Handling**: Graceful error propagation within streams

### **🔐 Git Platform Support**
Comprehensive multi-platform Git integration with enterprise support:
- **GitHub**: Personal Access Tokens, GitHub Enterprise Server, fine-grained tokens
- **GitLab**: Private Tokens, self-hosted GitLab instances, project access tokens
- **Gitea**: Access Tokens, self-hosted Gitea instances, organization support
- **Authentication Testing**: Platform-specific validation with test repositories
- **Repository Management**: Automatic PR/MR creation, branch management, commit tracking

### **🛡️ Security Features**
Enterprise-grade security with comprehensive protection:
- **Token Encryption**: Fernet symmetric encryption for all stored credentials
- **Rate Limiting**: Intelligent rate limiting for Git API operations to prevent abuse
- **CORS Middleware**: OpenShift-compatible CORS configuration with origin validation
- **Input Validation**: Comprehensive request validation with Pydantic schemas
- **Secure Storage**: Encrypted credential storage with secure key management
- **Error Sanitization**: Secure error messages preventing information leakage

### **🚀 Performance & Scalability**
Optimized for production deployment:
- **Database**: SQLAlchemy ORM with connection pooling and query optimization
- **Async Operations**: Mixed sync/async architecture for optimal performance
- **Caching**: Git commit caching and intelligent cache invalidation
- **Memory Management**: Efficient streaming with bounded memory usage
- **Threading**: Safe multi-threaded streaming implementation