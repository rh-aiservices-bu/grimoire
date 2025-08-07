# Grimoire - AI Prompt Experimentation Platform - Frontend

A modern, enterprise-grade React application built with TypeScript, Vite, and PatternFly for advanced prompt experimentation, backend testing, and production AI workflow management. Features real-time streaming, comprehensive Git integration, and evaluation systems.

## 🚀 Technology Stack

- **⚛️ Framework**: React 18.3.1 with TypeScript 5.8.3 for type-safe development
- **⚡ Build Tool**: Vite 7.0.4 with optimized builds, HMR, and advanced chunk splitting
- **🎨 UI Library**: PatternFly 6.2.3 (Red Hat Design System) for enterprise-ready components
- **💅 Styling**: PatternFly CSS with custom overrides and utility classes
- **🗃️ State Management**: React Context API with useReducer for predictable state transitions
- **🌐 HTTP Client**: Axios 1.10.0 for REST APIs with Server-Sent Events for real-time streaming
- **🧭 Routing**: React Router 6.28.0 for client-side navigation with protected routes
- **🧪 Testing**: Vitest 3.0.1 + React Testing Library 16.1.0 + Coverage reporting with JSDOM
- **🔧 Development**: Hot Module Replacement with React Fast Refresh and proxy configuration

## 🎯 Features

### **⚡ Core Functionality**
- **📁 Project Management**: Create, edit, and delete projects with advanced Llama Stack configurations and Git integration
- **🔧 Prompt Experimentation**: Interactive playground with template variables (`{{variable}}`), real-time parameter tuning, and streaming responses
- **🧪 Backend Testing Framework**: Dedicated interface for testing external APIs with performance analytics and streaming validation
- **📊 Evaluation System**: Comprehensive prompt evaluation with LlamaStack scoring functions, dataset integration, and batch testing
- **📚 History Tracking**: Rich history management with ratings, detailed notes, search, and Git synchronization
- **🔗 Git Integration**: Full multi-platform support (GitHub/GitLab/Gitea) with automated PR workflows and repository management
- **🏭 Production API**: External REST endpoints for retrieving production-ready configurations with Git-based versioning
- **💬 Multi-Message Conversations**: Support for System/User/Assistant roles with contextual conversation flow
- **🧠 Thought Process Visualization**: Automatic extraction and display of model reasoning from `<think>` tags
- **🎯 Visual Promotion Pipeline**: Interactive Test → Production workflow with approval gates and status tracking
- **📋 Modern Sidebar Navigation**: Clean, organized navigation with project branding and feature categorization

### **🏗️ Component Architecture**

**📱 Main Views:**
- **`ProjectList`**: Dashboard with project gallery, search/filtering, and creation workflows
- **`PromptExperimentView`**: Main experimentation interface with modern sidebar navigation and multi-tab functionality
- **`PlaygroundPage`**: Interactive prompt testing with multi-message conversations, streaming responses, and advanced parameter controls
- **`PromptHistoryPage`**: Visual prompt browser with production promotion workflow, status tracking, and detailed prompt cards
- **`BackendTesting`**: Dedicated backend API testing with chat interface, evaluation tab, and real-time streaming metrics
- **`HistoryLog`**: Unified view of prompt, backend test, and evaluation history with Git integration and status indicators

**🪟 Modal Components:**
- **`ProjectModal`/`ProjectEditModal`**: Advanced project creation and configuration with Git repository setup
- **`GitAuthModal`**: Multi-platform Git authentication with platform-specific token support
- **`NotesModal`**: Rich text annotation system for prompts and tests with markdown support
- **`ApiDocumentationModal`**: Interactive API documentation with live examples and code snippets
- **`DeleteProjectModal`**: Safe project deletion with cascade confirmation and data preservation options
- **`ProdConfirmationModal`**: Production deployment workflow with approval gates and Git PR creation

**🔧 Shared Components:**
- **`AppContext`**: Centralized state management with useReducer pattern and action dispatching
- **`LeftNavigation`**: Modern sidebar navigation with Grimoire branding, organized feature sections, and project-specific menu items
- **Custom Hooks**: Reusable logic for API calls, streaming, and state management
- **Conversation Components**: Multi-message conversation interface with role selection and message management
- **Request Preview Components**: JSON payload display with syntax highlighting and copy functionality
- **Status Indicators**: Production/Test status badges and deployment pipeline visualization

