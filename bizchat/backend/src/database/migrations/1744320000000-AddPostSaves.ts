import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Таблица сохранённых пользователем постов (bookmarks).
 *
 * По аналогии с `post_likes`: композитный PK (user_id, post_id) даёт
 * идемпотентность на уровне БД — нельзя сохранить дважды.
 *
 * Без `saves_count` на постах: сохранения в B2B-контексте приватны,
 * общий счётчик не нужен (в отличие от лайков). Если когда-то понадобится
 * «N людей сохранили» — добавим отдельной миграцией с COUNT запросом.
 *
 * Индекс `(user_id, created_at DESC)` — для будущего экрана «Мои сохранения»
 * с листингом в хронологическом порядке (новые сверху).
 */
export class AddPostSaves1744320000000 implements MigrationInterface {
  name = 'AddPostSaves1744320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "post_saves" (
        "user_id" uuid NOT NULL,
        "post_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_post_saves" PRIMARY KEY ("user_id", "post_id"),
        CONSTRAINT "fk_post_saves_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_post_saves_post" FOREIGN KEY ("post_id")
          REFERENCES "posts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_post_saves_user_created" ON "post_saves" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "post_saves"`);
  }
}
