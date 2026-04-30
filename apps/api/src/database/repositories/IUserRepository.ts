import type { User, CreateUserDTO, UpdateUserDTO, PublicUser, ContactUser } from '@constractor/types';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  listAll(excludeId: string): Promise<ContactUser[]>;
  listAllFull(): Promise<PublicUser[]>;
  create(data: CreateUserDTO): Promise<User>;
  update(id: string, data: UpdateUserDTO): Promise<User | null>;
  delete(id: string): Promise<void>;
  countByRole(role: string): Promise<number>;
}
