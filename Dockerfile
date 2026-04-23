FROM node:24-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib ./lib
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/apatris-dashboard/package.json ./artifacts/apatris-dashboard/
COPY artifacts/workforce-app/package.json ./artifacts/workforce-app/
RUN pnpm install --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=deps /app/artifacts/apatris-dashboard/node_modules ./artifacts/apatris-dashboard/node_modules
COPY --from=deps /app/artifacts/workforce-app/node_modules ./artifacts/workforce-app/node_modules
COPY . .
RUN cd artifacts/api-server && npx tsx build.ts
RUN cd artifacts/apatris-dashboard && npx vite build
RUN cd artifacts/workforce-app && PORT=8080 BASE_PATH=/workforce/ npx vite build

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
