# API only. Ollama stays on the host. Chroma and Mongo come from docker-compose.yml.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
# The reranker downloads its model into .cache on first use. Creating it here lets a
# Compose volume mounted at that path inherit node ownership.
RUN mkdir -p /app/.cache/models && chown -R node:node /app

ENV NODE_ENV=production
ENV API_PORT=5001

EXPOSE 5001

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 5001) + '/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/main.js"]
