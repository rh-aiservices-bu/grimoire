# Grimoire - Production Deployment Guide

This comprehensive guide covers deployment strategies for Grimoire, an enterprise-grade AI prompt experimentation platform with advanced Git integration, real-time streaming, and production workflow capabilities.

## 🏗️ Architecture Overview

Grimoire consists of two independently deployable microservices with enterprise-ready features:

- **🐍 Backend**: FastAPI service with SQLAlchemy ORM, multi-Git platform integration, and SSE streaming (Port 3001)
- **⚛️ Frontend**: React SPA with TypeScript, PatternFly UI, and Nginx serving (Port 80)
- **🗃️ Database**: SQLite with persistent volume support (configurable for PostgreSQL/MySQL)
- **🔗 Git Integration**: Multi-platform support (GitHub/GitLab/Gitea) with encrypted credential storage

## ⚙️ Environment Configuration

### **Frontend Environment Variables**

| Variable | Description | Default | Example | Notes |
|----------|-------------|---------|---------|-------|
| `VITE_BACKEND_URL` | Backend API URL | `http://localhost:3001` | `https://api.example.com` | Build-time variable for API endpoint |

### **Backend Environment Variables**

| Variable | Description | Default | Example | Notes |
|----------|-------------|---------|---------|-------|
| `DATABASE_URL` | Database connection string | `sqlite:///data/grimoire.db` | `sqlite:///app/data/db.sqlite` | Supports SQLite, PostgreSQL, MySQL |
| `CORS_ORIGINS` | Allowed CORS origins | `["*"]` | `["https://app.example.com"]` | OpenShift-compatible, comma-separated |
| `LLAMA_STACK_DEFAULT_URL` | Default LlamaStack URL | None | `http://llama-stack:8000` | Optional default for new projects |
| `GIT_ENCRYPTION_KEY` | Fernet encryption key | Auto-generated | `base64-encoded-key` | For Git credential encryption |

## Local Development

### Using Docker Compose

```bash
# Build and run both services
docker-compose up --build

# Frontend: http://localhost
# Backend: http://localhost:3001
# API Docs: http://localhost:3001/docs
```

### Manual Setup

#### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

#### Frontend
```bash
cd frontend
npm install
echo "VITE_BACKEND_URL=http://localhost:3001" > .env
npm run dev
```

## Container Deployment

### Backend Container

```bash
# Build
cd backend
podman build -t grimoire-backend -f Containerfile .

# Run
podman run -p 3001:3001 \
  -v grimoire_data:/app/data \
  -e DATABASE_URL=sqlite:///app/data/grimoire.db \
  grimoire-backend
```

### Frontend Container

```bash
# Build
cd frontend
podman build -t grimoire-frontend \
  --build-arg VITE_BACKEND_URL=http://your-backend-url:3001 \
  -f Containerfile .

# Run
podman run -p 80:80 grimoire-frontend
```

## Kubernetes Deployment

### Backend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grimoire-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grimoire-backend
  template:
    metadata:
      labels:
        app: grimoire-backend
    spec:
      containers:
      - name: backend
        image: grimoire-backend:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          value: "sqlite:///app/data/grimoire.db"
        volumeMounts:
        - name: data
          mountPath: /app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: grimoire-data
---
apiVersion: v1
kind: Service
metadata:
  name: grimoire-backend-service
spec:
  selector:
    app: grimoire-backend
  ports:
  - port: 3001
    targetPort: 3001
  type: ClusterIP
```

### Frontend Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grimoire-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: grimoire-frontend
  template:
    metadata:
      labels:
        app: grimoire-frontend
    spec:
      containers:
      - name: frontend
        image: grimoire-frontend:latest
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: grimoire-frontend-service
spec:
  selector:
    app: grimoire-frontend
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

## OpenShift Deployment

### Build Configs

```yaml
# Backend BuildConfig
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata:
  name: grimoire-backend
