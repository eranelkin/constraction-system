import type { PublicGroup } from '../domain/Group.js';

export interface ListGroupsResponse {
  groups: PublicGroup[];
}

export interface GroupResponse {
  group: PublicGroup;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  memberIds?: string[];
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  emoji?: string | null;
}
