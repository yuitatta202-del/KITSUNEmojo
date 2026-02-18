import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BulkController } from './bulk.controller'; // <-- Aggiunto
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [AdminController, BulkController], // <-- BulkController aggiunto qui
})
export class AdminModule {}
