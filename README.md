# Prompt Experimentation Tool

A web application built with PatternFly for experimenting with prompts using Llama Stack models. This tool allows you to create projects, configure model parameters, experiment with user and system prompts, use template variables, and track your prompt history.

## Features

- **Project Management**: Create and manage multiple projects with different Llama Stack configurations
- **Prompt Experimentation**: Enter user and system prompts with template variable support
- **Model Parameters**: Configure temperature, max_len, top_p, and top_k parameters
- **History Tracking**: View and manage your prompt/response history per project
- **Database Persistence**: SQLite database for storing projects and history
- **OpenShift Ready**: Includes Containerfile and Helm chart for deployment

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- A running Llama Stack server

### Local Development

1. **Start the Backend**:
   ```bash
   cd backend
   npm install
   npm run dev
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
   - **Llama Stack URL**: Your Llama Stack server URL (e.g., `http://localhost:8000`)
   - **Provider ID**: The model name available in your Llama Stack instance (e.g., `llama-3.1-8b-instruct`)

### Using Template Variables

You can use template variables in both user and system prompts:

1. In your prompts, use `{{variable_name}}` syntax
2. In the Variables section, define values as:
   ```
   name: John Doe
   age: 30
   city: New York
   ```

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

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get a specific project

### Prompt History
- `GET /api/projects/:id/history` - Get prompt history for a project
- `POST /api/projects/:id/history` - Save prompt history entry

### Generation
- `POST /api/projects/:id/generate` - Generate response using Llama Stack

## Development

### Project Structure

```
├── frontend/               # React frontend with PatternFly
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── types.ts       # TypeScript interfaces
│   │   ├── api.ts        # API client
│   │   └── App.tsx       # Main application
├── backend/               # Node.js/Express backend
│   └── src/
│       ├── database.ts   # SQLite database manager
│       └── index.ts      # Express server
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
- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Start production server

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