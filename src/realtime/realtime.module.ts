import { Module, Global } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Global() // Rende il servizio disponibile globalmente
@Module({
  imports: [SupabaseModule],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
