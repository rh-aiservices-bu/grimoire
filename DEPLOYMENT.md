# Deployment Guide

This application consists of two separate microservices that can be deployed independently:

## Architecture

- **Backend**: Python FastAPI service (Port 3001)
- **Frontend**: React SPA served by Nginx (Port 80)

## Environment Configuration

### Frontend Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `VITE_BACKEND_URL` | Backend API URL | `http://localhost:3001` | `https://api.example.com` |

### Backend Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DATABASE_URL` | SQLite database path | `sqlite:///data/grimoire.db` | `sqlite:///app/data/db.sqlite` |

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
python -m venv venv
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
docker build -t grimoire-backend -f Containerfile .

# Run
docker run -p 3001:3001 \
  -v grimoire_data:/app/data \
  -e DATABASE_URL=sqlite:///data/grimoire.db \
  grimoire-backend
```

### Frontend Container

```bash
# Build
cd frontend
docker build -t grimoire-frontend \
  --build-arg VITE_BACKEND_URL=http://your-backend-url:3001 \
  -f Containerfile .

# Run
docker run -p 80:80 grimoire-frontend
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
          value: "sqlite:///data/grimoire.db"
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

## Health Checks

Both services include health check endpoints:

- **Backend**: `GET /` returns API status
- **Frontend**: `GET /health` returns "healthy"

## Database Persistence

The backend uses SQLite with a persistent volume mount at `/app/data`. Ensure this directory is backed up and persisted across container restarts.

## Security Considerations

- Use HTTPS in production
- Configure proper CORS origins
- Set up authentication if needed
- Use secrets for sensitive environment variables
- Regular security updates for base images

## Monitoring

Both containers include health checks and can be monitored using:
- Container health status
- HTTP endpoint monitoring
- Log aggregation
- Resource usage metrics