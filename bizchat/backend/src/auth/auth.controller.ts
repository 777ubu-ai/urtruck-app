import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService, AuthResult } from './auth.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { VerifySmsDto } from './dto/verify-sms.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/sms/send
   * Body: { phone: "+79991234567" }
   * 200: { sent: true, cooldownSeconds: 60 }
   * 400: cooldown не прошёл / невалидный телефон
   * 429: rate-limit (более 5 запросов в час с одного IP) — только в production.
   *
   * В dev/test rate-limit полностью снят (limit = MAX_SAFE_INTEGER), чтобы
   * можно было гонять smoke-тесты и ручную проверку без 429 на каждом шаге.
   * `process.env.NODE_ENV` читается один раз при загрузке модуля — значение
   * фиксируется в декораторе на момент старта приложения.
   */
  @Post('sms/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    sms: {
      ttl: 60 * 60_000,
      limit:
        process.env.NODE_ENV === 'production' ? 5 : Number.MAX_SAFE_INTEGER,
    },
  })
  async send(@Body() dto: SendSmsDto) {
    return this.authService.sendSmsCode(dto.phone);
  }

  /**
   * POST /api/v1/auth/sms/verify
   * Body: { phone, code, type?, countryCode?, city?, referralCode? }
   * 200: { user, tokens }
   */
  @Post('sms/verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifySmsDto): Promise<AuthResult> {
    return this.authService.verifySmsCode(dto);
  }

  /**
   * POST /api/v1/auth/refresh
   * Body: { refreshToken }
   * 200: { accessToken, refreshToken, expiresIn }
   * 401: refresh token невалидный/просрочен
   *
   * Используется фронтом из Dio interceptor: при 401 на любой запрос —
   * пытаемся refresh, повторяем оригинальный запрос с новым access token.
   * Если refresh упал — фронт вызывает logout и редиректит на phone screen.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken?: string }) {
    if (!body?.refreshToken) {
      throw new BadRequestException('refreshToken обязателен');
    }
    return this.authService.refreshAccessToken(body.refreshToken);
  }

  /**
   * GET /api/v1/auth/sms/peek/:phone
   *
   * DEV-ONLY. В production всегда возвращает 404 (см. AuthService.peekDevSmsCode).
   * В dev/test возвращает последний сгенерированный SMS-код для указанного телефона.
   *
   * Назначение: QA-автоматизация. SMS-код в dev пишется только в логгер stub
   * (SmsService.sendStub) и прочитать его программно иначе нельзя. Этот
   * endpoint убирает костыль "подменить хэш в БД на sha256(123456)".
   *
   * Без JWT и без throttler — это dev tool. Защиту от prod обеспечивает
   * проверка NODE_ENV в AuthService.peekDevSmsCode.
   */
  @Get('sms/peek/:phone')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async peekSmsCode(@Param('phone') phone: string) {
    const result = await this.authService.peekDevSmsCode(phone);
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }
}
