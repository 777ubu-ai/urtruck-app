import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Профиль завода: нормальное описание и контакты.
 *
 * 1. `description` был объявлен как varchar(16) — в 16 символов не помещается
 *    даже короткая фраза «Автозапчасти оптом», поэтому поле фактически было
 *    непригодно для «О себе». Расширяем до text.
 *
 * 2. Добавляем контактные поля, без которых витрине поставщиков нечего
 *    показывать покупателю:
 *      - `website`  — сайт компании,
 *      - `whatsapp` — номер для быстрой связи (в Китае и СНГ это основной
 *                     канал переговоров по опту).
 *
 * Данные не теряются: расширение varchar → text безопасно, существующие
 * значения сохраняются.
 */
export class FactoryBioAndContacts1744450000000 implements MigrationInterface {
  name = 'FactoryBioAndContacts1744450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" ALTER COLUMN "description" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "website" varchar(256)`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" ADD COLUMN IF NOT EXISTS "whatsapp" varchar(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "whatsapp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "website"`,
    );
    // Обратно к varchar(16) не сужаем — это привело бы к потере данных.
  }
}
