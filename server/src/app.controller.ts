import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  health(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'whale-tutor-server',
      timestamp: new Date().toISOString(),
    };
  }
}
