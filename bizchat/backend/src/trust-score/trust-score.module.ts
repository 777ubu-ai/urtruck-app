import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { Factory } from '../entities/factory.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TrustScoreController } from './trust-score.controller';
import { TrustScoreService } from './trust-score.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Factory]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [TrustScoreController],
  providers: [TrustScoreService, JwtAuthGuard],
  exports: [TrustScoreService],
})
export class TrustScoreModule {}
