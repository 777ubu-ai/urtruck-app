import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { CurrencyRate } from '../entities/currency-rate.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CurrencyRate]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [CurrencyController],
  providers: [CurrencyService, JwtAuthGuard],
  exports: [CurrencyService],
})
export class CurrencyModule {}
