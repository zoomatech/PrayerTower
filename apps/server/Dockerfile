# Build from the repo root: docker build -f apps/server/Dockerfile .
# One image for both processes: apps/server/dist/src/server.js (API) or worker.js (jobs).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
RUN npm ci -w @prayer-tower/server --ignore-scripts
COPY apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/
COPY apps/server/src apps/server/src
RUN npm run build -w @prayer-tower/server && npm prune --omit=dev -w @prayer-tower/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY apps/server/package.json ./apps/server/
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/src/server.js"]
