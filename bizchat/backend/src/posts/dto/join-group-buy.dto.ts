import { IsInt, Max, Min } from 'class-validator';

export class JoinGroupBuyDto {
  /**
   * Количество штук, которое юзер хочет заказать в рамках group buy.
   * Минимум 1, максимум — разумный лимит 1_000_000 (чтобы не ломать
   * int-счётчики в случае опечатки).
   */
  @IsInt()
  @Min(1, { message: 'Количество должно быть ≥ 1' })
  @Max(1_000_000, { message: 'Слишком большое количество' })
  quantity!: number;
}
