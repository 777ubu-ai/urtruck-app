import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Адрес завода — отдельное текстовое поле.
 *
 * У factories уже есть locationLat/locationLng, но это координаты, не
 * читаемый адрес. Реальные адреса с площадок-источников (этаж/ряд/номер
 * секции в торговом центре) — это текст, который нужно показывать
 * покупателю как есть, а не превращать в точку на карте.
 */
export class FactoryAddress1744460000000 implements MigrationInterface {
  name = 'FactoryAddress1744460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "address" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "address"`,
    );
  }
}
