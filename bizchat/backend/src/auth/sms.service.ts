import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/**
 * Провайдер отправки SMS.
 * В dev — 'stub': логируем код в консоль, ничего не шлём.
 * В prod — 'twilio': реальная отправка (будет реализовано позже).
 *
 * Важно: этот сервис НЕ ЗНАЕТ код заранее и не генерирует его.
 * Генерацию делает AuthService. Мы только шлём готовое сообщение.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: 'stub' | 'twilio' | 'mobizon';

  /**
   * In-memory dev-кеш: phone -> { code, expiresAt }.
   * Заполняется в AuthService.sendSmsCode (через rememberDevCode),
   * читается dev-only endpoint'ом GET /auth/sms/peek/:phone,
   * очищается при успешном verify или по истечении TTL.
   *
   * ВАЖНО: кеш существует ТОЛЬКО для dev/test. В production он не используется
   * и endpoint peek всегда возвращает 404 (см. AuthService.peekDevSmsCode).
   * Сам по себе кеш не утечка — код недоступен без доступа к peek endpoint'у.
   */
  private readonly devCodeCache = new Map<
    string,
    { code: string; expiresAt: number }
  >();

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.provider = this.config.get('sms', { infer: true }).provider;
    this.logger.log(`SMS provider initialized: ${this.provider}`);
  }

  async send(phone: string, code: string): Promise<void> {
    switch (this.provider) {
      case 'stub':
        return this.sendStub(phone, code);
      case 'twilio':
        return this.sendTwilio(phone, code);
      case 'mobizon':
        return this.sendMobizon(phone, code);
    }
  }

  /**
   * Запомнить код в dev-кеше (для dev-only peek endpoint'а).
   * Вызывается из AuthService.sendSmsCode сразу после генерации кода.
   * TTL совпадает с TTL самого SMS-кода (sms.codeTtlSeconds).
   */
  rememberDevCode(phone: string, code: string): void {
    const smsCfg = this.config.get('sms', { infer: true });
    this.devCodeCache.set(phone, {
      code,
      expiresAt: Date.now() + smsCfg.codeTtlSeconds * 1000,
    });
  }

  /**
   * Прочитать последний отправленный код для телефона (dev-only).
   * Возвращает null если код не найден или истёк.
   * Защита по env живёт в AuthService.peekDevSmsCode — этот метод
   * сам по себе не проверяет env, только кеш.
   */
  getDevCode(phone: string): string | null {
    const entry = this.devCodeCache.get(phone);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.devCodeCache.delete(phone);
      return null;
    }
    return entry.code;
  }

  /**
   * Удалить код из dev-кеша. Вызывается из AuthService.verifySmsCode
   * при успешной проверке (чтобы peek после verify сразу возвращал 404).
   */
  forgetDevCode(phone: string): void {
    this.devCodeCache.delete(phone);
  }

  private async sendStub(phone: string, code: string): Promise<void> {
    // В dev просто выводим код крупно в консоль, чтобы разработчик
    // мог скопировать его из логов и использовать в мобильном приложении.
    this.logger.warn(
      `\n` +
        `┌─────────────────────────────────────────┐\n` +
        `│  [STUB SMS] отправка отключена          │\n` +
        `│  phone: ${phone.padEnd(32)}│\n` +
        `│  code:  ${code.padEnd(32)}│\n` +
        `│  (в prod здесь будет реальный Twilio)   │\n` +
        `└─────────────────────────────────────────┘`,
    );
  }

  private async sendTwilio(phone: string, code: string): Promise<void> {
    const twilio = this.config.get('sms', { infer: true }).twilio;
    if (!twilio) {
      throw new Error(
        'SMS_PROVIDER=twilio, но TWILIO_ACCOUNT_SID/AUTH_TOKEN не заданы в .env',
      );
    }
    this.logger.error(
      `[TWILIO] Реальная отправка ещё не реализована. phone=${phone}`,
    );
    throw new Error('Twilio provider not yet implemented');
  }

  /**
   * Mobizon SMS API (https://mobizon.kz).
   *
   * Endpoint: POST https://{domain}/service/message/sendSmsMessage
   * Auth: apiKey в query string.
   * Body (form): recipient, text.
   * Response: { code: 0, data: { messageId, ... }, message: "" }
   *   code=0 — ok, code>0 — error.
   *
   * Используем native fetch() (Node 22+). Без дополнительных зависимостей.
   */
  private async sendMobizon(phone: string, code: string): Promise<void> {
    const cfg = this.config.get('sms', { infer: true }).mobizon;
    if (!cfg) {
      throw new Error(
        'SMS_PROVIDER=mobizon, но MOBIZON_API_KEY не задан в .env',
      );
    }

    const text = `Biz Chat: ваш код ${code}`;
    // Номер без '+': Mobizon принимает только цифры (77479171118)
    const recipient = phone.replace(/^\+/, '');

    const url = `https://${cfg.apiDomain}/service/message/sendSmsMessage?apiKey=${cfg.apiKey}&output=json`;

    const body = new URLSearchParams({
      recipient,
      text,
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const json = (await res.json()) as {
        code: number;
        data: Record<string, unknown>;
        message: string;
      };

      if (json.code !== 0) {
        this.logger.error(
          `[MOBIZON] SMS failed: code=${json.code} message="${json.message}" phone=${phone}`,
        );
        throw new Error(`SMS не отправлено: ${json.message}`);
      }

      this.logger.log(
        `[MOBIZON] SMS sent to ${phone} → messageId=${json.data?.messageId ?? 'n/a'}`,
      );
    } catch (e) {
      if ((e as Error).message?.startsWith('SMS не отправлено')) throw e;
      this.logger.error(
        `[MOBIZON] fetch failed: ${(e as Error).message}`,
      );
      throw new Error('SMS-сервис временно недоступен');
    }
  }
}
