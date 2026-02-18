// src/reader/reader.module.ts ✅ CORRETTO
import { Module } from '@nestjs/common';
import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule], // ✅ Dipendenze del modulo
  controllers: [ReaderController], // ✅ I controller vanno qui
  providers: [ReaderService], // ✅ I service vanno qui
  exports: [ReaderService], // ✅ Esporta per altri moduli
})
export class ReaderModule {}
