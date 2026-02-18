import { Module } from '@nestjs/common';
import { MangaController } from './manga.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [MangaController],
})
export class MangaModule {}
