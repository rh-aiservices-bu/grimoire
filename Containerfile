# Frontend build stage
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Remove .env file to prevent build-time API URL substitution
RUN rm -f .env
RUN npm run build

# Production stage
FROM python:3.11-slim AS production
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Install serve to serve the frontend
RUN npm install -g serve

# Copy and install Python backend dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend files
COPY backend/ ./backend/

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy nginx configuration and create necessary directories
COPY nginx-proxy.conf /etc/nginx/sites-available/default
RUN mkdir -p /var/run && \
    touch /var/run/nginx.pid && \
    mkdir -p /opt/app-root/src

# Create startup script
RUN echo '#!/bin/bash\n\
cd /app/backend && python main.py &\n\
cd /app/frontend && serve -s dist -l 8080 &\n\
nginx -g "daemon off;" &\n\
wait' > /app/start.sh && chmod +x /app/start.sh

# Set proper permissions for non-root user
RUN chown -R 1001:0 /app && \
    chmod -R g+w /app && \
    chown -R 1001:0 /opt/app-root/src && \
    chmod -R g+w /opt/app-root/src && \
    chown -R 1001:0 /var/log/nginx && \
    chown -R 1001:0 /var/lib/nginx && \
    chown -R 1001:0 /etc/nginx && \
    chown -R 1001:0 /var/run && \
    chmod -R g+w /var/log/nginx && \
    chmod -R g+w /var/lib/nginx && \
    chmod -R g+w /etc/nginx && \
    chmod -R g+w /var/run

# Expose ports (nginx proxy on 8888 for OpenShift healthcheck compatibility)
EXPOSE 8888

# Environment variables
ENV PYTHONPATH=/app/backend
ENV DATABASE_URL=sqlite:////opt/app-root/src/grimoire.db

# Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD curl -f http://localhost:3001/api && curl -f http://localhost:8080/ || exit 1

# Switch to non-root user
USER 1001

CMD ["/app/start.sh"]