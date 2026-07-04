import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Курс валюты относительно базовой (USD). Все пары в этой таблице имеют
 * `base_currency = 'USD'` — это упрощает конвертацию, любая пара X→Y считается
 * как `(1 / rate[USD→X]) * rate[USD→Y]`.
 *
 * `rate` — `decimal(18,6)` — точность 6 знаков после запятой, достаточно
 * для всех валют включая узбекский сум (~12500/USD).
 */
@Entity({ name: 'currency_rates' })
export class CurrencyRate {
  @PrimaryColumn({ name: 'base_currency', type: 'varchar', length: 8 })
  baseCurrency!: string;

  @PrimaryColumn({ name: 'target_currency', type: 'varchar', length: 8 })
  targetCurrency!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  rate!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
