# Grimoire - AI Prompt Experimentation Platform - Frontend

A React-based frontend application built with TypeScript, Vite, and PatternFly for experimenting with prompts, testing backends, and managing AI model workflows in production environments.

## Technology Stack

- **Framework**: React 18.3.1 + TypeScript 5.8
- **Build Tool**: Vite 7.0+ with optimized builds
- **UI Library**: PatternFly 6.2+ (Red Hat Design System)
- **Styling**: CSS Modules + PatternFly overrides
- **State Management**: React Hooks + Context API
- **HTTP Client**: Axios with streaming support
- **Routing**: React Router 6.28+
- **Testing**: Vitest + React Testing Library + Coverage
- **Development**: HMR with React Fast Refresh

## Features

### Core Functionality
- **Project Management**: Create, edit, and delete projects with Llama Stack configurations
- **Prompt Experimentation**: Interactive prompt editor with template variables (`{{variable}}`)
- **Backend Testing**: Dedicated testing interface for external API validation with streaming
- **Evaluation System**: Integrated prompt evaluation with dataset support and metrics
- **History Tracking**: Comprehensive prompt/response/test history with ratings and detailed notes
- **Git Integration**: Multi-platform Git support (GitHub/GitLab/Gitea) for production workflows
- **Production API**: External endpoints for retrieving production-ready prompt configurations

### UI Components & Architecture

**Main Views:**
- **ProjectList**: Main dashboard with search, filtering, and project management
- **PromptExperimentView**: Interactive prompt testing and experimentation interface
- **BackendTesting**: Dedicated backend API testing with performance metrics
- **HistoryLog**: Unified view of prompt, backend test, and evaluation history

**Modal Components:**
- **ProjectModal/ProjectEditModal**: Project creation and configuration management
- **GitAuthModal**: Multi-platform Git authentication (GitHub/GitLab/Gitea)
- **NotesModal**: Detailed annotation system for prompts and tests
- **ApiDocumentationModal**: Interactive API documentation with examples
- **DeleteProjectModal**: Safe project deletion with confirmation
- **ProdConfirmationModal**: Production deployment confirmation workflow

**Shared Components:**
- **AppContext**: Global application state and configuration management
- **Branded Header**: Grimoire logo and consistent Red Hat design patterns

### Advanced Features
- **Streaming Responses**: Real-time token-by-token display of model outputs and backend responses
- **Template Variables**: Dynamic prompt templates using `{{variable_name}}` syntax with validation
- **GitOps Workflow**: Create Pull Requests for production deployments with branch management
- **Multi-view History**: Switch between experimental, backend test, and production history views
- **Real-time Sync**: Auto-refresh production data from Git repositories with caching
- **Performance Analytics**: Detailed response times, HTTP status codes, and error tracking
- **Evaluation Integration**: Automated prompt evaluation with scoring and dataset management
- **Secure Authentication**: Encrypted Git credential storage with platform-specific token support

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

### Testing
```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Build for Production
```bash
npm run build
```

### Code Quality
```bash
# Lint code
npm run lint

# Preview production build
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/         # Organized component library
│   │   ├── modals/         # Modal components
│   │   │   ├── ApiDocumentationModal.tsx
│   │   │   ├── DeleteProjectModal.tsx
│   │   │   ├── GitAuthModal.tsx
│   │   │   ├── NotesModal.tsx
│   │   │   ├── ProdConfirmationModal.tsx
│   │   │   ├── ProjectEditModal.tsx
│   │   │   ├── ProjectModal.tsx
│   │   │   └── index.tsx   # Modal exports
│   │   └── shared/         # Shared components
│   │       ├── BackendTesting.tsx
│   │       ├── HistoryLog.tsx
│   │       └── index.tsx   # Shared exports
│   ├── pages/              # Route-based pages
│   │   ├── ProjectList/
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectList.test.tsx
│   │   │   └── index.tsx
│   │   └── PromptExperiment/
│   │       ├── PromptExperimentView.tsx
│   │       └── index.tsx
│   ├── services/           # API and business logic
│   │   ├── auth.ts         # Authentication services
│   │   ├── projects.ts     # Project management
│   │   └── index.ts        # Service exports
│   ├── context/            # React Context
│   │   └── AppContext.tsx  # Global state management
│   ├── styles/             # Styling
│   │   ├── index.css       # Global styles
│   │   └── patternfly-overrides.css
│   ├── test/               # Test configuration
│   │   └── setup.ts        # Vitest setup
│   ├── types.ts            # TypeScript definitions
│   ├── api.ts              # HTTP client with streaming
│   ├── App.tsx             # Root component
│   ├── App.test.tsx        # App tests
│   └── main.tsx            # Application entry
├── public/                 # Static assets
│   ├── grimoire-logo.png   # Branding
│   └── vite.svg            # Vite logo
├── dist/                   # Build output
├── node_modules/           # Dependencies
├── Containerfile           # Container build config
├── nginx.conf              # Production web server
├── package.json            # Project configuration
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Build configuration
├── vitest.config.ts        # Test configuration
└── eslint.config.js        # Linting rules
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
- **REST API**: Standard CRUD operations with comprehensive error handling
- **Server-Sent Events**: Real-time streaming for Llama Stack inference and backend testing
- **Streaming HTTP**: Long-lived connections for Git synchronization and real-time updates
- **Production APIs**: External endpoints for retrieving production prompt configurations
- **Git Integration**: Secure authentication and repository management APIs

## Container Support

### Development
```bash
# Build development container
podman build -t grimoire-frontend:dev -f Containerfile .
podman run -p 3000:80 grimoire-frontend:dev
```

### Production
```bash
# Multi-stage production build
podman build -t grimoire-frontend:prod -f Containerfile .

# Run with custom backend URL
podman build --build-arg VITE_BACKEND_URL=https://api.example.com -t grimoire-frontend:prod .
```

The frontend is served by Nginx with:
- Optimized static asset delivery with compression
- API proxying and CORS handling
- Security headers and caching strategies
- OpenShift-compatible non-root user configuration

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
