# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S retrofitlink -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=retrofitlink:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=retrofitlink:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown retrofitlink:nodejs logs

# Switch to non-root user
USER retrofitlink

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1); \
  }).on('error', () => process.exit(1));"

# Start application
CMD ["node", "server.js"]
