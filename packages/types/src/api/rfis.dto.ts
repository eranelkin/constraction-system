import type { RfiWithUsers, RfiPriority, RfiStatus } from '../domain/Rfi.js';

export interface ListRfisResponse {
  rfis: RfiWithUsers[];
  total: number;
}

export interface RfiResponse {
  rfi: RfiWithUsers;
}

export interface CreateRfiRequest {
  title: string;
  description: string;
  priority: RfiPriority;
  assignedTo?: string;
  dueDate?: string;
}

export interface UpdateRfiRequest {
  status?: RfiStatus;
  priority?: RfiPriority;
  assignedTo?: string | null;
  dueDate?: string | null;
  response?: string | null;
}
