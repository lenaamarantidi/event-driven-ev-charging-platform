FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY . .

ENV NODE_ENV=production

EXPOSE 3101

CMD ["node", "src/index.js"]
