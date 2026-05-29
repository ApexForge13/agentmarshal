# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the static lobstertrap binary ----------
FROM golang:1.22-alpine AS lt-builder

RUN apk add --no-cache git make

WORKDIR /src
RUN git clone --depth=1 https://github.com/coal/lobstertrap.git .
RUN make build-static


# ---------- Stage 2: build the Next.js standalone bundle ----------
FROM node:24-alpine AS web-builder

# Native deps for better-sqlite3
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /build

# pnpm via corepack (repo is pnpm; package.json engines require node >=24 and
# .npmrc sets engine-strict, so this builder must be node 24 — see FROM above).
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
# Full deps (dev included): TypeScript is needed by `next build`; the seed-script
# bundle step below fetches a pinned esbuild via `pnpm dlx`.
RUN pnpm install --frozen-lockfile

COPY tsconfig.json next.config.ts eslint.config.mjs ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY scripts ./scripts
COPY types ./types
COPY configs ./configs
COPY public ./public
# Build-time JSON imports: JSON Schemas (spec/) and the fixtures inlined into the
# bundle at build (data/contracts, data/verify, data/voice). Runtime fs reads
# (keys, audit DB, demo-receipts) live on the Fly volume and never enter the image.
COPY spec ./spec
COPY data/contracts ./data/contracts
COPY data/verify ./data/verify
COPY data/voice ./data/voice

RUN pnpm run build

# Bundle the seed script into a single, self-contained JS file that the
# runtime image can `node`-run without devDeps or tsx. esbuild is fetched
# pinned via pnpm dlx (it is not a project dependency).
RUN pnpm dlx esbuild@0.27.7 scripts/seed-audit.ts \
      --bundle \
      --platform=node \
      --target=node24 \
      --external:better-sqlite3 \
      --alias:@=. \
      --outfile=seed-audit.bundle.js


# ---------- Stage 3: minimal runtime image ----------
# Start from bare alpine and copy in only the node binary to skip the
# ~80MB of npm/yarn/headers that ship in node:24-alpine.
FROM alpine:3.20 AS runtime

# libstdc++ for the node binary, libc6-compat so the prebuilt better-sqlite3
# musl .node loads cleanly, tini for clean signal handling.
RUN apk add --no-cache libstdc++ libc6-compat tini

COPY --from=node:24-alpine /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Standalone Next.js server (includes traced prod node_modules incl. better-sqlite3).
COPY --from=web-builder /build/.next/standalone ./
COPY --from=web-builder /build/.next/static ./.next/static
COPY --from=web-builder /build/public ./public

# AgentMarshal fleet manifest (read at runtime via process.cwd()/configs/policy.yaml).
COPY --from=web-builder /build/configs ./configs

# Lobster Trap binary + its default policy.
COPY --from=lt-builder /src/lobstertrap ./lobstertrap
COPY --from=lt-builder /src/configs/default_policy.yaml ./configs/default_policy.yaml

# Bundled seed script (drops in cleanly next to server.js).
COPY --from=web-builder /build/seed-audit.bundle.js ./seed-audit.js

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh ./lobstertrap

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
