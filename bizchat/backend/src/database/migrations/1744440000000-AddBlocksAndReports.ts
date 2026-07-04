import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WOW-3: блокировка юзеров + жалобы.
 *
 * `user_blocks` — двунаправленная таблица: записи с blocker_id=A,blocked_id=B
 * означают что A заблокировал B. Посты/сообщения от B не показываются A.
 * Симметрия не подразумевается — если хочется взаимной блокировки, делается
 * парная запись.
 *
 * `reports` — жалобы юзеров на контент. target_type определяет на что
 * пожаловались: post / user / message / comment. Админ потом пересматривает.
 */
export class AddBlocksAndReports1744440000000 implements MigrationInterface {
  name = 'AddBlocksAndReports1744440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_blocks" (
        "blocker_id" uuid NOT NULL,
        "blocked_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_blocks" PRIMARY KEY ("blocker_id", "blocked_id"),
        CONSTRAINT "chk_user_blocks_self" CHECK ("blocker_id" != "blocked_id"),
        CONSTRAINT "fk_user_blocks_blocker" FOREIGN KEY ("blocker_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_blocks_blocked" FOREIGN KEY ("blocked_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocker" ON "user_blocks"("blocker_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocked" ON "user_blocks"("blocked_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "reporter_id" uuid NOT NULL,
        "target_type" varchar(16) NOT NULL,
        "target_id" uuid NOT NULL,
        "reason" varchar(64) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "resolved_at" timestamptz,
        CONSTRAINT "chk_reports_target_type" CHECK ("target_type" IN ('post', 'user', 'message', 'comment')),
        CONSTRAINT "fk_reports_reporter" FOREIGN KEY ("reporter_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reports_reporter" ON "reports"("reporter_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reports_target" ON "reports"("target_type", "target_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reports_unresolved" ON "reports"("created_at") WHERE "resolved_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_blocks"`);
  }
}
