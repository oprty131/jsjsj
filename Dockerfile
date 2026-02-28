FROM node:18

# Install Lua
RUN apk add --no-cache lua5.3 lua5.3-dev

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies (CHANGED: use npm install instead of npm ci)
RUN npm install

# Copy application files
COPY . .

# Create temp directory with proper permissions
RUN mkdir -p /tmp/lua-dumper && chmod 777 /tmp/lua-dumper

# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e \\"require('http').get('http://localhost:3000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))\\"

# Start the application
CMD [\\"node\\", \\"server.js\\"]

