import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrencyService } from './currency.service';

@Controller('currency')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  /**
   * GET /api/v1/currency/rates
   *
   * Публичный (без авторизации) — фронт ходит за курсами при запуске
   * приложения, в т.ч. до логина (на guest-ленте). Возвращает все курсы
   * относительно USD.
   */
  @Get('rates')
  async list() {
    const rates = await this.service.getAllRates();
    return {
      base: 'USD',
      rates: Object.fromEntries(rates.map((r) => [r.target, r.rate])),
      updatedAt: rates[0]?.updatedAt ?? null,
    };
  }

  /**
   * POST /api/v1/currency/refresh
   *
   * Ручной триггер обновления курсов из external API. Только для
   * авторизованных юзеров — иначе можно DDoS'ить external endpoint.
   * Cron всё равно тикает раз в сутки автоматом.
   */
  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh() {
    try {
      const count = await this.service.refreshFromExternal();
      return { ok: true, updated: count };
    } catch (e) {
      // External API недоступен / таймаут — фронту возвращаем 503,
      // курсы в БД остаются от прошлого успешного refresh.
      throw new HttpException(
        `Не удалось обновить курсы: ${(e as Error).message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
