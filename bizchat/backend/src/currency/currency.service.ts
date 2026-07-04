import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyRate } from '../entities/currency-rate.entity';

interface OpenErApiResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

/**
 * Сервис курсов валют. Все курсы хранятся относительно USD.
 *
 * **Источник:** https://open.er-api.com/v6/latest/USD — бесплатный публичный API
 * без ключей и rate-limit'ов на разумную нагрузку. Возвращает rates для ~160
 * валют. Если API недоступен — fallback на текущие значения в БД (которые
 * остаются от предыдущего успешного refresh или от seed'а миграции).
 *
 * **Cron:** ежесуточно в 4 утра по Asia/Almaty. Один внешний запрос в сутки —
 * далеко за пределами free-tier limits.
 *
 * **Перечень валют:** список фиксирован на стороне сервера (наши целевые
 * рынки СНГ + Китай + Европа + USD). Все остальные валюты из ответа API
 * мы игнорируем — нет смысла хранить тонганскую паангу.
 */
@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);

  /** Валюты, которые мы поддерживаем в приложении. */
  private readonly supportedCurrencies = [
    'USD',
    'RUB',
    'KZT',
    'CNY',
    'EUR',
    'KGS',
    'UZS',
    'BYN',
    'TJS',
    'AZN',
  ];

  constructor(
    @InjectRepository(CurrencyRate)
    private readonly rates: Repository<CurrencyRate>,
  ) {}

  onModuleInit() {
    // На старте сервера один раз refresh — чтобы курсы были свежими сразу,
    // не ждать первого тика крона. Best-effort: если упадёт — продолжаем
    // со старыми значениями из БД.
    void this.refreshFromExternal().catch((e) => {
      this.logger.warn(
        `Initial currency refresh failed: ${(e as Error).message}. ` +
          `Using cached rates from DB.`,
      );
    });
  }

  /**
   * Cron: ежесуточно 4:00 Asia/Almaty.
   * Логирует результат, но не падает — крон должен продолжать тикать
   * даже если один прогон провалился.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'Asia/Almaty' })
  async dailyRefreshJob() {
    this.logger.log('Running daily currency refresh cron');
    try {
      const updated = await this.refreshFromExternal();
      this.logger.log(`Daily currency refresh: updated ${updated} rates`);
    } catch (e) {
      this.logger.error(`Daily currency refresh failed: ${(e as Error).message}`);
    }
  }

  /**
   * Подтянуть свежие курсы из external API и записать в БД.
   * Возвращает количество обновлённых пар. Кидает ошибку при сетевом сбое
   * или невалидном ответе — вызывающий должен решать что делать.
   */
  async refreshFromExternal(): Promise<number> {
    const url = 'https://open.er-api.com/v6/latest/USD';
    const response = await fetch(url, {
      // Короткий таймаут — если API не отвечает за 10 сек, проще fallback
      // на старые курсы, чем держать сервер в подвисе.
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`open.er-api responded ${response.status}`);
    }
    const json = (await response.json()) as OpenErApiResponse;
    if (json.result !== 'success' || !json.rates) {
      throw new Error('open.er-api returned invalid payload');
    }
    if (json.base_code !== 'USD') {
      throw new Error(`Expected base USD, got ${json.base_code}`);
    }

    // Обновляем только supported currencies — игнорируем экзотику.
    const updates: CurrencyRate[] = [];
    for (const target of this.supportedCurrencies) {
      const rate = json.rates[target];
      if (typeof rate !== 'number' || rate <= 0) continue;
      updates.push(
        this.rates.create({
          baseCurrency: 'USD',
          targetCurrency: target,
          rate: rate.toFixed(6),
        }),
      );
    }

    if (updates.length === 0) {
      throw new Error('No supported currencies found in API response');
    }

    // UPSERT — перезаписываем существующие пары новыми значениями.
    await this.rates
      .createQueryBuilder()
      .insert()
      .into(CurrencyRate)
      .values(updates)
      .orUpdate(['rate', 'updated_at'], ['base_currency', 'target_currency'])
      .execute();

    return updates.length;
  }

  /**
   * Получить все курсы из БД для возврата на фронт. Фронт сам кеширует
   * и считает конвертацию через двойной перевод X→USD→Y.
   */
  async getAllRates() {
    const all = await this.rates.find();
    return all.map((r) => ({
      base: r.baseCurrency,
      target: r.targetCurrency,
      rate: parseFloat(r.rate),
      updatedAt: r.updatedAt,
    }));
  }
}
