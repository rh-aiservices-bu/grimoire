# Prompt Experimentation Tool

A web application built with PatternFly for experimenting with prompts using Llama Stack models. This tool allows you to create projects, configure model parameters, experiment with user and system prompts, use template variables, and track your prompt history.

## Features

- **Project Management**: Create and manage multiple projects with different Llama Stack configurations and descriptions
- **Prompt Experimentation**: Enter user and system prompts with template variable support
- **Model Parameters**: Configure temperature, max_len, top_p, and top_k parameters
- **Backend Testing**: Test prompts against configured backend URLs with streaming responses and performance metrics
- **History Tracking**: View and manage your prompt/response history per project
- **Git Integration**: Connect projects to GitHub/GitLab/Gitea repositories for version control
- **Production Workflow**: Create Pull Requests for production prompt deployments
- **Settings Management**: Store and retrieve test configurations from Git repositories
- **Dual History Views**: Switch between experimental prompts and production git history
- **Rating & Notes**: Rate prompts with thumbs up/down and add detailed notes
- **Real-time Sync**: Auto-refresh production data from git repositories
- **Database Persistence**: SQLite database for storing projects and history
- **API Access**: External API endpoints for integration with other systems
- **OpenShift Ready**: Includes Containerfile and Helm chart for deployment

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+
- npm
- A running Llama Stack server

### Local Development

1. **Start the Backend**:
   ```bash
   cd backend
   python3 -m venv myenv
   source myenv/bin/activate
   pip install -r requirements.txt
   python main.py
   ```

