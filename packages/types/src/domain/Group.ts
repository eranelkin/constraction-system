export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  emoji: string | null;
  conversationId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  displayName: string;
  joinedAt: Date;
}

export interface PublicGroup extends Group {
  memberCount: number;
  members: GroupMember[];
}

export type CreateGroupDTO = {
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  createdBy: string;
};

export type UpdateGroupDTO = {
  name?: string;
  description?: string | null;
  color?: string | null;
  emoji?: string | null;
};
