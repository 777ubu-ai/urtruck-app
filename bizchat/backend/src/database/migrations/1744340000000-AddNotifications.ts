import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * In-app уведомления (заменитель FCM на MVP).
 *
 * Стратегия «fan-out on write»: при действии (лайк/коммент/сообщение)
 * сразу создаём строку с **денормализованными** данными:
 * `actor_name`, `post_title`, `preview` — чтобы лента уведомлений работала
 * без JOIN'ов и не падала если связанный пост/чат потом удалили.
 *
 * Push-уведомления (FCM) в Phase 2 — будут читать из этой же таблицы и
 * пушить через сервисный воркер.
 */
export class AddNotifications1744340000000 implements MigrationInterface {
  name = 'AddNotifications1744340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "recipient_id" uuid NOT NULL,
        "actor_id" uuid NOT NULL,
        "actor_name" varchar(256) NOT NULL,
        "type" varchar(16) NOT NULL,
        "post_id" uuid,
        "post_title" varchar(256),
        "post_thumbnail_url" varchar(1024),
        "conversation_id" uuid,
        "preview" varchar(500),
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notif_recipient" FOREIGN KEY ("recipient_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_notif_actor" FOREIGN KEY ("actor_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_notif_type"
          CHECK ("type" IN ('like','comment','message'))
      )
    `);
    // Индекс для листинга уведомлений юзера + сортировки по дате
    await queryRunner.query(
      `CREATE INDEX "idx_notif_recipient_created" ON "notifications" ("recipient_id", "created_at" DESC)`,
    );
    // Партиальный индекс для быстрого подсчёта непрочитанных
    await queryRunner.query(
      `CREATE INDEX "idx_notif_unread" ON "notifications" ("recipient_id") WHERE "read_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
