import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppConfig } from '../config/configuration';
import { Report } from '../entities/report.entity';
import { UserBlock } from '../entities/user-block.entity';
import { ModerationController } from './moderation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserBlock, Report]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [ModerationController],
  providers: [JwtAuthGuard],
})
export class ModerationModule {}
