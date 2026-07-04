import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Direct-чаты (Blueprint §11): 1-на-1 беседы между байером и заводом.
 *
 * Архитектура:
 *   - `conversations` — уникальная пара участников (a, b), где a < b лексикографически.
 *     Это даёт идемпотентность «найти или создать»: всегда нормализуем в (min, max).
 *   - `messages` — плоский список сообщений в беседе, связанных с conversations.
 *     `read_at` — timestamp прочтения получателем (для галочек прочтения).
 *
 * На MVP без групповых чатов и без вложений — только текст.
 * Push-нотификации (FCM) — Phase 2/3, сейчас фронт делает polling.
 */
export class AddDirectChat1744330000000 implements MigrationInterface {
  name = 'AddDirectChat1744330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===== conversations =====
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "participant_a_id" uuid NOT NULL,
        "participant_b_id" uuid NOT NULL,
        "last_message_at" timestamptz,
        "last_message_text" varchar(2000),
        "last_message_sender_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_conv_a" FOREIGN KEY ("participant_a_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_conv_b" FOREIGN KEY ("participant_b_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_conv_ordered"
          CHECK ("participant_a_id" < "participant_b_id"),
        CONSTRAINT "uq_conv_pair"
          UNIQUE ("participant_a_id", "participant_b_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_conv_a" ON "conversations" ("participant_a_id", "last_message_at" DESC NULLS LAST)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conv_b" ON "conversations" ("participant_b_id", "last_message_at" DESC NULLS LAST)`,
    );

    // ===== messages =====
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "text" varchar(4000) NOT NULL,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_messages" PRIMARY KEY ("id"),
        CONSTRAINT "fk_msg_conv" FOREIGN KEY ("conversation_id")
          REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_msg_sender" FOREIGN KEY ("sender_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_msg_text_not_empty"
          CHECK (char_length(trim("text")) > 0)
      )
    `);
    // Курсорная пагинация по созданию сообщения
    await queryRunner.query(
      `CREATE INDEX "idx_messages_conv_created" ON "messages" ("conversation_id", "created_at" DESC)`,
    );
    // Для подсчёта unread в conversation list
    await queryRunner.query(
      `CREATE INDEX "idx_messages_unread" ON "messages" ("conversation_id", "read_at") WHERE "read_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
  }
}
