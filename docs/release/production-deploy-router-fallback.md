# Production deploy router fallback

Temporary release note: web/PWA keeps Yandex JS API 2.1 MultiRoute as a real-road fallback when the optional server-side Yandex Router API key is unavailable. The deploy must not leave production permanently stale solely because that optional server router credential is missing or rejected.
