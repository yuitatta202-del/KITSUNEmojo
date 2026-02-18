import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. AUMENTO LIMITI PAYLOAD (Evita errori 413 Payload Too Large)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // 2. CONFIGURAZIONE CORS OTTIMIZZATA
  app.enableCors({
    origin: '*', // Permette l'accesso da qualsiasi dominio per la massima scalabilità
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

  // 3. ASSETS STATICI
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // 4. AVVIO SERVER
  await app.listen(3000);

  console.log(
    '\n\x1b[36m%s\x1b[0m',
    '--------------------------------------------------',
  );
  console.log(' 🦊 KITSUNE MOJO ENGINE - READY');
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
