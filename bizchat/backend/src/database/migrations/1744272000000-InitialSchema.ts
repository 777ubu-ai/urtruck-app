import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Первая миграция — создаёт таблицы:
 *   - users       (все пользователи: байеры и заводы)
 *   - factories   (1:1 с users где type='factory')
 *   - posts       (посты-товары, reels, hot deals, group buys)
 *   - sms_codes   (одноразовые коды для SMS-аутентификации)
 *
 * Соответствует Blueprint v4, разделы 1, 4, 5, 19.
 * Расширения (uuid-ossp, pg_trgm, btree_gin) уже созданы в infra/postgres/init.sql.
 */
export class InitialSchema1744272000000 implements MigrationInterface {
  name = 'InitialSchema1744272000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===== users =====
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" varchar(32) NOT NULL,
        "type" varchar(16) NOT NULL,
        "country_code" char(2),
        "city" varchar(128),
        "name" varchar(128),
        "avatar_url" text,
        "language" varchar(8) NOT NULL DEFAULT 'ru',
        "currency" varchar(3) NOT NULL DEFAULT 'USD',
        "referral_code" varchar(32) NOT NULL,
        "referred_by_id" uuid,
        "bonus_points" int NOT NULL DEFAULT 0,
        "quiet_hours_start" varchar(5),
        "quiet_hours_end" varchar(5),
        "verified" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "chk_users_type" CHECK ("type" IN ('buyer','factory'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_phone" ON "users" ("phone")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_referral_code" ON "users" ("referral_code")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "fk_users_referred_by"
       FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // ===== factories =====
    await queryRunner.query(`
      CREATE TABLE "factories" (
        "user_id" uuid NOT NULL,
        "company_name" varchar(256) NOT NULL,
        "business_license" text,
        "hashtags" text[] NOT NULL DEFAULT '{}',
        "location_lat" double precision,
        "location_lng" double precision,
        "moq_default" int NOT NULL DEFAULT 1,
        "shipping_days_min" int NOT NULL DEFAULT 7,
        "shipping_days_max" int NOT NULL DEFAULT 14,
        "price_currency" varchar(3) NOT NULL DEFAULT 'USD',
        "description" varchar(16),
        "verified_at" timestamptz,
        "trust_score" int NOT NULL DEFAULT 50,
        "avg_response_time_min" int NOT NULL DEFAULT 0,
        "success_rate_percent" int NOT NULL DEFAULT 0,
        "description_match_score" int NOT NULL DEFAULT 0,
        "total_deals" int NOT NULL DEFAULT 0,
        "total_products" int NOT NULL DEFAULT 0,
        "trust_score_updated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_factories" PRIMARY KEY ("user_id"),
        CONSTRAINT "fk_factories_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_factories_trust_score"
          CHECK ("trust_score" >= 0 AND "trust_score" <= 100)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_factories_hashtags" ON "factories" USING GIN ("hashtags")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_factories_trust_score" ON "factories" ("trust_score")`,
    );

    // ===== posts =====
    await queryRunner.query(`
      CREATE TABLE "posts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "factory_id" uuid NOT NULL,
        "type" varchar(16) NOT NULL DEFAULT 'product',
        "media" jsonb NOT NULL DEFAULT '[]',
        "title" varchar(256) NOT NULL,
        "description" text,
        "article_number" varchar(64),
        "hashtags" text[] NOT NULL DEFAULT '{}',
        "price_amount" numeric(12,2) NOT NULL,
        "price_currency" varchar(3) NOT NULL,
        "price_tiers" jsonb NOT NULL DEFAULT '[]',
        "moq" int NOT NULL DEFAULT 1,
        "shipping_days" int NOT NULL DEFAULT 7,
        "stock_status" varchar(16) NOT NULL DEFAULT 'in_stock',
        "likes_count" int NOT NULL DEFAULT 0,
        "comments_count" int NOT NULL DEFAULT 0,
        "shares_count" int NOT NULL DEFAULT 0,
        "views_count" int NOT NULL DEFAULT 0,
        "is_hot_deal" boolean NOT NULL DEFAULT false,
        "discount_percent" int NOT NULL DEFAULT 0,
        "deal_expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_posts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_posts_factory" FOREIGN KEY ("factory_id")
          REFERENCES "factories"("user_id") ON DELETE CASCADE,
        CONSTRAINT "chk_posts_type"
          CHECK ("type" IN ('product','reel','hot_deal','group_buy')),
        CONSTRAINT "chk_posts_stock_status"
          CHECK ("stock_status" IN ('in_stock','pre_order','out_of_stock')),
        CONSTRAINT "chk_posts_price_positive" CHECK ("price_amount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_posts_factory_created" ON "posts" ("factory_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_type" ON "posts" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_hashtags" ON "posts" USING GIN ("hashtags")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_hot_deal" ON "posts" ("is_hot_deal", "deal_expires_at")
       WHERE "is_hot_deal" = true`,
    );

    // ===== sms_codes =====
    await queryRunner.query(`
      CREATE TABLE "sms_codes" (
        "phone" varchar(32) NOT NULL,
        "code_hash" varchar(128) NOT NULL,
        "attempts" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "last_sent_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sms_codes" PRIMARY KEY ("phone")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sms_codes_expires_at" ON "sms_codes" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "posts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "factories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
