import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

/// Запись о блокировке: blockerId заблокировал blockedId.
@Entity('user_blocks')
@Index(['blockerId'])
@Index(['blockedId'])
export class UserBlock {
  @PrimaryColumn({ name: 'blocker_id', type: 'uuid' })
  blockerId!: string;

  @PrimaryColumn({ name: 'blocked_id', type: 'uuid' })
  blockedId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_id' })
  blocker!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_id' })
  blocked!: User;
}
