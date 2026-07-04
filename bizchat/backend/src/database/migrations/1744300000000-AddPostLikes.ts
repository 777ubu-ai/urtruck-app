import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Таблица лайков постов. Композитный PK (user_id, post_id) даёт идемпотентность
 * на уровне БД — нельзя поставить два лайка одному посту от одного юзера.
 *
 * `posts.likes_count` поддерживается приложением в той же транзакции, что
 * INSERT/DELETE в `post_likes`. Триггер не используем сознательно — проще
 * отлаживать и инкремент/декремент атомарны вместе с записью лайка.
 */
export class AddPostLikes1744300000000 implements MigrationInterface {
  name = 'AddPostLikes1744300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "post_likes" (
        "user_id" uuid NOT NULL,
        "post_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_post_likes" PRIMARY KEY ("user_id", "post_id"),
        CONSTRAINT "fk_post_likes_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_post_likes_post" FOREIGN KEY ("post_id")
          REFERENCES "posts"("id") ON DELETE CASCADE
      )
    `);
    // Индекс для запроса «кто лайкал этот пост» и для JOIN в /feed
    await queryRunner.query(
      `CREATE INDEX "idx_post_likes_post" ON "post_likes" ("post_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "post_likes"`);
  }
}
