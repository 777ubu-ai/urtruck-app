import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrustScoreService } from './trust-score.service';

/**
 * Эндпоинты управления Trust Score. Пока ручной триггер — в prod будет
 * cron каждые 24 часа (Blueprint §16).
 *
 * **Безопасность**: сейчас под обычным JwtAuthGuard, любой авторизованный
 * юзер может запустить recalc. В prod нужен админский guard или вынос
 * в отдельный admin-namespace с API key.
 */
@Controller('trust-score')
export class TrustScoreController {
  constructor(private readonly service: TrustScoreService) {}

  /**
   * POST /api/v1/trust-score/recalc — пересчитать score всех заводов.
   * Возвращает количество обновлённых и среднее значение.
   */
  @Post('recalc')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async recalcAll() {
    return this.service.recalcAll();
  }

  /**
   * POST /api/v1/trust-score/recalc/:userId — пересчитать для одного завода.
   */
  @Post('recalc/:userId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async recalcOne(@Param('userId', new ParseUUIDPipe()) userId: string) {
    const score = await this.service.recalcOne(userId);
    return { userId, score };
  }
}
