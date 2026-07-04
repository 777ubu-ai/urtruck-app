import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  JwtAuthGuard,
  type RequestWithUser,
} from '../auth/jwt-auth.guard';
import { UserBlock } from '../entities/user-block.entity';
import { Report, type ReportTargetType } from '../entities/report.entity';

const VALID_TARGET_TYPES: ReportTargetType[] = [
  'post',
  'user',
  'message',
  'comment',
];
const VALID_REASONS = [
  'spam',
  'inappropriate',
  'fraud',
  'fake',
  'offensive',
  'other',
];

@Controller()
@UseGuards(JwtAuthGuard)
export class ModerationController {
  private readonly logger = new Logger(ModerationController.name);

  constructor(
    @InjectRepository(UserBlock)
    private readonly blocks: Repository<UserBlock>,
    @InjectRepository(Report)
    private readonly reports: Repository<Report>,
  ) {}

  /**
   * POST /api/v1/users/:id/block — заблокировать юзера.
   * Идемпотентно: повторный вызов не падает.
   */
  @Post('users/:id/block')
  @HttpCode(HttpStatus.OK)
  async block(@Req() req: RequestWithUser, @Param('id') blockedId: string) {
    const me = req.user!.sub;
    if (me === blockedId) {
      throw new BadRequestException('Нельзя заблокировать себя');
    }
    await this.blocks
      .createQueryBuilder()
      .insert()
      .into(UserBlock)
      .values({ blockerId: me, blockedId })
      .orIgnore()
      .execute();
    return { blocked: true };
  }

  @Delete('users/:id/block')
  @HttpCode(HttpStatus.OK)
  async unblock(@Req() req: RequestWithUser, @Param('id') blockedId: string) {
    const me = req.user!.sub;
    await this.blocks.delete({ blockerId: me, blockedId });
    return { blocked: false };
  }

  /**
   * GET /api/v1/users/me/blocks — список заблокированных мной юзеров.
   */
  @Get('users/me/blocks')
  async myBlocks(@Req() req: RequestWithUser) {
    const me = req.user!.sub;
    const blocks = await this.blocks.find({
      where: { blockerId: me },
      order: { createdAt: 'DESC' },
    });
    return { data: blocks.map((b) => ({ blockedId: b.blockedId, createdAt: b.createdAt })) };
  }

  /**
   * POST /api/v1/reports — пожаловаться на пост/юзера/сообщение/коммент.
   * body: { targetType, targetId, reason, description? }
   */
  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  async report(
    @Req() req: RequestWithUser,
    @Body()
    body: {
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
      description?: string;
    },
  ) {
    const me = req.user!.sub;
    if (!VALID_TARGET_TYPES.includes(body.targetType)) {
      throw new BadRequestException('Неверный target_type');
    }
    if (!VALID_REASONS.includes(body.reason)) {
      throw new BadRequestException('Неверная причина (reason)');
    }
    if (!body.targetId) {
      throw new BadRequestException('targetId обязателен');
    }
    const report = await this.reports.save(
      this.reports.create({
        reporterId: me,
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        description: body.description ?? null,
      }),
    );
    this.logger.warn(
      `[REPORT] ${body.targetType}/${body.targetId} reason=${body.reason} from=${me.slice(0, 8)}`,
    );
    return { id: report.id, accepted: true };
  }
}
