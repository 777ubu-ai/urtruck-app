import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Group Buy (Blueprint §1.1 вкладка «Группы», §2.6 пост-groupbuy).
 *
 * Модель: один post с type='group_buy' = одна группа закупки. Байеры
 * присоединяются со своим количеством через таблицу `group_buy_orders`.
 * Когда суммарное количество достигает `target_quantity`, цена меняется
 * с обычной `price_amount` на более выгодную `group_buy_unit_price`.
 *
 * Решение «один юзер = одна заявка»:
 *   - UNIQUE (post_id, user_id) на уровне БД
 *   - Изменение количества = UPDATE (UPSERT через ON CONFLICT DO UPDATE)
 *   - Отмена = DELETE записи
 *
 * Счётчики `current_quantity` и `participant_count` денормализованы в
 * posts — приложение поддерживает их в транзакциях вместе с INSERT/UPDATE/
 * DELETE в orders. Это даёт O(1) чтение при рендере ленты.
 *
 * Дедлайн — `group_buy_deadline`. После истечения заявки больше не
 * принимаются, но данные сохраняются для истории.
 */
export class AddGroupBuy1744360000000 implements MigrationInterface {
  name = 'AddGroupBuy1744360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===== Расширяем posts =====
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "group_buy_target_quantity" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "group_buy_deadline" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "group_buy_current_quantity" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "group_buy_participant_count" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" ADD COLUMN "group_buy_unit_price" numeric(12,2)`,
    );

    // ===== Таблица заявок =====
    await queryRunner.query(`
      CREATE TABLE "group_buy_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "post_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "quantity" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_group_buy_orders" PRIMARY KEY ("id"),
        CONSTRAINT "fk_gbo_post" FOREIGN KEY ("post_id")
          REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_gbo_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_gbo_post_user" UNIQUE ("post_id", "user_id"),
        CONSTRAINT "chk_gbo_quantity_positive" CHECK ("quantity" >= 1)
      )
    `);
    // Индекс для «мои заявки» — экран профиля в будущем
    await queryRunner.query(
      `CREATE INDEX "idx_gbo_user_created" ON "group_buy_orders" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "group_buy_orders"`);
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN IF EXISTS "group_buy_unit_price"`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN IF EXISTS "group_buy_participant_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN IF EXISTS "group_buy_current_quantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN IF EXISTS "group_buy_deadline"`,
    );
    await queryRunner.query(
      `ALTER TABLE "posts" DROP COLUMN IF EXISTS "group_buy_target_quantity"`,
    );
  }
}
