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
RUN cd artifacts/api-server && npx tsx build.ts

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/apatris-dashboard/dist ./artifacts/apatris-dashboard/dist
COPY --from=builder /app/artifacts/workforce-app/dist ./artifacts/workforce-app/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
EXPOSE 8080
CMD ["node", "artifacts/api-server/dist/index.cjs"]
