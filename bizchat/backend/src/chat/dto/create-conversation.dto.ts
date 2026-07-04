import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  /**
   * UUID второго участника беседы. Бэк нормализует пару (min, max) и
   * либо находит существующую беседу, либо создаёт новую.
   */
  @IsUUID()
  participantUserId!: string;
}
