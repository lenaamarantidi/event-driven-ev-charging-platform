FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY Status_Service/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY Status_Service/src ./src

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/api/status/ping', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start service
CMD ["npm", "start"]