### **🚀 Advanced Features**
- **🌊 Real-time Streaming**: Server-Sent Events (SSE) for token-by-token response display with connection management
- **🔧 Template Engine**: Dynamic `{{variable_name}}` substitution with validation, type checking, and live preview functionality
- **🔄 GitOps Workflow**: Automated Pull Request creation for production deployments with branch management and merge tracking
- **📈 Multi-view History**: Seamless switching between experimental, backend test, and production history with unified search
- **⚡ Real-time Sync**: Live synchronization with Git repositories, PR status updates, and automatic refresh
- **📊 Performance Analytics**: Comprehensive metrics including response times, HTTP status codes, token counts, and error tracking
- **🧠 Evaluation Integration**: Advanced prompt evaluation with LlamaStack scoring, dataset management, and batch processing
- **🔐 Secure Authentication**: Fernet-encrypted Git credential storage with platform-specific token handling and validation
- **💭 Thought Process Display**: Automatic parsing and visualization of model reasoning from structured thinking tags
- **🎯 Production Status Dashboard**: Real-time monitoring of deployment pipeline with pending PR tracking and approval workflow
- **📋 Interactive Request Builder**: "See Request" modal with JSON payload display and copy-to-clipboard cURL commands
- **🏷️ Enhanced Conversation Management**: Role-based message system with System/User/Assistant context preservation

## Development Setup

### Prerequisites
- Node.js 18+ (recommended: Node.js 20+)
- npm or yarn package manager

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
VITE_BACKEND_URL=http://localhost:3001
```

### TypeScript Configuration
The project uses strict TypeScript settings with path mapping and modern ES features.

### ESLint Configuration
Includes React-specific rules and TypeScript type checking for production-ready code quality.

## 🌐 API Integration & Communication

The frontend implements sophisticated communication patterns with the backend:

### **🔄 REST API Integration**
- **CRUD Operations**: Full project, prompt, and history management with optimistic updates  
- **Error Handling**: Comprehensive error boundaries with user-friendly messages and retry logic
- **Request Interception**: Axios interceptors for authentication, logging, and request/response transformation
- **Loading States**: Fine-grained loading indicators for individual operations and bulk actions

### **🌊 Real-time Streaming**
- **Server-Sent Events (SSE)**: Token-by-token response streaming for LlamaStack inference with backpressure handling
- **Backend Testing Streams**: Real-time streaming of external API test responses with performance metrics
- **Connection Management**: Automatic reconnection, heartbeat monitoring, and graceful degradation
- **Stream Processing**: Efficient delta parsing, buffering, and UI updates with minimal re-renders
- **Conversation Streaming**: Multi-message conversation support with role-based streaming and context preservation
- **Thought Process Streaming**: Real-time extraction and display of model reasoning during response generation

### **🔗 Git Integration APIs**
- **Multi-platform Authentication**: Secure token management for GitHub, GitLab, and Gitea with automatic validation
- **Repository Operations**: Real-time PR creation, status tracking, and merge monitoring
- **Sync Operations**: Background synchronization with Git repositories and intelligent cache invalidation
- **History Integration**: Unified Git commit history with prompt versioning and production tracking
- **Settings Management**: Git-based test configuration storage with version control and team collaboration
- **Production Pipeline**: Visual promotion workflow with Test → Production approval gates and status monitoring

### **🏭 External Production APIs**
- **Configuration Retrieval**: Fetch production-ready prompt configurations with fallback mechanisms
- **Version Management**: Git-based versioning with database fallbacks for high availability
- **Integration Ready**: RESTful endpoints designed for external system integration with comprehensive documentation
- **Backend Testing Integration**: External API testing endpoints with streaming response validation and performance analytics
- **Evaluation APIs**: LLM-as-judge evaluation system with dataset integration and batch processing capabilities
- **Git Status APIs**: Quick authentication status checking and repository change monitoring

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

# Build with custom backend URL
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
