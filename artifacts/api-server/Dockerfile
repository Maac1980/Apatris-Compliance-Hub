FROM node:24-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib ./lib
COPY artifacts/api-server/package.json ./artifacts/api-server/
RUN pnpm install --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY . .
RUN cd artifacts/api-server && npx tsx build.ts || true

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/package.json ./
COPY --from=deps /app/artifacts/api-server/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/index.js"]
