import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Story } from '../entities/story.entity';
import { Factory } from '../entities/factory.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { CreateStoryDto } from './dto/create-story.dto';

/**
 * Stories endpoints. Все stories живут 24 часа после создания —
 * `expires_at = created_at + 24h`. Активность фильтруется через
 * `WHERE expires_at > NOW()` (см. /stories listing).
 */
@Controller('stories')
export class StoriesController {
  constructor(
    @InjectRepository(Story)
    private readonly stories: Repository<Story>,
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
  ) {}

  /**
   * GET /api/v1/stories
   *
   * Все активные stories, **сгруппированные по автору**. Каждая группа =
   * один pop-up в horizontal ring-виджете ленты. Внутри группы — массив
   * активных stories этого автора, отсортированный по `created_at ASC`
   * (старые сначала, чтобы viewer показывал в хронологическом порядке).
   *
   * Открытый endpoint — гости тоже могут смотреть stories.
   */
  @Get()
  async listActive() {
    const now = new Date();
    const rows = await this.stories.find({
      where: { expiresAt: MoreThan(now) },
      relations: ['user', 'user.factory'],
      order: { createdAt: 'ASC' },
    });

    // Группируем по userId. Map preserves insertion order — первый story
    // от каждого автора определяет позицию автора в ring-виджете.
    const groupsMap = new Map<
      string,
      {
        user: {
          id: string;
          name: string | null;
          avatarUrl: string | null;
          companyName: string | null;
          type: string;
        };
        stories: Array<{
          id: string;
          mediaUrl: string;
          mediaType: string;
          thumbnailUrl: string | null;
          caption: string | null;
          viewCount: number;
          createdAt: Date;
          expiresAt: Date;
        }>;
        latestAt: Date;
      }
    >();

    for (const s of rows) {
      const existing = groupsMap.get(s.userId);
      const storyDto = {
        id: s.id,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        thumbnailUrl: s.thumbnailUrl,
        caption: s.caption,
        viewCount: s.viewCount,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      };
      if (existing) {
        existing.stories.push(storyDto);
        if (s.createdAt > existing.latestAt) existing.latestAt = s.createdAt;
      } else {
        groupsMap.set(s.userId, {
          user: {
            id: s.user.id,
            name: s.user.name,
            avatarUrl: s.user.avatarUrl,
            companyName: s.user.factory?.companyName ?? null,
            type: s.user.type,
          },
          stories: [storyDto],
          latestAt: s.createdAt,
        });
      }
    }

    // Сортируем группы по latestAt DESC — недавно обновлённые stories слева
    const groups = Array.from(groupsMap.values()).sort(
      (a, b) => b.latestAt.getTime() - a.latestAt.getTime(),
    );

    return {
      data: groups.map((g) => ({
        user: g.user,
        stories: g.stories,
      })),
    };
  }

  /**
   * POST /api/v1/stories
   *
   * Создать story. Только factory — байеры stories не публикуют.
   * `expires_at` = `created_at + 24 часа` ставится здесь.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createStory(
    @Body() dto: CreateStoryDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    const userType = req.user!.type;

    if (userType !== 'factory') {
      throw new ForbiddenException(
        'Stories могут публиковать только заводы',
      );
    }
    // Проверяем что factory запись существует
    const factory = await this.factories.findOne({ where: { userId } });
    if (!factory) {
      throw new NotFoundException('Запись завода не найдена');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const created = await this.stories.save(
      this.stories.create({
        userId,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType ?? 'image',
        thumbnailUrl: dto.thumbnailUrl ?? null,
        caption: dto.caption ?? null,
        expiresAt,
      }),
    );

    return {
      id: created.id,
      mediaUrl: created.mediaUrl,
      mediaType: created.mediaType,
      thumbnailUrl: created.thumbnailUrl,
      caption: created.caption,
      viewCount: 0,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    };
  }

  /**
   * POST /api/v1/stories/:id/view
   *
   * Инкремент счётчика просмотров. Открытый endpoint — гости тоже считаются.
   * В prod — фильтр на дубликаты от одного юзера, но для MVP не критично.
   */
  @Post(':id/view')
  @HttpCode(200)
  async incrementView(@Param('id', new ParseUUIDPipe()) storyId: string) {
    const story = await this.stories.findOne({
      where: { id: storyId },
      select: ['id', 'expiresAt'],
    });
    if (!story) {
      throw new NotFoundException('История не найдена');
    }
    // Не инкрементируем если уже истекла
    if (story.expiresAt.getTime() <= Date.now()) {
      return { viewed: false };
    }
    await this.stories.increment({ id: storyId }, 'viewCount', 1);
    return { viewed: true };
  }

  /**
   * DELETE /api/v1/stories/:id
   *
   * Удалить свою story. Только автор может удалять.
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteStory(
    @Param('id', new ParseUUIDPipe()) storyId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    const story = await this.stories.findOne({
      where: { id: storyId },
      select: ['id', 'userId'],
    });
    if (!story) {
      throw new NotFoundException('История не найдена');
    }
    if (story.userId !== userId) {
      throw new ForbiddenException('Можно удалять только свои stories');
    }
    await this.stories.delete({ id: storyId });
  }
}
