FROM node:18-alpine

WORKDIR /app

COPY Frontend_Service/package*.json ./

RUN npm install --omit=dev

COPY Frontend_Service/src ./src
COPY Frontend_Service/pages ./pages

# Copy plugs_api.js from Points_Service for normalization functions
COPY Points_Service/src/plugs_api.js ./src/plugs_api.js

ARG PORT=3000
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port = process.env.PORT || ${PORT}; require('http').get(`http://localhost:${port}/health`, (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode) })"

CMD ["npm", "start"]
