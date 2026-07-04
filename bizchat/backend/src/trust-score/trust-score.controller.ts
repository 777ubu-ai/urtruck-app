import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { TrustScoreService } from './trust-score.service';

/**
 * Эндпоинты управления Trust Score. Пока ручной триггер — в prod будет
 * cron каждые 24 часа (Blueprint §16).
 *
 * **Безопасность**: закрыто AdminGuard — recalc может запустить только
 * номер из белого списка ADMIN_PHONES. Плюс автоматический ежедневный
 * пересчёт в TrustScoreService (cron 3:00).
 */
@Controller('trust-score')
export class TrustScoreController {
  constructor(private readonly service: TrustScoreService) {}

  /**
   * POST /api/v1/trust-score/recalc — пересчитать score всех заводов.
   * Возвращает количество обновлённых и среднее значение.
   */
  @Post('recalc')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async recalcAll() {
    return this.service.recalcAll();
  }

  /**
   * POST /api/v1/trust-score/recalc/:userId — пересчитать для одного завода.
   */
  @Post('recalc/:userId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async recalcOne(@Param('userId', new ParseUUIDPipe()) userId: string) {
    const score = await this.service.recalcOne(userId);
    return { userId, score };
  }
}
