import type { RfiWithUsers, CreateRfiDTO, UpdateRfiDTO, RfiStatus, RfiPriority } from '@constractor/types';

export type { IRfiRepository };

interface IRfiRepository {
  list(filters?: { status?: RfiStatus; priority?: RfiPriority }): Promise<RfiWithUsers[]>;
  findById(id: string): Promise<RfiWithUsers | null>;
  create(data: CreateRfiDTO): Promise<RfiWithUsers>;
  update(id: string, data: UpdateRfiDTO): Promise<RfiWithUsers | null>;
  delete(id: string): Promise<void>;
}
