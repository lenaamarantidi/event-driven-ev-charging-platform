FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ARG PORT=3000
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port = process.env.PORT || ${PORT}; require('http').get(`http://localhost:${port}/health`, (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode) })"

CMD ["npm", "start"]
