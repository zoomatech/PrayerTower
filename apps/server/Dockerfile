# Build from the repo root: docker build -f apps/server/Dockerfile .
# One image for both processes: apps/server/dist/src/server.js (API) or worker.js (jobs).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @prayer-tower/server --ignore-scripts
COPY apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/
COPY apps/server/src apps/server/src
COPY packages/shared packages/shared
RUN npm run build -w @prayer-tower/server && npm prune --omit=dev -w @prayer-tower/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY apps/server/package.json ./apps/server/
# Product constants shared with the app, loaded as TypeScript (Node 22 strips types outside node_modules).
COPY --from=build /app/packages/shared ./packages/shared
# The privacy policy and terms served at /privacy and /terms (the reviewed .md wins over the _DRAFT).
COPY docs/legal ./docs/legal
# Apple's root certificate, for checking App Store purchases (APPLE_ROOT_CA_PATHS; docs/TOKEN_PURCHASE.md).
ADD --chmod=644 https://www.apple.com/certificateauthority/AppleRootCA-G3.cer ./certs/AppleRootCA-G3.cer
USER node
EXPOSE 3000
CMD ["node", "--import", "./apps/server/dist/src/instrument.js", "apps/server/dist/src/server.js"]
