import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, randomInt } from 'crypto';
import { User } from '../entities/user.entity';
import { SmsCode } from '../entities/sms-code.entity';
import { Factory } from '../entities/factory.entity';
import { SmsService } from './sms.service';
import { AppConfig } from '../config/configuration';
import { VerifySmsDto } from './dto/verify-sms.dto';

export interface AuthResult {
  user: {
    id: string;
    phone: string;
    type: string;
    name: string | null;
    avatarUrl: string | null;
    language: string;
    currency: string;
    countryCode: string | null;
    verified: boolean;
    isNew: boolean; // первая регистрация, или существующий логин
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // секунд до истечения access
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jwt: JwtService,
    private readonly smsService: SmsService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
    @InjectRepository(SmsCode)
    private readonly smsCodes: Repository<SmsCode>,
  ) {}

  /**
   * Шаг 1 регистрации/входа: отправить SMS с кодом на указанный телефон.
   * Идемпотентно — при повторном запросе в пределах cooldown вернёт ошибку.
   */
  async sendSmsCode(phone: string): Promise<{ sent: true; cooldownSeconds: number }> {
    const smsCfg = this.config.get('sms', { infer: true });

    // Проверяем cooldown — не чаще раза в N секунд на один номер
    const existing = await this.smsCodes.findOne({ where: { phone } });
    if (existing) {
      const secondsSinceLast =
        (Date.now() - existing.lastSentAt.getTime()) / 1000;
      if (secondsSinceLast < smsCfg.resendCooldownSeconds) {
        const wait = Math.ceil(smsCfg.resendCooldownSeconds - secondsSinceLast);
        throw new BadRequestException(
          `Повторная отправка возможна через ${wait} сек`,
        );
      }
    }

    // Генерируем код нужной длины
    const code = this.generateNumericCode(smsCfg.codeLength);
    const codeHash = this.hashCode(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + smsCfg.codeTtlSeconds * 1000);

    // UPSERT
    await this.smsCodes.save({
      phone,
      codeHash,
      attempts: 0,
      expiresAt,
      lastSentAt: now,
    });

    // Запоминаем код в in-memory dev-кеше, чтобы его можно было прочитать
    // через dev-only endpoint GET /auth/sms/peek/:phone (для QA автоматизации).
    // В prod сам peek endpoint вернёт 404 — так что кеш утечкой не является.
    this.smsService.rememberDevCode(phone, code);

    // Отправляем (в dev — stub, печатает в консоль)
    await this.smsService.send(phone, code);

    return { sent: true, cooldownSeconds: smsCfg.resendCooldownSeconds };
  }

  /**
   * Dev-only: прочитать последний сгенерированный SMS-код для телефона.
   * В production возвращает null (endpoint отдаст 404).
   * Используется QA-автоматизацией: SMS-код пишется только в логгер stub,
   * а прочитать его программно иначе нельзя.
   */
  async peekDevSmsCode(phone: string): Promise<{ code: string } | null> {
    const env = this.config.get('env', { infer: true });
    if (env === 'production') {
      return null;
    }
    const code = this.smsService.getDevCode(phone);
    if (!code) return null;
    return { code };
  }

