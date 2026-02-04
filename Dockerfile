FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
