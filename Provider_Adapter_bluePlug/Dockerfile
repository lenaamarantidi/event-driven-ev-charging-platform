FROM node:18-alpine
<<<<<<< HEAD
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3113
CMD ["npm", "start"]
=======

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

EXPOSE 3113

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3113/health', (r) => { if (r.statusCode !== 200) process.exit(1); }).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]

>>>>>>> a9d182987ebb3f2e65a280f7b266a9d1931351a2
