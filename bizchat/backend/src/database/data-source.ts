// DataSource для TypeORM CLI — используется для:
//   npm run migration:generate -- src/database/migrations/<name>
//   npm run migration:run
//   npm run migration:revert
//
// В runtime (Nest app) соединение создаётся через TypeOrmModule.forRootAsync
// в app.module.ts и использует те же параметры (через ConfigService).

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Подгружаем .env из корня backend/
dotenv.config({ path: join(__dirname, '../../.env') });

import { User } from '../entities/user.entity';
import { Factory } from '../entities/factory.entity';
import { Post } from '../entities/post.entity';
import { PostLike } from '../entities/post-like.entity';
import { PostSave } from '../entities/post-save.entity';
import { PostComment } from '../entities/post-comment.entity';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';
import { Notification } from '../entities/notification.entity';
import { Follow } from '../entities/follow.entity';
import { GroupBuyOrder } from '../entities/group-buy-order.entity';
import { Story } from '../entities/story.entity';
import { SmsCode } from '../entities/sms-code.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { CurrencyRate } from '../entities/currency-rate.entity';
import { Review } from '../entities/review.entity';
import { UserBlock } from '../entities/user-block.entity';
import { Report } from '../entities/report.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'bizchat',
  password: process.env.DB_PASSWORD || 'bizchat_local_dev',
  database: process.env.DB_DATABASE || 'bizchat',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  entities: [
    User,
    Factory,
    Post,
    PostLike,
    PostSave,
    PostComment,
    Conversation,
    Message,
    Notification,
    Follow,
    GroupBuyOrder,
    Story,
    SmsCode,
    DeviceToken,
    CurrencyRate,
    Review,
    UserBlock,
    Report,
  ],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
});
