FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY Provider_API_Service/package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY Provider_API_Service/src ./src

# Copy provider adapter from Provider Management Service
COPY Provider_Management_Service/src/adapters ./adapters

# Expose port
EXPOSE 3200

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3200/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start service
CMD ["node", "src/index.js"]
