# Grimoire - Llama Stack Prompt Experimentation Tool

A comprehensive web application designed specifically for experimenting with and productionizing AI prompts. Provides seamless integration with Llama Stack servers for real-time prompt testing, streaming responses, and production deployment workflows.

## Features

- **Llama Stack Integration**: Direct connection to Llama Stack servers with configurable provider IDs
- **Model Parameter Control**: Fine-tune temperature, max_len, top_p, and top_k for Llama models
- **Streaming Responses**: Real-time streaming output from Llama Stack inference
- **Prompt Experimentation**: Interactive editor with template variables (`{{variable}}`)
- **Git Integration**: GitHub/GitLab/Gitea support with Pull Request workflow
- **Production Ready**: Container deployment with Helm charts

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

### Deployment
```bash
# Container
podman build -t grimoire:latest -f Containerfile .

# Kubernetes
helm install grimoire ./helm
```

## API Endpoints

- **GET** `/api/projects-models` - List projects and models
- **GET** `/prompt/{project}/{provider}` - Get prompt configuration
- **GET** `/prompt/{project}/{provider}/prod` - Get production configuration

## License

MIT License