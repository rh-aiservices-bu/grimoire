# Grimoire - Prompt Experimentation Tool - Frontend

A React-based frontend application built with TypeScript, Vite, and PatternFly for experimenting with prompts using Llama Stack models.

## Technology Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: PatternFly (React)
- **Styling**: CSS Modules
- **State Management**: React Hooks
- **API Client**: Fetch API with streaming support
- **Development**: Hot Module Replacement (HMR) with Fast Refresh

## Features

### Core Functionality
- **Project Management**: Create, edit, and delete projects with Llama Stack configurations
- **Prompt Experimentation**: Interactive prompt editor with template variables
- **Backend Testing**: Test prompts against configured backend URLs with streaming responses
- **History Tracking**: View and manage prompt/response history with ratings and notes
- **Git Integration**: Connect to GitHub/GitLab/Gitea for production workflow

### UI Components
- **ProjectList**: Main project dashboard with search and filtering
- **ProjectModal**: Create new projects with validation
- **ProjectEditModal**: Edit existing project configurations
- **PromptExperimentView**: Main prompt experimentation interface
- **BackendTesting**: Dedicated backend testing interface
- **HistoryLog**: View and manage prompt history
- **GitAuthModal**: Git platform authentication
- **NotesModal**: Add detailed notes to prompts
- **ApiDocumentationModal**: Interactive API documentation
- **Branded Header**: Features the Grimoire logo and consistent application branding

### Advanced Features
- **Streaming Responses**: Real-time display of model outputs
- **Template Variables**: Dynamic prompt templates using `{{variable_name}}` syntax
- **Production Workflow**: Create Pull Requests for production deployments
- **Dual History Views**: Switch between experimental and production history
- **Real-time Sync**: Auto-refresh production data from git repositories
- **Performance Metrics**: Response time and HTTP status tracking

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
```bash
cd frontend
npm install
```

### Development Server
```bash
npm run dev
```
Access the application at http://localhost:5173

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── ApiDocumentationModal.tsx
│   │   ├── BackendTesting.tsx
│   │   ├── DeleteProjectModal.tsx
│   │   ├── GitAuthModal.tsx
│   │   ├── HistoryLog.tsx
│   │   ├── NotesModal.tsx
│   │   ├── ProdConfirmationModal.tsx
│   │   ├── ProjectEditModal.tsx
│   │   ├── ProjectList.tsx
│   │   ├── ProjectModal.tsx
│   │   └── PromptExperimentView.tsx
│   ├── types.ts            # TypeScript type definitions
│   ├── api.ts              # API client with streaming support
│   ├── App.tsx             # Main application component
│   ├── App.css             # Global styles
│   ├── index.css           # Base styles
│   └── main.tsx            # Application entry point
├── public/                 # Static assets
│   ├── grimoire-logo.png   # Application logo
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
├── eslint.config.js       # ESLint configuration
└── nginx.conf             # Nginx configuration for production
```

## Configuration

### Environment Variables
Create a `.env` file in the frontend directory:
```env
VITE_API_URL=http://localhost:3001
```

### TypeScript Configuration
The project uses strict TypeScript settings with path mapping and modern ES features.

### ESLint Configuration
Includes React-specific rules and TypeScript type checking for production-ready code quality.

## API Integration

The frontend communicates with the backend through:
- **REST API**: Standard CRUD operations
- **Server-Sent Events**: Real-time streaming for generation and testing
- **WebSocket-like**: Long-lived connections for git synchronization

## Container Support

### Development
```bash
docker build -t prompt-tool-frontend:dev -f Containerfile .
docker run -p 3000:3000 prompt-tool-frontend:dev
```

### Production
The frontend is served by Nginx with optimized static asset delivery and API proxying.

## Performance Optimizations

- **Code Splitting**: Lazy loading of components
- **Asset Optimization**: Vite's built-in asset optimization
- **Streaming Support**: Efficient real-time data handling
- **Caching**: Smart API response caching
- **Bundle Size**: Optimized PatternFly imports

## Contributing

1. Follow the existing code style and patterns
2. Use TypeScript for type safety
3. Test components thoroughly
4. Ensure responsive design compatibility
5. Add proper error handling

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Troubleshooting

### Common Issues
- **API Connection**: Ensure backend is running on port 3001
- **CORS Issues**: Check proxy configuration in vite.config.ts
- **Build Failures**: Clear node_modules and reinstall dependencies
- **TypeScript Errors**: Run `npm run type-check` for detailed error information

### Performance Issues
- Check network tab for slow API calls
- Monitor memory usage with React DevTools
- Verify streaming connections are properly closed
