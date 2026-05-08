export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type UserCreateInput = Pick<User, 'email' | 'name'>;
export type UserUpdateInput = Partial<Pick<User, 'email' | 'name'>>;
