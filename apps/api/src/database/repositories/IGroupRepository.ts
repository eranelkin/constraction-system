import type { Group, PublicGroup, CreateGroupDTO, UpdateGroupDTO } from '@constractor/types';

export type { IGroupRepository };

interface IGroupRepository {
  listAll(): Promise<PublicGroup[]>;
  findById(id: string): Promise<PublicGroup | null>;
  create(data: CreateGroupDTO): Promise<Group>;
  update(id: string, data: UpdateGroupDTO): Promise<Group | null>;
  delete(id: string): Promise<void>;
  addMember(groupId: string, userId: string): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  setMembers(groupId: string, userIds: string[]): Promise<void>;
  listByUserId(userId: string): Promise<Group[]>;
  setConversationId(groupId: string, conversationId: string): Promise<void>;
  syncUserMemberships(userId: string, groupIds: string[]): Promise<void>;
}
