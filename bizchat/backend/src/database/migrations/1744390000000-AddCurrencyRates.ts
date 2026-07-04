import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Курсы валют для авто-конвертации цен на фронте.
 *
 * Все курсы хранятся относительно USD (base_currency='USD'), это позволяет
 * считать любую пару через двойную конвертацию (X→USD→Y) без хранения
 * комбинаторного N×N.
 *
 * Обновляется ежесуточно через `CurrencyService.refreshFromExternal()`
 * (cron 4 утра) — тянет с https://open.er-api.com/v6/latest/USD,
 * graceful fallback на static rates если API недоступен.
 *
 * Seed: USD→USD, USD→RUB, USD→KZT, USD→CNY, USD→EUR — реалистичные на 2026.
 */
export class AddCurrencyRates1744390000000 implements MigrationInterface {
  name = 'AddCurrencyRates1744390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "currency_rates" (
        "base_currency" varchar(8) NOT NULL,
        "target_currency" varchar(8) NOT NULL,
        "rate" decimal(18,6) NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_currency_rates" PRIMARY KEY ("base_currency", "target_currency")
      )
    `);
    // Seed: реалистичные курсы на апрель 2026 (примерные).
    // CurrencyService.refreshFromExternal() перезапишет их на актуальные.
    await queryRunner.query(`
      INSERT INTO "currency_rates" (base_currency, target_currency, rate) VALUES
        ('USD', 'USD', 1.000000),
        ('USD', 'RUB', 92.500000),
        ('USD', 'KZT', 490.000000),
        ('USD', 'CNY', 7.180000),
        ('USD', 'EUR', 0.920000),
        ('USD', 'KGS', 87.300000),
        ('USD', 'UZS', 12500.000000),
        ('USD', 'BYN', 3.180000),
        ('USD', 'TJS', 10.900000),
        ('USD', 'AZN', 1.700000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "currency_rates"`);
  }
}
