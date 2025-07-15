# Prompt Experimentation Tool API Documentation

## 🌐 Interactive Documentation

The API provides comprehensive interactive documentation through multiple interfaces:

- **Swagger UI**: http://localhost:3001/docs - Interactive testing interface
- **ReDoc**: http://localhost:3001/redoc - Clean documentation interface  
- **OpenAPI JSON**: http://localhost:3001/openapi.json - Raw specification

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
      "name": "newsummary",
      "provider_id": "llama32-full",
      "llamastack_url": "http://llama-stack-server.example.com"
    },
    {
      "name": "newone", 
      "provider_id": "llama-3.2-3b",
      "llamastack_url": "http://llama-stack-server.example.com"
    }
  ]
}
```

### 3. Get Latest Prompt Configuration
```bash
curl http://localhost:3001/prompt/newsummary/llama32-full
```

**Response Example:**
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
  },
  "is_prod": false
}
```

### 4. Get Production Prompt Configuration
```bash
curl http://localhost:3001/prompt/newsummary/llama32-full/prod
```

**Response Example:**
```json
{
  "userPrompt": "Summarize this article: {{content}}",
  "systemPrompt": "You are a production-ready news summarizer",
  "temperature": 0.6,
  "maxLen": 800,
  "topP": 0.85,
  "topK": 40,
  "variables": {
    "content": "Article text here..."
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
    "user_prompt": "Tell me about {{topic}}",
    "system_prompt": "You are a helpful assistant",
    "variables": {"topic": "machine learning"},
    "temperature": 0.7,
    "max_len": 500,
    "top_p": 0.9,
    "top_k": 50
  }'
```

### 6. Get Test Settings from Git
```bash
curl http://localhost:3001/api/projects/1/test-settings
```

**Response Example:**
```json
{
  "test_backend_url": "http://localhost:8000",
  "user_prompt": "Tell me about {{topic}}",
  "system_prompt": "You are a helpful assistant",
  "variables": {"topic": "machine learning"},
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
- **Tag**: `Git`
- **Use Case**: Git-based production deployment workflow
- **Platform Support**: GitHub, GitLab, and Gitea fully supported

### Backend Testing
- **POST** `/api/projects/{id}/test-backend` - Test backend with streaming responses
- **GET** `/api/projects/{id}/backend-history` - Get backend test history
- **PUT** `/api/projects/{id}/backend-history/{historyId}` - Update backend test status
- **Tag**: `Backend Testing`
- **Use Case**: Test prompts against configured backend URLs
- **Features**: Streaming responses, performance metrics, template variables

### Settings Management
- **GET** `/api/projects/{id}/test-settings` - Get test settings from git
- **POST** `/api/projects/{id}/test-settings` - Save test settings to git
- **Tag**: `Settings`
- **Use Case**: Git-based settings storage and retrieval
- **Features**: Version control for configurations, team collaboration

## 🏷️ API Organization

Endpoints are organized into logical groups:

- **📁 Projects** - Project CRUD operations
- **📜 History** - Prompt history management  
- **⚡ Generation** - Response generation (streaming)
- **🧪 Backend Testing** - Backend testing and validation
- **🔀 Git** - Git platform authentication and operations
- **⚙️ Settings** - Git-based settings management
- **🌍 External API** - Integration endpoints
- **📖 Documentation** - API information

## 🔗 Template Variables

The API supports dynamic prompt templates using `{{variable_name}}` syntax:

**Template Example:**
```
Hello {{name}}, you are {{age}} years old and live in {{city}}.
```

**Variables:**
```json
{
  "name": "Alice",
  "age": "25", 
  "city": "New York"
}
```

**Result:**
```
Hello Alice, you are 25 years old and live in New York.
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
            user_prompt: 'Tell me about {{topic}}',
            system_prompt: 'You are a helpful assistant',
            variables: { topic: 'AI' },
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
- **404** - Resource not found
- **422** - Validation error
- **500** - Internal server error

Error responses include descriptive messages:
```json
{
  "detail": "Project not found"
}
```