2. **Start the Frontend** (in a new terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Access the Application**:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

### Creating Your First Project

1. Open the application in your browser
2. Click "Create New Project"
3. Fill in:
   - **Project Name**: A descriptive name for your project
   - **Description**: Optional description of your project
   - **Llama Stack URL**: Your Llama Stack server URL (e.g., `http://localhost:8000`)
   - **Provider ID**: The model name available in your Llama Stack instance (e.g., `llama-3.1-8b-instruct`)
   - **Test Backend URL**: Optional URL for testing prompts against a specific backend
   - **Git Repository URL** (optional): Connect to GitHub/GitLab/Gitea for version-controlled production prompts

### Git Integration Setup

For projects with git repositories:

1. **Authenticate with Git**: Click "Authenticate with Git" in the interface
2. **Choose Platform**: Select GitHub, GitLab, or Gitea
3. **Configure Platform**:
   - **GitHub**: Works with github.com and GitHub Enterprise
   - **GitLab**: Works with gitlab.com (leave server URL empty) or self-hosted GitLab instances
   - **Gitea**: Requires server URL for your Gitea instance
4. **Provide Credentials**:
   - Username: Your git platform username
   - Server URL: Required for Gitea, optional for self-hosted GitLab
   - Access Token: Platform-specific token with repository permissions
     - **GitHub**: Personal Access Token (Settings > Developer settings > Personal access tokens)
     - **GitLab**: Private Token (User Settings > Access Tokens)
     - **Gitea**: Access Token (User Settings > Applications > Access Tokens)

**Authentication Testing:**
- **GitHub**: Tests access to public repository `octocat/Hello-World`
- **GitLab**: Tests access to public repository `gitlab-org/gitlab`
- **Gitea**: Tests authentication using user info endpoint (`/api/v1/user`)
5. **Automatic Setup**: The system will create initial repository structure

### Production Workflow

With git integration enabled:

1. **Experiment**: Create and test prompts in experimental mode
2. **Tag for Production**: Click the star icon to create a Pull Request
3. **Review**: The system opens your git platform for PR review
4. **Merge**: Once merged, prompts become available via production API
5. **Monitor**: View production history from the git repository

### Using Template Variables

You can use template variables in both user and system prompts:

1. In your prompts, use `{{variable_name}}` syntax
2. In the Variables section, define values as:
   ```
   name: John Doe
   age: 30
   city: New York
   ```

### Backend Testing

The application includes a comprehensive backend testing feature:

1. **Access Testing**: Navigate to the "Backend Testing" tab in your project
2. **Configure Test**: Set up your test parameters:
   - User prompt with template variables
   - System prompt
   - Model parameters (temperature, max_len, top_p, top_k)
   - Variable values
3. **Run Tests**: Execute tests against your configured backend URL
4. **Monitor Results**: View streaming responses with performance metrics
5. **Save Settings**: Store test configurations in Git for team collaboration
6. **Review History**: Track all backend test results with timestamps and performance data

**Features:**
- **Streaming Responses**: Real-time display of model outputs
- **Performance Metrics**: Response time and HTTP status tracking
- **Template Variables**: Full support for dynamic prompt testing
- **Git Integration**: Version-controlled test settings
- **History Tracking**: Persistent storage of all test results

## Deployment

### Container Build

Build the container image:

```bash
podman build -t prompt-experimentation-tool:latest -f Containerfile .
```

### OpenShift/Kubernetes Deployment

Deploy using Helm:

```bash
helm install prompt-tool ./helm
```

### Configuration

Update `helm/values.yaml` to customize:

- Resource limits and requests
- Ingress configuration
- Persistent storage settings
- Environment variables

## API Endpoints

### Core API
- **Projects**: Full CRUD operations for project management
- **History**: Prompt history tracking with ratings and notes
- **Generation**: Streaming response generation using Llama Stack
- **Backend Testing**: Test prompts against external backends with metrics

### External Integration API
- **GET** `/api/projects-models` - List all projects and models for integration
- **GET** `/prompt/{project_name}/{provider_id}` - Get latest prompt configuration
- **GET** `/prompt/{project_name}/{provider_id}/prod` - Get production prompt configuration (from git when available)

### Git Integration
- **Authentication**: Support for GitHub, GitLab, and Gitea platforms
- **Production Workflow**: Create Pull Requests for production deployments
- **History Sync**: Real-time synchronization with git repositories
- **Settings Management**: Version-controlled test configurations

### Advanced Features
- **Streaming Responses**: Server-Sent Events for real-time output
- **Template Variables**: Dynamic prompt templates with `{{variable_name}}` syntax
- **Performance Metrics**: Response time and HTTP status tracking
- **Debug Endpoints**: Troubleshooting and development tools

For detailed API documentation with examples, see [backend/API_DOCUMENTATION.md](backend/API_DOCUMENTATION.md).

### Production Features
- **Git-based Production Workflow**: Create Pull Requests for production deployments
- **Backend Testing**: Comprehensive testing framework with streaming responses
- **Settings Management**: Version-controlled test configurations
- **Dual History Views**: Switch between experimental and production (git-based) history
- **Real-time Sync**: Auto-refresh production data from git repositories every 30 seconds
- **Smart Caching**: Optimized performance with incremental git synchronization
- **Pull Request Tracking**: Monitor pending PRs with live status updates
- **Version Control**: Full git history of production prompt changes
- **Fallback Support**: Works with or without git integration

**Platform Support for Production Workflow:**
- **GitHub**: ✅ Full support (PR creation, status tracking, history sync)
- **GitLab**: ✅ Full support (MR creation, status tracking, history sync)
- **Gitea**: ✅ Full support (PR creation, status tracking, history sync)

## Development

### Project Structure

```
├── frontend/               # React frontend with PatternFly
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── BackendTesting.tsx     # Backend testing interface
│   │   │   ├── ProjectModal.tsx       # Project creation modal
│   │   │   ├── ProjectEditModal.tsx   # Project editing modal
│   │   │   └── ...                    # Other components
│   │   ├── types.ts       # TypeScript interfaces
│   │   ├── api.ts        # API client
│   │   └── App.tsx       # Main application
├── backend/               # Python FastAPI backend
│   ├── main.py           # FastAPI application
│   ├── models.py         # SQLAlchemy database models
│   ├── schemas.py        # Pydantic schemas
│   ├── database.py       # Database connection
│   ├── git_service.py    # Git integration service
│   └── requirements.txt  # Python dependencies
├── helm/                 # Helm chart for Kubernetes
├── Containerfile         # Container build file
└── README.md
```

### Available Scripts

**Frontend**:
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

**Backend**:
- `python main.py` - Start FastAPI development server
- `uvicorn main:app --reload` - Start with auto-reload
- `python migrate_prod.py` - Run database migrations

## Environment Variables

- `PORT` - Backend server port (default: 3001)
- `NODE_ENV` - Environment mode (development/production)

## Troubleshooting

### Backend Connection Issues
- Ensure the backend server is running on port 3001
- Check that your Llama Stack server is accessible
- Verify the Llama Stack URL and provider ID in your project configuration

### Database Issues
- The SQLite database is created automatically in the backend directory
- Ensure write permissions for the backend process

### Container Issues
- Make sure all dependencies are installed before building
- Check that the container has access to required ports (3000, 3001)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.