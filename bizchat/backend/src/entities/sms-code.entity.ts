import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * Одноразовый SMS-код для регистрации/входа по телефону.
 * Живёт в БД в dev (чтобы разработчику было видно в pgadmin).
 * В проде этот же код кладётся в Redis (быстрее + TTL из коробки).
 *
 * Ключ — номер телефона в E.164 формате (+79991234567).
 * При повторном send перезаписывается.
 */
@Entity({ name: 'sms_codes' })
@Index('idx_sms_codes_expires_at', ['expiresAt'])
export class SmsCode {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  phone!: string;

  // Хеш кода (sha256), оригинал хранить нельзя (требование безопасности)
  @Column({ name: 'code_hash', type: 'varchar', length: 128 })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({
    name: 'last_sent_at',
    type: 'timestamptz',
  })
  lastSentAt!: Date;
}
