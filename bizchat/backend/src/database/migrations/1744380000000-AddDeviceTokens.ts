import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Регистрация FCM-токенов устройств для push-уведомлений.
 *
 * Один юзер может иметь N устройств → один user_id ↔ N токенов.
 * `token` UNIQUE — один и тот же FCM-токен не может принадлежать двум юзерам
 * (если юзер сменился на устройстве, мы обновляем user_id через UPSERT).
 *
 * `last_seen_at` обновляется при каждом register-token вызове —
 * это позволяет периодически чистить мёртвые токены (>30 дней без активности).
 *
 * `language` хранится для локализации тела пуша на стороне сервера.
 */
export class AddDeviceTokens1744380000000 implements MigrationInterface {
  name = 'AddDeviceTokens1744380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "device_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token" varchar(512) NOT NULL,
        "platform" varchar(16) NOT NULL,
        "language" varchar(8) NOT NULL DEFAULT 'ru',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_device_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "uq_device_tokens_token" UNIQUE ("token"),
        CONSTRAINT "fk_device_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_device_tokens_platform"
          CHECK ("platform" IN ('android','ios','web'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_device_tokens_user" ON "device_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_device_tokens_last_seen" ON "device_tokens" ("last_seen_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
  }
}
