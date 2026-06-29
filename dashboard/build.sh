#!/bin/bash
# NAS Deployment Build Script
# Builds the React frontend and copies it into the backend's public/ directory.
# Use this only if you are NOT running via Docker.
# For Docker deployments, simply run: docker-compose up -d
set -e

echo "==> Building frontend..."
cd frontend
npm install
npx vite build
echo "==> Frontend built successfully"

echo "==> Copying built frontend to backend/public..."
mkdir -p ../backend/public
cp -r dist/. ../backend/public/
echo "==> Files copied"

echo "==> Installing backend dependencies..."
cd ../backend
npm install
echo "==> Build complete!"
echo ""
echo "Start the server with:"
echo "  cd backend && node src/index.js"
