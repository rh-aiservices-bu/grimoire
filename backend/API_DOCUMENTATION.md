# Prompt Experimentation Tool API Documentation

## 🌐 Interactive Documentation

The API provides comprehensive interactive documentation through multiple interfaces:

- **Swagger UI**: http://localhost:3001/docs - Interactive testing interface
- **ReDoc**: http://localhost:3001/redoc - Clean documentation interface  
- **OpenAPI JSON**: http://localhost:3001/openapi.json - Raw specification

## 🚀 Quick Start

### 1. List All Projects and Models
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
      "llamastack_url": "http://llamastack-server.example.com"
    },
    {
      "name": "newone", 
      "provider_id": "llama-3.2-3b",
      "llamastack_url": "http://llamastack-server.example.com"
    }
  ]
}
```

### 2. Get Latest Prompt Configuration
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
  }
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

## 🏷️ API Organization

Endpoints are organized into logical groups:

- **📁 Projects** - Project CRUD operations
- **📜 History** - Prompt history management  
- **⚡ Generation** - Response generation (streaming)
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