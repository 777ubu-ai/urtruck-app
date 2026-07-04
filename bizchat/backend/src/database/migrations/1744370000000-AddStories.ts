import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stories (Blueprint §1.1, §3) — эфемерный контент с авто-истечением через 24ч.
 *
 * Архитектура:
 *   - Каждая story принадлежит юзеру (обычно factory)
 *   - `expires_at` ставится приложением при создании = `created_at + 24h`
 *   - Фильтрация активных через `WHERE expires_at > NOW()`
 *   - В prod добавится cron для физического удаления старых строк (для
 *     экономии диска), но MVP — мягкое удаление через фильтр
 *
 * Индексы:
 *   - `(user_id, created_at DESC)` — для группировки stories по автору
 *     в ring-виджете ленты
 *   - `(expires_at)` — для cron'а который чистит истёкшие
 */
export class AddStories1744370000000 implements MigrationInterface {
  name = 'AddStories1744370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "media_url" varchar(1024) NOT NULL,
        "media_type" varchar(16) NOT NULL DEFAULT 'image',
        "thumbnail_url" varchar(1024),
        "caption" varchar(500),
        "view_count" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "pk_stories" PRIMARY KEY ("id"),
        CONSTRAINT "fk_stories_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_stories_media_type"
          CHECK ("media_type" IN ('image','video'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stories_user_created" ON "stories" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stories_expires" ON "stories" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stories"`);
  }
}
