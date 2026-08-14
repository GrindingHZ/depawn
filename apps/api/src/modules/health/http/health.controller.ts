import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  read(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
