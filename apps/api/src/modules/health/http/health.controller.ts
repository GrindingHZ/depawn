import { Controller, Get } from '@nestjs/common';
import { Public } from '../../shared/http/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  read(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
