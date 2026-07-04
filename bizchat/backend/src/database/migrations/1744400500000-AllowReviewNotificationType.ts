import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Расширяем CHECK constraint на notifications.type — добавляем 'review'.
 * Делаем DROP+ADD, иначе старый CHECK заблокирует INSERT с новым типом.
 */
export class AllowReviewNotificationType1744400500000
  implements MigrationInterface
{
  name = 'AllowReviewNotificationType1744400500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "chk_notif_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notif_type" CHECK ("type" IN ('like','comment','message','review'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "chk_notif_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notif_type" CHECK ("type" IN ('like','comment','message'))`,
    );
  }
}
