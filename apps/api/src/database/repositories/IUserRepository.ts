import type { User, CreateUserDTO, UpdateUserDTO, PublicUser, ContactUser } from '@constractor/types';

export interface AvatarData {
  data: Buffer;
  mimeType: string;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  listAll(excludeId: string): Promise<ContactUser[]>;
  listAllFull(): Promise<PublicUser[]>;
  create(data: CreateUserDTO): Promise<User>;
  update(id: string, data: UpdateUserDTO): Promise<User | null>;
  delete(id: string): Promise<void>;
  countByRole(role: string): Promise<number>;
  getAvatar(id: string): Promise<AvatarData | null>;
}
