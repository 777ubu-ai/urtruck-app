import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Расширяем CHECK constraint на notifications.type — добавляем
 * 'group_buy_completed' (рассылка участникам когда target достигнут).
 */
export class AllowGroupBuyCompletedNotificationType1744410000000
  implements MigrationInterface
{
  name = 'AllowGroupBuyCompletedNotificationType1744410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "chk_notif_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notif_type" CHECK ("type" IN ('like','comment','message','review','group_buy_completed'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "chk_notif_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "chk_notif_type" CHECK ("type" IN ('like','comment','message','review'))`,
    );
  }
}
