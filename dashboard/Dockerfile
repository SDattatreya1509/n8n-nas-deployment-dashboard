# NAS Deployment Dockerfile
# Build context: nas-deployment/Website-Generator/dashboard/
# Run with:  docker-compose -f docker-compose.yml up -d  (from this folder)
#
# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:18-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production backend ───────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Install backend dependencies (production only)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy built frontend so Express serves it as static files
COPY --from=frontend-builder /build/frontend/dist ./public

# Create default mount points (overridden by docker-compose volumes at runtime)
RUN mkdir -p /app/data /nas/data /nas/projects

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "src/index.js"]
