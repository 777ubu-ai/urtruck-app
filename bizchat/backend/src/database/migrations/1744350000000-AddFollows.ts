import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Подписки байер → завод (Blueprint §1.1 вкладка «Для тебя/Подписки»).
 *
 * Направленная связь: `follower_id` подписывается на `followed_id`. Композитный
 * PK даёт идемпотентность на уровне БД. Без счётчиков на users — общие счёты
 * вычисляем COUNT-запросами в эндпоинтах профиля (маленькие таблицы в MVP,
 * при росте добавим денормализованные `followers_count`/`following_count`).
 *
 * Индексы:
 *   - `(follower_id, created_at DESC)` — для экрана «Мои подписки»
 *   - `(followed_id, created_at DESC)` — для экрана «Мои подписчики»
 * Оба закрыты автоматом композитным PK (first column index) + вторичный
 * по followed_id.
 */
export class AddFollows1744350000000 implements MigrationInterface {
  name = 'AddFollows1744350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "follows" (
        "follower_id" uuid NOT NULL,
        "followed_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_follows" PRIMARY KEY ("follower_id", "followed_id"),
        CONSTRAINT "fk_follows_follower" FOREIGN KEY ("follower_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_follows_followed" FOREIGN KEY ("followed_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_follows_not_self"
          CHECK ("follower_id" != "followed_id")
      )
    `);
    // Для запроса «кто подписан на этого юзера»
    await queryRunner.query(
      `CREATE INDEX "idx_follows_followed" ON "follows" ("followed_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "follows"`);
  }
}
