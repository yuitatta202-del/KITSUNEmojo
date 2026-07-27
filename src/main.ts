import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';
import { Logger } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service'; // Importa il tipo

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // 1. PORTA DINAMICA (FONDAMENTALE per Render/Railway)
    const port = process.env.PORT || 3000;

    // 2. AUMENTO LIMITI PAYLOAD (Evita errori 413 Payload Too Large)
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ limit: '50mb', extended: true }));

    // 3. CONFIGURAZIONE CORS OTTIMIZZATA
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://kitsun-emojo.vercel.app',
      'https://kitsune-backend.onrender.com',
      // Aggiungi altri domani se necessario
    ];

    app.enableCors({
      origin: (origin, callback) => {
        // Permetti richieste senza origin (come app mobile o Postman)
        if (!origin) return callback(null, true);

        if (
          allowedOrigins.includes(origin) ||
          process.env.NODE_ENV !== 'production'
        ) {
          callback(null, true);
        } else {
          logger.warn(`CORS blocked for origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Accept',
        'x-signature',
        'x-message',
        'x-wallet',
        'Authorization',
      ],
    });

    // 4. ASSETS STATICI (se vuoi servire file dalla cartella public)
    app.useStaticAssets(join(__dirname, '..', 'public'));

    // 5. GLOBAL PREFIX (opzionale - se vuoi un prefisso per tutte le API)
    // app.setGlobalPrefix('api');

    // 6. AVVIO SERVER
    await app.listen(port);

    // 7. LOG DI SUCCESSO
    console.log(
      '\n\x1b[36m%s\x1b[0m',
      '--------------------------------------------------',
    );
    console.log(' 🦊 KITSUNE MOJO ENGINE - READY');
    console.log(` 🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` 🔌 Port: ${port}`);
    console.log(` 📊 Master Control: http://localhost:${port}/admin.html`);
    console.log(` 📈 Intelligence:  http://localhost:${port}/analytics.html`);
    console.log(
      ' 🖼️ Proxy Test: http://localhost:3000/admin/proxy?url=https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
    );
    console.log(
      '\x1b[36m%s\x1b[0m',
      '--------------------------------------------------\n',
    );

    // 8. TEST SUPABASE CONNECTION (type-safe)
    try {
      // Usa il tipo corretto invece di any
      const supabaseService = app.get<SupabaseService>(SupabaseService);

      // Verifica che il metodo esista prima di chiamarlo
      if (supabaseService && 'testConnection' in supabaseService) {
        const isConnected = await supabaseService.testConnection();
        if (isConnected) {
          logger.log('✅ Supabase connection successful');
        } else {
          logger.warn('⚠️ Supabase connection failed');
        }
      } else {
        logger.debug('Supabase service does not have testConnection method');
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      logger.debug('Supabase service not available for testing');
    }
  } catch (err) {
    console.error('❌ Failed to start application:', err);
    process.exit(1);
  }
}

void bootstrap(); // Rimosso void, chiamata diretta
