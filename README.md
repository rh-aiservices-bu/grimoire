# Grimoire - AI Prompt Experimentation & Production Platform

A comprehensive web application designed for experimenting with, testing, and productionizing AI prompts. Provides seamless integration with Llama Stack servers, dedicated backend testing capabilities, evaluation systems, and GitOps workflows for enterprise-grade prompt management.

## Features

### Core Functionality
- **Llama Stack Integration**: Direct connection to Llama Stack servers with configurable provider IDs
- **Model Parameter Control**: Fine-tune temperature, max_len, top_p, and top_k for Llama models
- **Streaming Responses**: Real-time streaming output from Llama Stack inference
- **Prompt Experimentation**: Interactive editor with template variables (`{{variable}}`)
- **Backend Testing**: Dedicated testing framework for external API validation
- **Evaluation System**: Automated prompt evaluation with HuggingFace dataset integration

### Production & Workflow
- **GitOps Integration**: GitHub/GitLab/Gitea support with Pull Request workflows
- **Production API**: External endpoints for retrieving production-ready prompts
- **History Tracking**: Comprehensive prompt and test history with ratings and notes
- **Secure Authentication**: Encrypted Git credential storage with multi-platform support

### Deployment & Infrastructure
- **Container Ready**: OpenShift-compatible containers with health checks
- **Kubernetes Support**: Complete Helm charts with ingress and persistent storage
- **Development Tools**: Docker Compose setup and workbench containers

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

## Key API Endpoints

### External Integration APIs
- **GET** `/api/projects-models` - List available projects and models
- **GET** `/prompt/{project}/{provider}` - Get latest prompt configuration  
- **GET** `/prompt/{project}/{provider}/prod` - Get production prompt from Git

### Interactive Documentation
- **Swagger UI**: http://localhost:3001/docs
- **ReDoc**: http://localhost:3001/redoc
- **OpenAPI Spec**: http://localhost:3001/openapi.json

### Core Features
- **POST** `/api/projects/{id}/test-backend` - Test backend APIs with streaming
- **POST** `/api/projects/{id}/history/{historyId}/tag-prod` - Create production PR  
- **POST** `/api/git/auth` - Authenticate with Git platforms (GitHub/GitLab/Gitea)

## License

MIT License