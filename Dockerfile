FROM node:18

# Install Lua (Debian uses apt-get, not apk)
RUN apt-get update && apt-get install -y lua5.3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create temp directory with proper permissions
RUN mkdir -p /tmp/lua-dumper && chmod 777 /tmp/lua-dumper

# Expose port (Render/Railway sets PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start the application
CMD ["node", "server.js"]
