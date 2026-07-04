import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { DeviceToken } from '../entities/device-token.entity';
import { User } from '../entities/user.entity';

/**
 * Категории push-уведомлений. Используются в `sendToUser` для маппинга
 * на `user.notificationPrefs` (гранулярные тумблеры в профиле).
 */
export type PushNotificationType =
  | 'like'
  | 'comment'
  | 'message'
  | 'review'
  | 'group_buy_completed';

/**
 * Сервис push-уведомлений через Firebase Cloud Messaging.
 *
 * **Graceful degradation:** если service-account JSON не загружен
 * (нет файла или невалидный) — сервис работает в `disabled` режиме:
 * register/unregister токенов всё равно работают (мы их сохраняем в БД,
 * чтобы можно было включить пуши позже без потери базы), но все
 * `sendToUser*` методы — no-op c warning в логе. Это позволяет:
 *   1. Запускать backend в dev без Firebase project'а
 *   2. Не ронять основной flow создания уведомления при проблемах с FCM
 *   3. Включить пуши в проде просто положив `firebase-service-account.json`
 *      рядом с приложением (или указав путь в `FCM_SERVICE_ACCOUNT_PATH`)
 *
 * **Где взять service-account JSON:**
 *   Firebase Console → Project Settings → Service accounts →
 *   "Generate new private key". Это файл с приватным ключом —
 *   НЕ КОММИТИТЬ в git. Положить в `backend/firebase-service-account.json`
 *   и добавить в `.gitignore`.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: admin.app.App | null = null;
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DeviceToken)
    private readonly tokens: Repository<DeviceToken>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Проверка попадает ли текущее серверное время в quiet hours юзера.
   * Поля `quietHoursStart`/`quietHoursEnd` хранятся как `HH:MM`. Окно
   * может пересекать полночь (22:00 → 08:00 = ночь). Если поля null —
   * quiet hours не настроены, всегда возвращаем false (можно слать).
   *
   * Caveat: используем серверное время, не локальное юзера. В Phase 2
   * нужно хранить timezone юзера и считать через Intl.DateTimeFormat.
   * Для большинства аудитории СНГ+CN это приближение работает разумно
   * (разница 5-7 часов от UTC).
   */
  private isInQuietHours(user: Pick<User, 'quietHoursStart' | 'quietHoursEnd'>): boolean {
    const start = user.quietHoursStart;
    const end = user.quietHoursEnd;
    if (!start || !end) return false;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const parse = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10));
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    };
    const startMin = parse(start);
    const endMin = parse(end);
    if (startMin == null || endMin == null) return false;
    if (startMin === endMin) return false;
    // Окно НЕ через полночь: 09:00 → 18:00
    if (startMin < endMin) {
      return nowMin >= startMin && nowMin < endMin;
    }
    // Окно ЧЕРЕЗ полночь: 22:00 → 08:00 — два сегмента
    return nowMin >= startMin || nowMin < endMin;
  }

  onModuleInit() {
    this.initFirebase();
  }

  /**
   * Инициализация Firebase Admin SDK. Ищет credentials в порядке:
   *   1. ENV var `FCM_SERVICE_ACCOUNT_JSON` (содержимое JSON прямо в переменной)
   *   2. ENV var `FCM_SERVICE_ACCOUNT_PATH` (путь к файлу)
   *   3. Файл `backend/firebase-service-account.json` (default fallback)
   *
   * Если ничего не найдено или JSON невалиден — `enabled = false`,
   * сервис в no-op режиме.
   */
  private initFirebase() {
    try {
      const inlineJson = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
      const explicitPath = this.config.get<string>('FCM_SERVICE_ACCOUNT_PATH');
      const defaultPath = path.join(
        process.cwd(),
        'firebase-service-account.json',
      );

      let credJson: Record<string, unknown> | null = null;

      if (inlineJson && inlineJson.trim().startsWith('{')) {
        credJson = JSON.parse(inlineJson) as Record<string, unknown>;
        this.logger.log('FCM credentials loaded from FCM_SERVICE_ACCOUNT_JSON');
      } else {
        const filePath = explicitPath || defaultPath;
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          credJson = JSON.parse(raw) as Record<string, unknown>;
          this.logger.log(`FCM credentials loaded from ${filePath}`);
        }
      }

      if (!credJson) {
        this.logger.warn(
          'FCM disabled: no service-account JSON found. ' +
            'Push notifications will be no-op. ' +
            'Place firebase-service-account.json in backend/ to enable.',
        );
        return;
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert(credJson as admin.ServiceAccount),
      });
      this.enabled = true;
      this.logger.log('FCM enabled');
    } catch (e) {
      this.logger.error(
        `FCM init failed: ${(e as Error).message}. Falling back to no-op mode.`,
      );
      this.enabled = false;
    }
  }

  /**
   * Зарегистрировать (или обновить) FCM-токен для юзера.
   * UPSERT по `token` — если токен уже был у другого юзера (смена аккаунта
   * на устройстве), переписываем `userId`.
   */
  async registerToken(args: {
    userId: string;
    token: string;
    platform: 'android' | 'ios' | 'web';
    language?: string;
  }) {
    const language = args.language || 'ru';
    await this.tokens
      .createQueryBuilder()
      .insert()
      .into(DeviceToken)
      .values({
        userId: args.userId,
        token: args.token,
        platform: args.platform,
        language,
        lastSeenAt: new Date(),
      })
      .orUpdate(
        ['user_id', 'platform', 'language', 'last_seen_at'],
        ['token'],
      )
      .execute();
  }

  /**
   * Удалить токен (юзер разлогинился или отозвал permission).
   * Не падает если токена нет.
   */
  async unregisterToken(token: string): Promise<void> {
    await this.tokens.delete({ token });
  }

  /**
   * Отправить пуш конкретному юзеру (на все его зарегистрированные устройства).
   * Best-effort: при провале логирует warning, не кидает.
   *
   * **Mock-режим:** если FCM disabled (нет credentials), но у юзера
   * зарегистрированы device tokens — мы выводим в лог `[FCM MOCK]` запись
   * с title/body/data. Это позволяет smoke-тестировать всю цепочку
   * (register → notify → send → cleanup) без реального Firebase.
   * В проде с правильным credentials путь mock не выполняется.
   */
  async sendToUser(args: {
    userId: string;
    title: string;
    body: string;
    /** key/value для deep link навигации (postId, conversationId, ...) */
    data?: Record<string, string>;
    /**
     * Тип уведомления. Если задан — проверяем `user.notificationPrefs[type]`
     * и пропускаем отправку (баннер), если тумблер выключен. In-app запись
     * всё равно создаётся вызывающим методом.
     */
    type?: PushNotificationType;
  }): Promise<void> {
    // Проверка quiet hours / глобального toggle / гранулярных префов —
    // если юзер настроил тихие часы или отключил пуши, push не отправляется.
    // In-app notification (запись в таблице notifications) всё равно
    // создаётся вызывающим — юзер увидит её в колокольчике.
    const recipient = await this.users.findOne({
      where: { id: args.userId },
      select: [
        'id',
        'quietHoursStart',
        'quietHoursEnd',
        'pushEnabled',
        'notificationPrefs',
      ],
    });
    if (recipient && this.isInQuietHours(recipient)) {
      this.logger.debug(
        `[FCM] Skip push to user=${args.userId} — quiet hours active`,
      );
      return;
    }
    if (recipient && recipient.pushEnabled === false) {
      this.logger.debug(
        `[FCM] Skip push to user=${args.userId} — push_enabled=false`,
      );
      return;
    }
    if (recipient && args.type && recipient.notificationPrefs) {
      const prefKey = this.mapTypeToPrefKey(args.type);
      if (prefKey && recipient.notificationPrefs[prefKey] === false) {
        this.logger.debug(
          `[FCM] Skip push to user=${args.userId} — notificationPrefs.${prefKey}=false`,
        );
        return;
      }
    }

    if (!this.enabled || !this.app) {
      // Mock-режим: проверяем что у юзера есть зарегистрированные токены
      // (т.е. фронт вызывал register-token), и логируем как будто отправили.
      const tokenCount = await this.tokens.count({
        where: { userId: args.userId },
      });
      if (tokenCount > 0) {
        this.logger.warn(
          `[FCM MOCK] → user=${args.userId} tokens=${tokenCount} ` +
            `title="${args.title}" body="${args.body}" ` +
            `data=${JSON.stringify(args.data || {})}`,
        );
      }
      return;
    }
    try {
      const tokens = await this.tokens.find({
        where: { userId: args.userId },
        select: ['id', 'token'],
      });
      if (tokens.length === 0) return;

      const tokenStrings = tokens.map((t) => t.token);
      const response = await this.app.messaging().sendEachForMulticast({
        tokens: tokenStrings,
        notification: {
          title: args.title,
          body: args.body,
        },
        data: args.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'bizchat_default',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icons/Icon-192.png',
          },
        },
      });

      // Чистим невалидные токены (юзер удалил приложение / отозвал permission)
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((res, idx) => {
          if (!res.success) {
            const code = res.error?.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokenStrings[idx]);
            }
          }
        });
        if (invalidTokens.length > 0) {
          await this.tokens
            .createQueryBuilder()
            .delete()
            .where('token IN (:...tokens)', { tokens: invalidTokens })
            .execute();
          this.logger.log(
            `Cleaned ${invalidTokens.length} invalid FCM tokens for user=${args.userId}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `sendToUser failed for user=${args.userId}: ${(e as Error).message}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Маппинг внутреннего `PushNotificationType` на ключ `notificationPrefs`.
   * Ключи в JSONB — camelCase (`groupBuy`), а тип события — snake_case
   * (`group_buy_completed`), поэтому нужен явный map.
   */
  private mapTypeToPrefKey(
    type: PushNotificationType,
  ): keyof User['notificationPrefs'] | null {
    switch (type) {
      case 'like':
        return 'likes';
      case 'comment':
        return 'comments';
      case 'message':
        return 'messages';
      case 'review':
        return 'reviews';
      case 'group_buy_completed':
        return 'groupBuy';
      default:
        return null;
    }
  }

  /**
   * Cron: ежедневно в 03:00 Asia/Almaty чистим «протухшие» FCM-токены,
   * у которых `last_seen_at` старше 60 дней. Юзер либо удалил приложение,
   * либо давно не заходил — в FCM такие токены всё равно давно expired.
   *
   * Держим таблицу в чистоте, чтобы не слать в сотни мёртвых токенов и
   * не раздувать БД. Invalid-токены, что FCM вернул в `sendToUser` — уже
   * чистятся реактивно; это — дополнительная proactive очистка.
   */
  @Cron('0 3 * * *', {
    timeZone: 'Asia/Almaty',
    name: 'cleanup-stale-fcm-tokens',
  })
  async cleanupStaleTokens(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const result = await this.tokens.delete({
        lastSeenAt: LessThan(cutoff),
      });
      const affected = result.affected ?? 0;
      if (affected > 0) {
        this.logger.log(
          `Cron: cleaned ${affected} stale FCM tokens (last_seen_at < ${cutoff.toISOString()})`,
        );
      } else {
        this.logger.debug('Cron: no stale FCM tokens to cleanup');
      }
    } catch (e) {
      this.logger.warn(
        `Cron: cleanupStaleTokens failed: ${(e as Error).message}`,
      );
    }
  }
}
