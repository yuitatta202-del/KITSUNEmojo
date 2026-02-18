import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    return 'Hello World!';
  }

  getStatus(): { status: string; timestamp: string; version: string } {
    return {
      status: 'online',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  getApiInfo(): { endpoints: string[]; docs: string } {
    return {
      endpoints: [
        '/admin/manga',
        '/admin/import',
        '/admin/bulk',
        '/admin/proxy',
        '/admin/stats',
        '/supabase/import',
        '/supabase/bulk',
        '/api/event',
      ],
      docs: 'https://github.com/tuo/repo',
    };
  }
}
