import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Carica le variabili d'ambiente
config();

async function testConnection() {
  console.log('🔍 Test connessione Supabase...');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  console.log('SUPABASE_URL:', supabaseUrl ? '✅ Presente' : '❌ Mancante');
  console.log(
    'SUPABASE_SERVICE_KEY:',
    supabaseKey ? '✅ Presente' : '❌ Mancante',
  );

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ ERRORE: Credenziali mancanti!');
    console.log('\n📝 Assicurati di aver configurato il file .env con:');
    console.log('SUPABASE_URL=https://qrygdslzzmmndutpvkgi.supabase.co');
    console.log(
      'SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeWdkc2x6em1tbmR1dHB2a2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4NjA3NiwiZXhwIjoyMDg2MzYyMDc2fQ.6K8LmN9rP2sT3vW4xY5zA6bC7dE8fG9hI0jK1lM2nO',
    );
    process.exit(1);
  }

  console.log('\n📊 Tentativo di connessione...');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test semplice: prova a contare i manga
    const { count, error } = await supabase
      .from('manga')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Errore di connessione:', error.message);

      // Diagnostica aggiuntiva
      if (
        error.message.includes('relation') ||
        error.message.includes('does not exist')
      ) {
        console.log('\n🔧 La tabella "manga" non esiste nel database.');
        console.log('   Dovresti creare le tabelle prima di procedere.');
      } else if (
        error.message.includes('permission') ||
        error.message.includes('policy')
      ) {
        console.log('\n🔧 Problema di permessi. Verifica che:');
        console.log('   1. La service_role key sia corretta');
        console.log(
          '   2. RLS (Row Level Security) sia configurato correttamente',
        );
      }
    } else {
      console.log('✅ Connessione riuscita!');
      console.log(`📊 Totale manga nel database: ${count}`);

      // Test aggiuntivo: prova a leggere un record
      const { data: sample, error: sampleError } = await supabase
        .from('manga')
        .select('id, titolo')
        .limit(1);

      if (sampleError) {
        console.log(
          '⚠️  Non è stato possibile leggere i dati:',
          sampleError.message,
        );
      } else if (sample && sample.length > 0) {
        console.log('📖 Primo manga trovato:', sample[0].titolo);
      } else {
        console.log('📖 Nessun manga trovato nel database (tabella vuota)');
      }
    }
  } catch (err) {
    console.error('❌ Eccezione durante il test:', err);
  }
}

// Esegui il test
testConnection().catch(console.error);
