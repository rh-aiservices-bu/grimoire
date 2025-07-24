# Grimoire - AI Prompt Experimentation & Production Platform

A comprehensive enterprise-grade web application for experimenting with, testing, and productionizing AI prompts. Built with FastAPI and React, Grimoire provides seamless integration with Llama Stack servers, advanced backend testing capabilities, automated evaluation systems, and complete GitOps workflows for professional prompt management.

## 🚀 Features

### **Core Functionality**
- **🦙 Llama Stack Integration**: Direct connection to Llama Stack servers with configurable provider IDs and model parameters
- **🎛️ Advanced Model Controls**: Fine-tune temperature, max_len, top_p, and top_k parameters with real-time preview
- **📡 Streaming Responses**: Real-time Server-Sent Events (SSE) streaming from Llama Stack inference with delta updates
- **🔧 Template Variables**: Dynamic prompt templates using `{{variable}}` syntax with validation and substitution
- **🧪 Backend Testing Framework**: Comprehensive testing against external API endpoints with performance analytics
- **📊 Evaluation System**: Automated prompt evaluation with LlamaStack scoring functions and dataset integration
- **📝 Interactive History**: Rich prompt and test history with ratings, detailed notes, and search capabilities
- **💬 Multi-Message Conversations**: Support for System/User/Assistant role-based conversations with context management
- **🧠 Thought Process Extraction**: Automatic extraction and display of model reasoning from `<think>` tags
- **🎯 Prompt Management Interface**: Visual prompt browser with production promotion workflow and status tracking

### **Production & GitOps Workflow**
- **🔗 Multi-Git Platform Support**: Full integration with GitHub, GitLab, and Gitea (including self-hosted instances)
- **🔄 Automated Pull Requests**: Automatic PR creation for production deployments with branch management
- **🏭 Production API**: External REST endpoints for retrieving production-ready prompt configurations
- **🔐 Secure Authentication**: Fernet-encrypted Git credential storage with platform-specific token support
- **📈 Git History Integration**: Unified commit tracking and production prompt versioning
- **⚡ Real-time Sync**: Live PR status updates and repository synchronization
- **🎯 Test → Production Workflow**: Visual promotion pipeline with approval gates and production tracking
- **📋 Pending PR Dashboard**: Real-time monitoring of deployment status with merge tracking
- **⚙️ Git-based Settings**: Version-controlled test configurations and environment management

### **Enterprise Deployment**
- **🐳 Container-First Design**: OpenShift-compatible containers with non-root users and health checks
- **☸️ Kubernetes Native**: Complete Helm charts with ingress, persistent storage, and service mesh support
- **🛠️ Development Tools**: Docker Compose setup, development workbenches, and debugging containers
- **📦 Multi-Architecture**: Support for x86_64 and ARM64 container builds
- **🎨 Modern UI**: PatternFly React components with responsive design and enterprise branding
- **🧭 Intuitive Navigation**: Sidebar navigation with project-specific menus and organized feature sections

## Quick Start

### Prerequisites
- Python 3.8+, Node.js 18+, npm
- **Llama Stack server** running with available model providers (e.g., `llama-3.1-8b-instruct`)

### Development
```bash
# Backend
cd backend && python3 -m venv myenv && source myenv/bin/activate
pip install -r requirements.txt && python main.py

# Frontend (new terminal)  
cd frontend && npm install && npm run dev
```

Access at http://localhost:5173 (frontend) and http://localhost:3001 (backend API)

### Production Deployment

**Docker Compose:**
```bash
docker-compose up -d
```

**Container Build:**
```bash
# Standard deployment
podman build -t grimoire:latest -f Containerfile .

# Development workbench
podman build -t grimoire:workbench -f backend/Containerfile.workbench .
```

**Kubernetes:**
```bash
helm install grimoire ./helm --set ingress.enabled=true
```

## 🌐 API Reference

### **External Integration APIs**
- **GET** `/api/projects-models` - Discover available projects and model configurations
- **GET** `/prompt/{project_name}/{provider_id}` - Retrieve latest prompt configuration with variables
- **GET** `/prompt/{project_name}/{provider_id}/prod` - Get production-ready prompts from Git repository
- **POST** `/api/projects/{id}/test-backend` - Test prompts against external backend APIs with streaming
- **POST** `/api/projects/{id}/eval` - Run automated prompt evaluations with LLM-as-judge scoring
- **GET** `/api/projects/{id}/test-settings` - Retrieve Git-stored test configurations and variables

### **Interactive Documentation**
- **📖 Swagger UI**: http://localhost:3001/docs - Interactive API testing with live examples
- **📚 ReDoc**: http://localhost:3001/redoc - Clean, comprehensive API documentation
- **🔧 OpenAPI Spec**: http://localhost:3001/openapi.json - Machine-readable API specification
- **🏥 Health Check**: http://localhost:3001/api - OpenShift-compatible health endpoint

### **Core API Features**
- **🧪 Backend Testing**: `POST /api/projects/{id}/test-backend` - Stream external API tests with metrics
- **🚀 Generation**: `POST /api/projects/{id}/generate` - Stream LlamaStack responses with SSE
- **📊 Evaluation**: `POST /api/projects/{id}/eval` - Run automated evaluations with scoring
- **🔄 Production Workflow**: `POST /api/projects/{id}/history/{historyId}/tag-prod` - Create production PRs
- **🔐 Git Authentication**: `POST /api/git/auth` - Multi-platform Git integration (GitHub/GitLab/Gitea)
- **📈 History Management**: Full CRUD operations for prompt and test history with Git integration
- **⚙️ Settings Management**: `GET/POST /api/projects/{id}/test-settings` - Git-based configuration storage
- **📋 PR Tracking**: `GET /api/projects/{id}/pending-prs` - Real-time pull request status monitoring
- **🔬 Backend Test History**: `GET /api/projects/{id}/backend-history` - Comprehensive test result tracking
- **🎯 Test Promotion**: `POST /api/projects/{id}/backend-history/{historyId}/tag-prod` - Promote backend tests to production

### **Advanced Features**
- **🌊 Streaming Support**: Server-Sent Events for real-time responses with token-by-token updates
- **🔧 Template Engine**: Dynamic `{{variable}}` substitution with validation and live preview
- **📋 Git Operations**: Automated repository management, PR creation, and status tracking
- **⚙️ Settings Management**: Git-based configuration storage with version control
- **💬 Conversation Management**: Multi-turn dialogues with System/User/Assistant role support
- **🧠 Thought Extraction**: Automatic detection and display of model reasoning process
- **🎯 Visual Promotion Pipeline**: Interactive Test → Production workflow with approval gates
- **📈 Performance Analytics**: Response time tracking, error monitoring, and success metrics
- **📊 Dataset Integration**: HuggingFace dataset support for evaluation and batch processing

## License

MIT License