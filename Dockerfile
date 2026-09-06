# Stage 1: Build Environment
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (for better caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the Control Plane & Dashboard (Vite & ESBuild)
RUN npm run build

# Build the standalone Edge Agent CLI (ESBuild)
RUN npm run build:agent

# Stage 2: Production Environment
FROM node:22-alpine AS runner

WORKDIR /app

# We only need the bundled artifacts from the builder stage
# No node_modules are needed because ESBuild bundled our dependencies
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json

ENV NODE_ENV=production
ENV PORT=3000

# Expose port for Cloud Run / Container ingress
EXPOSE 3000

# Run the compiled, optimized Control Plane server
CMD ["node", "dist/server.cjs"]
