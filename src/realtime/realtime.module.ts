import { Module, Global } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller'; // ← AGGIUNTO
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [RealtimeController], // ← AGGIUNTO
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
