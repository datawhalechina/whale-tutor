import { Body, Controller, Get, Post } from '@nestjs/common';
import type { User, UserCreateInput } from '@whale-tutor/tutor-types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<User[]> {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: UserCreateInput): Promise<{ id: number }> {
    return this.users.create(body);
  }
}