spec:
  source:
    type: Git
    git:
      uri: https://your-repo.git
    contextDir: backend
  strategy:
    type: Docker
    dockerStrategy:
      dockerfilePath: Containerfile
  output:
    to:
      kind: ImageStreamTag
      name: grimoire-backend:latest

---
# Frontend BuildConfig
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata:
  name: grimoire-frontend
spec:
  source:
    type: Git
    git:
      uri: https://your-repo.git
    contextDir: frontend
  strategy:
    type: Docker
    dockerStrategy:
      dockerfilePath: Containerfile
      buildArgs:
      - name: VITE_BACKEND_URL
        value: "http://grimoire-backend-service:3001"
  output:
    to:
      kind: ImageStreamTag
      name: grimoire-frontend:latest
```

### Routes

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: grimoire-frontend
spec:
  to:
    kind: Service
    name: grimoire-frontend-service
  port:
    targetPort: 80
  tls:
    termination: edge
```

## 🏥 Health Checks & Monitoring

### **Health Check Endpoints**
- **Backend**: `GET /api` - OpenShift-compatible health endpoint with detailed status information
- **Frontend**: Nginx health check via main route availability
- **Debug**: `GET /api/debug/projects` - Development debugging with project relationships

### **Monitoring Capabilities**
- **🔍 Application Metrics**: Request counts, response times, error rates via FastAPI built-in metrics
- **📊 Database Health**: Connection pool status, query performance, and transaction monitoring
- **🔗 Git Integration Status**: Authentication status, repository connectivity, and PR synchronization health
- **🌊 Streaming Metrics**: Active SSE connections, stream latency, and connection duration tracking

## 🗃️ Database & Persistence

### **Database Options**
- **SQLite** (default): File-based database with persistent volume support at `/app/data/grimoire.db`
- **PostgreSQL**: Enterprise database support via SQLAlchemy (configure `DATABASE_URL`)
- **MySQL**: Alternative enterprise database option with full feature support

### **Data Persistence Strategy**
- **Database Files**: Persistent volume mount at `/app/data` for SQLite database files
- **Git Cache**: Cached Git commit data stored in database for performance optimization
- **Encrypted Credentials**: Fernet-encrypted Git tokens stored securely in database
- **Backup Considerations**: Regular database backups, Git credential recovery procedures

## 🔒 Security & Production Considerations

### **Security Features**
- **🔐 HTTPS Enforcement**: SSL/TLS termination at ingress level with redirect policies
- **🛡️ CORS Configuration**: Strict origin validation with environment-specific allowed origins
- **🔑 Credential Encryption**: Fernet symmetric encryption for all Git platform tokens
- **⚡ Rate Limiting**: Git API rate limiting to prevent abuse and API quota exhaustion
- **🧹 Input Validation**: Comprehensive request validation with Pydantic schemas
- **🚫 Error Sanitization**: Secure error messages preventing information disclosure

### **Production Hardening**
- **🐳 Non-root Containers**: All containers run as non-root users for enhanced security
- **🔄 Security Updates**: Regular base image updates with automated vulnerability scanning
- **📝 Audit Logging**: Comprehensive request logging and Git operation audit trails
- **🔍 Secret Management**: Kubernetes secrets integration for sensitive environment variables
- **🌐 Network Policies**: Restricted network access with ingress/egress rules

## 📊 Monitoring & Observability

### **Application Monitoring**
- **📈 Metrics Collection**: Prometheus-compatible metrics endpoint for monitoring integration
- **📋 Health Dashboard**: Real-time health status via OpenShift-compatible health checks
- **🔔 Alerting**: Custom alerts for Git authentication failures, streaming connection issues, and database errors
- **📊 Performance Tracking**: Response time monitoring, database query performance, and streaming latency

### **Logging Strategy**
- **📝 Structured Logging**: JSON-formatted logs with correlation IDs for request tracing
- **🗂️ Log Aggregation**: ELK stack or Fluentd integration for centralized log management
- **🔍 Debug Capabilities**: Configurable log levels with development debugging endpoints
- **📈 Metrics Export**: OpenTelemetry support for advanced observability and tracing