  /**
   * Шаг 2: проверить код, создать юзера если новый, выдать JWT.
   */
  async verifySmsCode(dto: VerifySmsDto): Promise<AuthResult> {
    const smsCfg = this.config.get('sms', { infer: true });

    const record = await this.smsCodes.findOne({ where: { phone: dto.phone } });
    if (!record) {
      throw new NotFoundException('Код не запрашивался или истёк');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.smsCodes.delete({ phone: dto.phone });
      throw new NotFoundException('Код истёк, запросите новый');
    }

    if (record.attempts >= smsCfg.maxAttempts) {
      await this.smsCodes.delete({ phone: dto.phone });
      throw new ForbiddenException(
        'Слишком много неверных попыток. Запросите новый код.',
      );
    }

    const codeHash = this.hashCode(dto.code);
    if (codeHash !== record.codeHash) {
      // Считаем неудачную попытку, но не сбрасываем код
      await this.smsCodes.increment({ phone: dto.phone }, 'attempts', 1);
      throw new BadRequestException('Неверный код');
    }

    // Ищем существующего пользователя по телефону.
    // ВАЖНО: НЕ удаляем smsCode до тех пор, пока не уверены что verify
    // пройдёт полностью. Иначе при ошибке "нужен type" код сгорает и
    // пользователь вынужден запрашивать повторную SMS (двойная регистрация).
    let user = await this.users.findOne({ where: { phone: dto.phone } });
    let isNew = false;

    if (!user) {
      // Первая регистрация — создаём пользователя
      if (!dto.type) {
        // НЕ удаляем smsCode! Клиент повторит verify с тем же кодом + type.
        throw new BadRequestException(
          'При первой регистрации нужно указать type (buyer|factory)',
        );
      }

      user = this.users.create({
        phone: dto.phone,
        type: dto.type,
        countryCode: dto.countryCode ?? null,
        city: dto.city ?? null,
        referralCode: this.generateReferralCode(),
        referredById: null, // разрешим связать позже
      });

      // TODO(backend): обработать referralCode — найти реферера, связать через referredById
      user = await this.users.save(user);

      // Если это завод — создать запись в factories с дефолтами
      if (dto.type === 'factory') {
        await this.factories.save(
          this.factories.create({
            userId: user.id,
            companyName: `Factory ${user.id.slice(0, 8)}`, // временное имя, потом профиль дополнит
            hashtags: [],
          }),
        );
      }

      isNew = true;
      this.logger.log(`Новый юзер зарегистрирован: ${user.id} (${dto.type})`);
    }

    // Код использован — удаляем запись, чтобы нельзя было повторно
    await this.smsCodes.delete({ phone: dto.phone });
    this.smsService.forgetDevCode(dto.phone);

    // Выпускаем токены
    const tokens = await this.issueTokens(user);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        type: user.type,
        name: user.name,
        avatarUrl: user.avatarUrl,
        language: user.language,
        currency: user.currency,
        countryCode: user.countryCode,
        verified: user.verified,
        isNew,
      },
      tokens,
    };
  }

  // === helpers ===

  private generateNumericCode(length: number): string {
    // Безопасный генератор (crypto.randomInt), не предсказуемый
    let s = '';
    for (let i = 0; i < length; i++) {
      s += randomInt(0, 10).toString();
    }
    return s;
  }

  private hashCode(code: string): string {
    // SHA-256 от код+соль
    const salt = this.config.get('jwt', { infer: true }).secret;
    return createHash('sha256').update(`${code}:${salt}`).digest('hex');
  }

  private generateReferralCode(): string {
    // 8 символов, base36 — короткий и читаемый
    return randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  }

  /**
   * Обменять refreshToken на новую пару access+refresh.
   * Используется фронтом при 401 от любого endpoint'а — Dio interceptor
   * вызывает этот метод и перевыпускает запрос с новым accessToken.
   *
   * Кидает UnauthorizedException если:
   * - токен невалидный / просрочен
   * - тип токена не 'refresh' (защита от подмены access вместо refresh)
   * - юзер удалён
   */
  async refreshAccessToken(refreshToken: string) {
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(
        refreshToken,
      );
    } catch {
      throw new UnauthorizedException('Невалидный refresh token');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Это не refresh token');
    }
    const user = await this.users.findOne({
      where: { id: payload.sub },
      relations: { factory: true },
    });
    if (!user) {
      throw new UnauthorizedException('Юзер не найден');
    }
    return this.issueTokens(user);
  }

  private async issueTokens(user: User) {
    const jwtCfg = this.config.get('jwt', { infer: true });
    const accessPayload = { sub: user.id, phone: user.phone, type: user.type };
    const refreshPayload = { sub: user.id, typ: 'refresh' };

    const accessSeconds = this.parseTtlToSeconds(jwtCfg.accessTtl);
    const refreshSeconds = this.parseTtlToSeconds(jwtCfg.refreshTtl);

    const accessToken = await this.jwt.signAsync(accessPayload, {
      expiresIn: accessSeconds,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      expiresIn: refreshSeconds,
    });

    return { accessToken, refreshToken, expiresIn: accessSeconds };
  }

  private parseTtlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900; // 15 минут по умолчанию
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 60;
    return n * mult;
  }
}
