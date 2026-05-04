export type RfiPriority = 'low' | 'medium' | 'high' | 'critical';
export type RfiStatus   = 'open' | 'in-review' | 'answered' | 'closed';

export interface Rfi {
  id: string;
  number: number;
  title: string;
  description: string;
  project: string | null;
  priority: RfiPriority;
  status: RfiStatus;
  createdBy: string;
  assignedTo: string | null;
  dueDate: string | null;
  response: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RfiWithUsers extends Rfi {
  creatorName: string;
  assigneeName: string | null;
}


export type CreateRfiDTO = {
  title: string;
  description: string;
  project?: string;
  priority: RfiPriority;
  createdBy: string;
  assignedTo?: string;
  dueDate?: string;
};

export type UpdateRfiDTO = {
  status?: RfiStatus;
  priority?: RfiPriority;
  assignedTo?: string | null;
  dueDate?: string | null;
  response?: string | null;
  resolvedAt?: Date | null;
};
