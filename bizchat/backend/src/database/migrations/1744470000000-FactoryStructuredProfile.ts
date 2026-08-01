import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Структурированный профиль завода по дизайну SourceHub (Ерасыл).
 *
 * До этой миграции всё описание завода жило в одном свободном поле
 * description — там же и «что производим», и «сертификаты», и «рынки».
 * Покупателю B2B этого мало: перед сделкой он смотрит конкретные
 * атрибуты, а не сплошной текст. Разбиваем на явные поля — как это
 * сделано у Alibaba и как нарисовано в мокапе.
 *
 *   cover_url          — фото производства сверху страницы (баннер)
 *   factory_type       — Manufacturer / Trading Company / Both
 *   main_products      — короткий список специализации (до 10 позиций)
 *   certifications     — сертификаты качества (BSCI, ISO 9001, OEKO-TEX)
 *   export_markets     — куда экспортирует (Europe, North America, ...)
 *   total_employees    — размер производства, диапазон строкой (10+, 260+)
 *   established_year   — год основания
 *
 * Все поля опциональные — старые заводы продолжают жить без них.
 */
export class FactoryStructuredProfile1744470000000
  implements MigrationInterface
{
  name = 'FactoryStructuredProfile1744470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "cover_url" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "factory_type" varchar(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "main_products" text[] DEFAULT '{}'::text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "certifications" text[] DEFAULT '{}'::text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "export_markets" text[] DEFAULT '{}'::text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "total_employees" varchar(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "established_year" int`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "established_year"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "total_employees"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "export_markets"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "certifications"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "main_products"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "factory_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "cover_url"`,
    );
  }
}
