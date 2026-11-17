# syntax=docker/dockerfile:1
# 可选部署方式：Docker + Caddy
# 大陆服务器如果拉取 Docker Hub 镜像困难，请优先使用 deploy/install-ubuntu.sh。

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.28.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
RUN npm install -g pnpm@11.28.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/uploads /data/backups
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
