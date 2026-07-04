# syntax=docker/dockerfile:1.6
#
# Biz Chat Backend — production multi-stage build.
#
# Stage 1 (builder): ставим ВСЕ зависимости (включая dev) и собираем TS -> dist/.
# Stage 2 (runner):  берём чистый alpine, копируем только dist/, prod node_modules
#                    и package.json. Никаких dev-зависимостей, никаких исходников.
#
# Точка входа:  node dist/main.js
# Порт:         3000  (внутри контейнера, см. PORT env)
# Healthcheck:  HTTP GET /api/v1/posts/feed?limit=1  каждые 30 сек
#
# Сборка (обычно через docker compose, но можно и вручную):
#   docker build -t bizchat-backend:latest -f backend/Dockerfile ./backend

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Утилиты, нужные для npm ci некоторым native-модулям (bcrypt, sharp и т.д.)
RUN apk add --no-cache python3 make g++ libc6-compat

# Сначала package.json+lock — чтобы кеш слоёв работал
COPY package.json package-lock.json ./

# Детерминированная установка ВСЕХ зависимостей (dev + prod) — нужны для сборки
RUN npm ci --no-audit --no-fund

# Копируем исходники и конфиги сборки
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Билдим TypeScript -> dist/
RUN npm run build

# Отдельный шаг — оставляем только production-зависимости, для копирования в runner.
# Используем `npm prune --omit=dev` на уже установленной node_modules, чтобы не
# качать пакеты второй раз.
RUN npm prune --omit=dev


# ---------- Stage 2: runner (slim) ----------
FROM node:22-alpine AS runner

# wget нужен для HEALTHCHECK; tini — корректная обработка сигналов (graceful shutdown)
RUN apk add --no-cache wget tini libc6-compat \
    && addgroup -S bizchat -g 1001 \
    && adduser  -S bizchat -u 1001 -G bizchat

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    API_PREFIX=api/v1

# Копируем только то, что нужно рантайму
COPY --from=builder --chown=bizchat:bizchat /app/node_modules ./node_modules
COPY --from=builder --chown=bizchat:bizchat /app/dist          ./dist
COPY --from=builder --chown=bizchat:bizchat /app/package.json  ./package.json

# Папка для загрузок (монтируется как volume снаружи)
RUN mkdir -p /app/uploads && chown -R bizchat:bizchat /app/uploads

USER bizchat

EXPOSE 3000

# Healthcheck: простой GET на публичный эндпоинт фида.
# Если backend не ответит 200 в течение 5 сек — контейнер помечается unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --quiet --tries=1 --spider \
        "http://localhost:${PORT}/${API_PREFIX}/posts/feed?limit=1" || exit 1

# tini как PID 1 — корректно пробрасывает SIGTERM/SIGINT в node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
