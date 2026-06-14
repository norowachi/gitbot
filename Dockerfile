FROM node:25-alpine AS base
RUN npm install -g pnpm@11

# ── Dependencies ───────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-*.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# ── Build ──────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Production image ───────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-*.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

EXPOSE 5000
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
