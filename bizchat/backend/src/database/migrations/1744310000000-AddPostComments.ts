import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Таблица комментариев к постам.
 *
 * Без древовидных ответов на первом спринте — `parent_comment_id` оставляем
 * на потом (Phase 2). Сейчас плоский список: новые сверху.
 *
 * `posts.comments_count` поддерживается приложением в той же транзакции, что
 * INSERT/DELETE сюда — по аналогии с `post_likes`. Это даёт быстрый счётчик
 * без `COUNT(*)` на каждое чтение ленты.
 *
 * Индекс `(post_id, created_at DESC)` — для курсорной пагинации листинга
 * комментов одного поста.
 */
export class AddPostComments1744310000000 implements MigrationInterface {
  name = 'AddPostComments1744310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "post_comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "post_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "text" varchar(2000) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_post_comments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_post_comments_post" FOREIGN KEY ("post_id")
          REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_post_comments_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_post_comments_text_not_empty"
          CHECK (char_length(trim("text")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_post_comments_post_created" ON "post_comments" ("post_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "post_comments"`);
  }
}
