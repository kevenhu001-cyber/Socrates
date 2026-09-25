# syntax=docker/dockerfile:1.7
#
# Socrates API — multi-stage image.
#
# Why this exists
# ---------------
# deploy.sh currently runs `npm ci --include=dev` and `tsc` ON THE PRODUCTION
# HOST, then swaps the resulting dist/ into place. That has three consequences
# the 2026-09-25 review called out:
#
#   * the production machine carries the whole build toolchain (devDependencies,
#     TypeScript, and — for the frontend — Vite and a Rust target);
#   * there is no immutable artifact, so "which commit is live" is only
#     knowable from .deploy-state.json;
#   * rollback depth is one (`dist.previous`), because nothing older is kept.
#
# An image fixes all three: the runtime layer contains no build tooling, the
# digest identifies exactly what runs, and a registry keeps every previous tag.
#
# This file does NOT change deploy.sh. It is additive on purpose — the cutover
# from "build on the host" to "pull a digest" is a separate, riskier change
# that needs its own verification.
#
# Build context is the REPOSITORY ROOT, not server/:
#   docker build -f server/Dockerfile -t socrates-api .
# because src/lib/prompts.ts resolves the shipped system prompts relative to
# the repo root (REPO_ROOT = dirname(SERVER_ROOT)), so prompts/ must sit next
# to server/ inside the image.

# ─── Stage 1: dependencies ───────────────────────────────────────────
# Split from the build stage so a source-only change reuses the cached
# install layer.
FROM node:22-bookworm-slim AS deps
WORKDIR /repo/server

COPY server/package.json server/package-lock.json ./
# --include=dev: tsc lives in devDependencies and stage 2 needs it.
# allowScripts in package.json is already narrowed to { "esbuild": true }, so
# this does not hand install-time code execution to the whole tree.
RUN npm ci --include=dev --no-audit --no-fund

# ─── Stage 2: build ──────────────────────────────────────────────────
FROM deps AS build
WORKDIR /repo/server
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build && test -f dist/index.runtime.js

# ─── Stage 3: production dependencies ────────────────────────────────
# A separate `npm ci --omit=dev` rather than `npm prune`: prune leaves the
# devDependency tree's transitive junk behind in some npm versions, and a
# clean install from the same lockfile is deterministic.
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /repo/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ─── Stage 4: runtime ────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# tini reaps zombies and forwards signals: the server spawns worker processes
# (pyodideWorker, contentExtractorWorker, the optional Rust fetch binary), and
# PID 1 in a container does not reap children by default.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /repo/server

# Every COPY below sets ownership AND mode explicitly.
#
# Docker's COPY preserves the source file's permission bits. Three migrations
# in server/drizzle/ happen to be mode 600 on the development host, so without
# --chmod they land in the image as root-owned and unreadable by the `node`
# user — the container then boots fine and dies on the first migration with
# "No file ./drizzle/0016_streaming_survival.sql found", which is a misleading
# message for a permission problem. Found by running the image, not by building
# it. Normalising here also means the image does not inherit whatever umask the
# build machine happened to have.
COPY --from=prod-deps --chown=node:node /repo/server/node_modules ./node_modules
COPY --from=build     --chown=node:node /repo/server/dist ./dist

# package.json is read at runtime (type: module, engines) and by `npm start`.
COPY --chown=node:node server/package.json ./package.json
# The stable systemd entry point delegates to dist/index.runtime.js. Kept so a
# container and a systemd host start the process the same way.
COPY --chown=node:node server/src/index.js ./src/index.js
# Migrations travel with the image so the schema version is tied to the digest
# rather than to whatever happens to be checked out on the host. They are
# runnable with plain node: `node dist/db/migrate.js`.
COPY --chown=node:node server/drizzle ./drizzle
# Served as the status page; read from src/ at runtime.
COPY --chown=node:node server/src/status.html ./src/status.html

# Shipped system prompts. Resolved from the repo root at runtime, and asserted
# by server/test/prompts.test.js — omitting them yields a container that boots
# and then fails on the first chat turn.
COPY --chown=node:node prompts /repo/prompts

# Normalise modes after the copies. `--chmod` would be tidier but requires
# BuildKit, and this image must build identically under the legacy builder —
# depending on the caller exporting DOCKER_BUILDKIT=1 is the kind of implicit
# requirement that produces an image that works in CI and not locally.
# Directories keep the execute bit so they stay traversable.
USER root
RUN find /repo/server/drizzle /repo/prompts /repo/server/src -type f -exec chmod 644 {} + \
 && find /repo/server/drizzle /repo/prompts /repo/server/src -type d -exec chmod 755 {} + \
 && chmod 644 /repo/server/package.json

USER node

EXPOSE 8080

# Matches the readiness semantics of GET /api/health: it checks DB
# connectivity, so an unhealthy container is one that cannot serve requests
# rather than merely one whose process died.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
