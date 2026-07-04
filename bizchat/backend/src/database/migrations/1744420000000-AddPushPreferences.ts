import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Добавляем настройки push-уведомлений на уровне юзера:
 *   - `push_enabled` (boolean) — глобальный toggle; если false, то пуши
 *     не шлются (но in-app notification всё равно создаётся).
 *   - `notification_prefs` (jsonb) — гранулярные пресеты по категориям
 *     (likes/comments/messages/reviews/groupBuy). По умолчанию всё `true`.
 *
 * Дефолт для всех существующих юзеров — пуши включены, все категории on.
 * Так мы не ломаем текущее поведение и даём юзеру возможность отключить
 * выборочно из настроек профиля.
 */
export class AddPushPreferences1744420000000 implements MigrationInterface {
  name = 'AddPushPreferences1744420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_enabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_prefs" jsonb NOT NULL DEFAULT '{"likes":true,"comments":true,"messages":true,"reviews":true,"groupBuy":true}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "notification_prefs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "push_enabled"`,
    );
  }
}
