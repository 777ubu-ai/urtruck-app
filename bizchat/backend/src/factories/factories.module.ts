import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Factory } from '../entities/factory.entity';
import { FactoriesController } from './factories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Factory])],
  controllers: [FactoriesController],
})
export class FactoriesModule {}
