import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';

async function bootstrap() {
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
    'https://kitsun-emojo.vercel.app', // ← IL TUO DOMINIO VERCEL
    'https://kitsune-backend.onrender.com', // ← IL TUO DOMINIO RENDER
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

  // 5. AVVIO SERVER
  await app.listen(port);

  console.log(
    '\n\x1b[36m%s\x1b[0m',
    '--------------------------------------------------',
  );
  console.log(' 🦊 KITSUNE MOJO ENGINE - READY');
  console.log(` 🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` 🔌 Port: ${port}`);
  console.log(' 📊 Master Control: http://localhost:3000/admin.html');
  console.log(' 📈 Intelligence:  http://localhost:3000/analytics.html');
  console.log(
    ' 🖼️ Proxy Test: http://localhost:3000/admin/proxy?url=https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
  );
  console.log(
    '\x1b[36m%s\x1b[0m',
    '--------------------------------------------------\n',
  );
}

void bootstrap();
