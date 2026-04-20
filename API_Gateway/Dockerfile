FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY API_Gateway/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY API_Gateway/src ./src

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start service
CMD ["npm", "start"]
