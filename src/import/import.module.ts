import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule], // ✅ Importa SupabaseModule per usare SupabaseService
  controllers: [ImportController], // ✅ Registra il controller
  providers: [ImportService], // ✅ Registra il service
  exports: [ImportService], // ✅ Esporta il service per altri moduli
})
export class ImportModule {}
