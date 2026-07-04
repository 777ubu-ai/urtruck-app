import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

interface RegisterTokenBody {
  token: string;
  platform: 'android' | 'ios' | 'web';
  language?: string;
}

@Controller('push')
export class PushController {
  constructor(private readonly service: PushService) {}

  /**
   * POST /api/v1/push/register-token
   * Body: { token, platform, language }
   *
   * Регистрирует FCM-токен для текущего юзера. Идемпотентно: можно
   * вызывать сколько угодно раз с тем же токеном — UPSERT обновит
   * `last_seen_at`. Это нужно фронту, чтобы при каждом запуске
   * приложения «продлевать» токен.
   */
  @Post('register-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async register(
    @Req() req: RequestWithUser,
    @Body() body: RegisterTokenBody,
  ) {
    if (!body.token || typeof body.token !== 'string') {
      throw new BadRequestException('token обязателен');
    }
    if (!['android', 'ios', 'web'].includes(body.platform)) {
      throw new BadRequestException('platform должен быть android|ios|web');
    }
    const userId = req.user!.sub;
    await this.service.registerToken({
      userId,
      token: body.token,
      platform: body.platform,
      language: body.language,
    });
    return { ok: true, fcmEnabled: this.service.isEnabled() };
  }

  /**
   * DELETE /api/v1/push/token/:token
   *
   * Удалить токен (юзер логаут или отозвал permission). Не падает если
   * токена нет. Не требует, чтобы токен принадлежал текущему юзеру —
   * unregister должен работать даже если сессия на бэке уже истекла.
   */
  @Delete('token/:token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async unregister(@Param('token') token: string) {
    await this.service.unregisterToken(token);
    return { ok: true };
  }
}
