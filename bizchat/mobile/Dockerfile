# syntax=docker/dockerfile:1.6
#
# Biz Chat — Flutter Web production image.
#
# Stage 1 (builder):  официальный образ Flutter, делаем pub get + build web.
#                     Флаг --no-web-resources-cdn важен для VPS с ограниченным
#                     исходящим трафиком: Flutter будет отдавать canvaskit.wasm
#                     и шрифты со своего origin, а не с gstatic.com.
#
# Stage 2 (runner):   nginx:alpine, в который кладём только build/web.
#                     SPA-fallback настраивается в infra/nginx/nginx.conf,
#                     а не здесь, чтобы не плодить конфиги.
#
# ARG APP_API_URL        — базовый URL backend API, например https://api.bizchat.app
# ARG APP_WS_URL         — URL WebSocket (обычно тот же host, но может отличаться)
#
# Сборка:
#   docker build \
#     --build-arg APP_API_URL=https://api.bizchat.app \
#     --build-arg APP_WS_URL=wss://api.bizchat.app \
#     -t bizchat-web:latest -f mobile/Dockerfile ./mobile

# ---------- Stage 1: build Flutter Web ----------
FROM ghcr.io/cirruslabs/flutter:stable AS builder

WORKDIR /app

# Build-args пробрасываются в Dart через --dart-define
ARG APP_API_URL=https://api.bizchat.app
ARG APP_WS_URL=wss://api.bizchat.app
ARG APP_ENV=production

# pubspec.* — отдельно для кеша слоёв
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

# Всё остальное
COPY . .

# Чистый билд web-версии.
#   --release                    — tree-shake + минификация
#   --no-web-resources-cdn       — canvaskit + шрифты хостятся локально (важно)
#   --dart-define=APP_API_URL    — читается в Dart как const String.fromEnvironment(...)
RUN flutter pub get \
 && flutter build web \
      --release \
      --no-web-resources-cdn \
      --dart-define=APP_ENV=${APP_ENV} \
      --dart-define=APP_API_URL=${APP_API_URL} \
      --dart-define=APP_WS_URL=${APP_WS_URL}


# ---------- Stage 2: статика через nginx ----------
FROM nginx:alpine AS runner

# Удаляем дефолтную страницу nginx
RUN rm -rf /usr/share/nginx/html/*

# Копируем собранный Flutter Web в корень nginx
COPY --from=builder /app/build/web/ /usr/share/nginx/html/

# Минимальный конфиг для SPA: index.html fallback для client-side routing,
# gzip для ассетов. Полный reverse-proxy конфиг лежит в infra/nginx/nginx.conf
# и применяется на уровне отдельного nginx-proxy контейнера.
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  gzip on;' \
  '  gzip_types text/plain text/css application/json application/javascript application/wasm font/woff2 image/svg+xml;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '  # Кеш статики (но не index.html — он всегда свежий, иначе клиент зависнет на старой версии)' \
  '  location ~* \.(?:js|css|wasm|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico)$ {' \
  '    expires 30d;' \
  '    add_header Cache-Control "public, max-age=2592000, immutable";' \
  '  }' \
  '  location = /index.html {' \
  '    add_header Cache-Control "no-store, no-cache, must-revalidate";' \
  '  }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
