# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY server/package.json ./server/
COPY packages/tutor-types/package.json ./packages/tutor-types/
RUN pnpm install --frozen-lockfile=false

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/server/node_modules ./server/node_modules
COPY --from=deps /repo/packages/tutor-types/node_modules ./packages/tutor-types/node_modules
COPY tsconfig.base.json ./
COPY packages ./packages
COPY server ./server
RUN pnpm --filter @whale-tutor/tutor-types build \
 && pnpm --filter @whale-tutor/server build

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/server/package.json ./package.json
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/node_modules ./node_modules
COPY --from=build /repo/packages/tutor-types ./node_modules/@whale-tutor/tutor-types
EXPOSE 3000
CMD ["node", "dist/main.js"]
