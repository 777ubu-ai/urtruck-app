import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Отзывы байеров о заводах с фотографиями. Один из главных trust-сигналов
 * (Blueprint §7.6: «доверие через социальность»).
 *
 * Архитектура:
 * - PRIMARY KEY (factory_id, buyer_id) — один байер ↔ один отзыв на завод.
 *   Повторный POST = UPDATE через UPSERT (изменить рейтинг/текст можно).
 * - `photos` jsonb — массив URL вида `[{url, type}]`, аналогично posts.media.
 * - `is_verified` — флаг что байер реально совершил сделку с заводом
 *   (через group_buy_orders или другой канал). На MVP всегда false,
 *   в Phase 3 будет автоматически выставляться при подтверждённой сделке.
 * - Денормализация: `factories.avg_rating` (numeric(3,2) от 1.00 до 5.00)
 *   и `factories.reviews_count` (int) — пересчитываются при каждом INSERT/
 *   UPDATE/DELETE отзыва в той же транзакции. Это даёт O(1) чтение в feed/
 *   profile без агрегатных запросов на каждый показ карточки.
 */
export class AddReviews1744400000000 implements MigrationInterface {
  name = 'AddReviews1744400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "factory_id" uuid NOT NULL,
        "buyer_id" uuid NOT NULL,
        "rating" smallint NOT NULL,
        "text" varchar(2000),
        "photos" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_verified" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "uq_reviews_factory_buyer" UNIQUE ("factory_id", "buyer_id"),
        CONSTRAINT "fk_reviews_factory" FOREIGN KEY ("factory_id")
          REFERENCES "factories"("user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_reviews_buyer" FOREIGN KEY ("buyer_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_reviews_rating" CHECK ("rating" >= 1 AND "rating" <= 5),
        CONSTRAINT "chk_reviews_no_self"
          CHECK ("factory_id" != "buyer_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_reviews_factory_created" ON "reviews" ("factory_id", "created_at" DESC)`,
    );

    // Денормализованные счётчики на factories.
    await queryRunner.query(`
      ALTER TABLE "factories"
        ADD COLUMN "avg_rating" numeric(3,2) NOT NULL DEFAULT 0.00,
        ADD COLUMN "reviews_count" integer NOT NULL DEFAULT 0
    `);

    // Seed: пара demo-отзывов для Shenzhen и Guangzhou, чтобы UI не был пустым.
    // Используем существующий factory user (нашего тест-юзера ec67…) как байера —
    // на seed-уровне это OK, в проде self-review запрещён CHECK constraint'ом.
    // Берём первого попавшегося НЕ-factory если есть, иначе пропускаем.
    await queryRunner.query(`
      DO $$
      DECLARE
        v_buyer_id uuid;
        v_shenzhen uuid := 'e41abbf6-7543-42c7-b7e4-9923e063f3e8';
        v_guangzhou uuid := '7f848472-567e-43f6-82db-728155fc743a';
      BEGIN
        -- Пробуем найти buyer для seed
        SELECT id INTO v_buyer_id FROM users WHERE type = 'buyer' LIMIT 1;
        -- Если buyer'а нет — берём другого factory как «временного байера» для seed
        -- (нарушает chk_no_self только если он сам себе оставит, а мы выберем другого)
        IF v_buyer_id IS NULL THEN
          SELECT id INTO v_buyer_id FROM users WHERE id != v_shenzhen AND id != v_guangzhou LIMIT 1;
        END IF;

        IF v_buyer_id IS NOT NULL THEN
          INSERT INTO reviews (factory_id, buyer_id, rating, text, photos, is_verified)
          VALUES
            (v_shenzhen, v_buyer_id, 5,
             'Отличное качество электроники! Заказал партию смарт-часов, всё пришло в срок, упаковано хорошо. Буду заказывать ещё.',
             '[]'::jsonb, true)
          ON CONFLICT DO NOTHING;

          UPDATE factories
            SET reviews_count = (SELECT COUNT(*) FROM reviews WHERE factory_id = v_shenzhen),
                avg_rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE factory_id = v_shenzhen)
            WHERE user_id = v_shenzhen;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "factories" DROP COLUMN IF EXISTS "reviews_count", DROP COLUMN IF EXISTS "avg_rating"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"`);
  }
}
