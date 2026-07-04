import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Factory } from '../entities/factory.entity';

/**
 * Trust Score: автоматический рейтинг завода 0..100.
 *
 * Blueprint §16 — 5 категорий с весами:
 *   1. Скорость ответа (`avg_response_time_min`) — 25 баллов.
 *      <10 мин = 25, 10-30 мин = 20, 30-60 мин = 15, 1-4 ч = 10, 4-24 ч = 5, >24 ч = 0
 *   2. Процент успешных сделок (`success_rate_percent`) — 25 баллов.
 *      Прямое пропорциональное отображение: 100% → 25, 0% → 0
 *   3. Соответствие описаниям (`description_match_score`) — 20 баллов.
 *      Прямое пропорциональное: 100 → 20, 0 → 0
 *   4. Количество сделок (`total_deals`) — 15 баллов.
 *      log-шкала: 0 сделок = 0, 10 = 5, 50 = 10, 100+ = 15
 *   5. Верификация (`verified_at`) — 15 баллов.
 *      Верифицирован = 15, нет = 0
 *
 * В MVP большинство метрик = 0 (новые заводы), поэтому большинство score
 * будут низкими. Пересчёт по cron (раз в сутки) — пока только ручной
 * триггер через `POST /admin/trust-score/recalc` или отдельный endpoint.
 */
@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
  ) {}

  /**
   * Пересчитать score для одного завода. Вызов с `userId` конкретного завода.
   */
  async recalcOne(userId: string): Promise<number | null> {
    const factory = await this.factories.findOne({ where: { userId } });
    if (!factory) return null;
    const score = this.computeScore(factory);
    await this.factories.update(
      { userId },
      {
        trustScore: score,
        trustScoreUpdatedAt: new Date(),
      },
    );
    this.logger.log(
      `TrustScore recalc: ${userId.slice(0, 8)} → ${score}`,
    );
    return score;
  }

  /**
   * Cron job для daily пересчёта Trust Score всех заводов.
   * Запускается каждый день в 03:00 (низкая нагрузка на БД).
   *
   * `@Cron(CronExpression.EVERY_DAY_AT_3AM)` — стандартный preset из
   * @nestjs/schedule (== `'0 0 3 * * *'` в стиле node-cron).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'trust-score-daily-recalc',
    timeZone: 'Asia/Almaty', // штаб-квартира проекта
  })
  async dailyRecalcJob(): Promise<void> {
    this.logger.log('Cron: starting daily Trust Score recalc');
    try {
      const result = await this.recalcAll();
      this.logger.log(
        `Cron: completed Trust Score recalc — updated ${result.updated} factories, avg ${result.average}`,
      );
    } catch (e) {
      this.logger.error(
        `Cron: Trust Score recalc failed: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Пересчитать score для всех заводов. Вызывается из ручного эндпоинта
   * `POST /trust-score/recalc` и из cron job выше.
   */
  async recalcAll(): Promise<{ updated: number; average: number }> {
    const all = await this.factories.find();
    let total = 0;
    for (const factory of all) {
      const score = this.computeScore(factory);
      await this.factories.update(
        { userId: factory.userId },
        {
          trustScore: score,
          trustScoreUpdatedAt: new Date(),
        },
      );
      total += score;
    }
    const average = all.length > 0 ? Math.round(total / all.length) : 0;
    this.logger.log(
      `TrustScore recalc all: ${all.length} factories, avg ${average}`,
    );
    return { updated: all.length, average };
  }

  /**
   * Чистая функция вычисления — unit-тестируется без БД.
   * Возвращает целое число 0..100 (гарантированно в этом диапазоне).
   */
  computeScore(factory: Factory): number {
    const parts = {
      responseTime: this.scoreResponseTime(factory.avgResponseTimeMin),
      successRate: this.scoreSuccessRate(factory.successRatePercent),
      descriptionMatch: this.scoreDescriptionMatch(
        factory.descriptionMatchScore,
      ),
      totalDeals: this.scoreTotalDeals(factory.totalDeals),
      verified: this.scoreVerified(factory.verifiedAt),
    };
    const total =
      parts.responseTime +
      parts.successRate +
      parts.descriptionMatch +
      parts.totalDeals +
      parts.verified;
    // На случай округлений/добавления новых категорий — clip в [0, 100]
    return Math.max(0, Math.min(100, Math.round(total)));
  }

  // === категории (приватные, легко юнит-тестируются) ===

  private scoreResponseTime(avgResponseMin: number): number {
    if (avgResponseMin <= 0) return 0; // нет данных — 0 баллов
    if (avgResponseMin < 10) return 25;
    if (avgResponseMin < 30) return 20;
    if (avgResponseMin < 60) return 15;
    if (avgResponseMin < 240) return 10;
    if (avgResponseMin < 1440) return 5;
    return 0;
  }

  private scoreSuccessRate(percent: number): number {
    // Линейная шкала: 100% → 25, 0% → 0
    return Math.round((Math.max(0, Math.min(100, percent)) / 100) * 25);
  }

  private scoreDescriptionMatch(score: number): number {
    // Линейная: 100 → 20, 0 → 0
    return Math.round((Math.max(0, Math.min(100, score)) / 100) * 20);
  }

  private scoreTotalDeals(deals: number): number {
    if (deals <= 0) return 0;
    if (deals >= 100) return 15;
    if (deals >= 50) return 10;
    if (deals >= 10) return 5;
    // 1..9 — 2 балла, чтобы не было «всё или ничего»
    return 2;
  }

  private scoreVerified(verifiedAt: Date | null): number {
    return verifiedAt !== null ? 15 : 0;
  }
}
