import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  /**
   * Endpoint base per test
   */
  getHello(): string {
    return 'Kitsune Mojo API - Decentralized Manga Library 🦊';
  }

  /**
   * Status del server
   */
  getStatus(): {
    status: string;
    timestamp: string;
    version: string;
    environment: string;
  } {
    return {
      status: 'online',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Informazioni API con tutti gli endpoint
   */
  getApiInfo(): {
    name: string;
    description: string;
    version: string;
    authEndpoints: { path: string; method: string; description: string }[];
    userEndpoints: { path: string; method: string; description: string }[];
    analyticsEndpoints: { path: string; method: string; description: string }[];
    readingEndpoints: { path: string; method: string; description: string }[];
    publicEndpoints: { path: string; method: string; description: string }[];
    adminEndpoints: { path: string; method: string; description: string }[];
    docs: string;
  } {
    return {
      name: 'Kitsune Mojo API',
      description: 'Decentralized Manga Library Backend',
      version: '1.0.0',

      // ============================================
      // ENDPOINT DI AUTENTICAZIONE
      // ============================================
      authEndpoints: [
        {
          path: '/api/auth/google',
          method: 'GET',
          description: 'Login con Google (reindirizza a Google)',
        },
        {
          path: '/api/auth/google/callback',
          method: 'GET',
          description: 'Callback OAuth Google (redirect con token)',
        },
        {
          path: '/api/auth/me',
          method: 'GET',
          description: 'Info utente corrente (richiede token JWT)',
        },
        {
          path: '/api/auth/logout',
          method: 'POST',
          description: 'Logout (gestito dal frontend)',
        },
        {
          path: '/api/auth/config',
          method: 'GET',
          description: 'Configurazione autenticazione',
        },
      ],

      // ============================================
      // ENDPOINT UTENTI (richiedono JWT)
      // ============================================
      userEndpoints: [
        {
          path: '/api/users/profile',
          method: 'GET',
          description: 'Profilo utente completo',
        },
        {
          path: '/api/users/bookmarks',
          method: 'GET',
          description: 'Lista bookmark/letture',
        },
        {
          path: '/api/users/bookmarks/:mangaId',
          method: 'POST',
          description: 'Aggiungi/aggiorna bookmark',
        },
        {
          path: '/api/users/bookmarks/:mangaId',
          method: 'DELETE',
          description: 'Rimuovi bookmark',
        },
        {
          path: '/api/users/favorites',
          method: 'GET',
          description: 'Lista preferiti',
        },
        {
          path: '/api/users/history',
          method: 'GET',
          description: 'Cronologia letture',
        },
        {
          path: '/api/users/stats',
          method: 'GET',
          description: 'Statistiche personali',
        },
        {
          path: '/reader/bookmarks',
          method: 'GET',
          description: 'Bookmarks legacy (con x-wallet header)',
        },
      ],

      // ============================================
      // ENDPOINT ANALYTICS E TRACKING
      // ============================================
      analyticsEndpoints: [
        {
          path: '/api/track',
          method: 'POST',
          description: 'Traccia evento generico',
        },
        {
          path: '/api/vote',
          method: 'POST',
          description: 'Traccia voto',
        },
        {
          path: '/api/stats/quick',
          method: 'GET',
          description: 'Statistiche rapide',
        },
        {
          path: '/api/analytics/realtime',
          method: 'GET',
          description: 'Statistiche in tempo reale',
        },
        {
          path: '/api/analytics/trends',
          method: 'GET',
          description: 'Trend giornalieri',
        },
        {
          path: '/api/analytics/top-performing',
          method: 'GET',
          description: 'Contenuti più visualizzati',
        },
        {
          path: '/api/analytics/summary',
          method: 'GET',
          description: 'Sommario analytics',
        },
        {
          path: '/api/analytics/dashboard',
          method: 'GET',
          description: 'Dashboard analytics completa',
        },
        {
          path: '/api/analytics/daily',
          method: 'GET',
          description: 'Statistiche giornaliere',
        },
        {
          path: '/api/analytics/events',
          method: 'GET',
          description: 'Statistiche per tipo evento',
        },
        {
          path: '/api/analytics/hourly',
          method: 'GET',
          description: 'Statistiche orarie',
        },
        {
          path: '/api/analytics/dashboard/v2',
          method: 'GET',
          description: 'Dashboard analytics v2',
        },
      ],

      // ============================================
      // ENDPOINT LETTURA
      // ============================================
      readingEndpoints: [
        {
          path: '/api/reading/start',
          method: 'POST',
          description: 'Inizia sessione di lettura',
        },
        {
          path: '/api/reading/page',
          method: 'POST',
          description: 'Traccia cambio pagina',
        },
        {
          path: '/api/vote-manga',
          method: 'POST',
          description: 'Vota manga (versione semplice)',
        },
        {
          path: '/reader/manga/:id/votes',
          method: 'GET',
          description: 'Stato voti manga',
        },
        {
          path: '/reader/manga/:id/vote',
          method: 'POST',
          description: 'Vota manga (versione reader)',
        },
        {
          path: '/reader/manga/:id/progress',
          method: 'POST',
          description: 'Salva progresso lettura',
        },
        {
          path: '/reader/manga/:id/progress',
          method: 'GET',
          description: 'Recupera progresso lettura',
        },
      ],

      // ============================================
      // ENDPOINT PUBBLICI
      // ============================================
      publicEndpoints: [
        { path: '/', method: 'GET', description: 'Home' },
        { path: '/api/status', method: 'GET', description: 'Server status' },
        { path: '/api-info', method: 'GET', description: 'API information' },
        {
          path: '/admin/manga',
          method: 'GET',
          description: 'Lista manga pubblica',
        },
        {
          path: '/admin/manga/:id',
          method: 'GET',
          description: 'Dettaglio manga',
        },
        { path: '/admin/artists', method: 'GET', description: 'Lista artisti' },
        { path: '/admin/tags', method: 'GET', description: 'Lista tag' },
        {
          path: '/admin/popular-tags',
          method: 'GET',
          description: 'Tag popolari',
        },
        {
          path: '/admin/system-stats',
          method: 'GET',
          description: 'Statistiche sistema',
        },
        { path: '/admin/health', method: 'GET', description: 'Health check' },
        {
          path: '/supabase/test',
          method: 'GET',
          description: 'Test connessione',
        },
        {
          path: '/supabase/health',
          method: 'GET',
          description: 'Health check Supabase',
        },
        {
          path: '/supabase/stats',
          method: 'GET',
          description: 'Statistiche Supabase',
        },
        {
          path: '/supabase/manga',
          method: 'GET',
          description: 'Lista manga con filtri',
        },
        {
          path: '/supabase/manga/:id/details',
          method: 'GET',
          description: 'Dettagli completi',
        },
        {
          path: '/supabase/manga/:id/stats',
          method: 'GET',
          description: 'Statistiche manga',
        },
        { path: '/supabase/tags', method: 'GET', description: 'Lista tag' },
        {
          path: '/supabase/artists',
          method: 'GET',
          description: 'Lista artisti',
        },
        {
          path: '/supabase/categories',
          method: 'GET',
          description: 'Lista categorie',
        },
      ],

      // ============================================
      // ENDPOINT ADMIN
      // ============================================
      adminEndpoints: [
        {
          path: '/admin/manga/details',
          method: 'GET',
          description: 'Tutti i manga (admin)',
        },
        {
          path: '/admin/manga-list',
          method: 'GET',
          description: 'Lista manga admin',
        },
        {
          path: '/admin/manga/:id/visibility',
          method: 'PUT',
          description: 'Cambia visibilità',
        },
        {
          path: '/admin/manga/:id',
          method: 'DELETE',
          description: 'Elimina manga',
        },
        {
          path: '/admin/import',
          method: 'POST',
          description: 'Import singolo',
        },
        { path: '/admin/bulk', method: 'POST', description: 'Import massivo' },
        {
          path: '/admin/maintenance/repair-all',
          method: 'POST',
          description: 'Ripara link',
        },
        {
          path: '/admin/maintenance/clear-cache',
          method: 'POST',
          description: 'Pulisce cache',
        },
        {
          path: '/admin/stats',
          method: 'GET',
          description: 'Statistiche dettagliate',
        },
        {
          path: '/import/single',
          method: 'POST',
          description: 'Import singolo (alternativo)',
        },
        {
          path: '/import/bulk',
          method: 'POST',
          description: 'Import massivo (alternativo)',
        },
      ],

      docs: 'https://github.com/yourusername/kitsune-mojo',
    };
  }

  /**
   * Statistiche del server
   */
  getServerStats(): {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    timestamp: string;
  } {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Informazioni sull'ambiente
   */
  getEnvironmentInfo(): {
    nodeVersion: string;
    platform: string;
    arch: string;
    cwd: string;
    pid: number;
  } {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      pid: process.pid,
    };
  }

  /**
   * Verifica che il modulo Auth sia configurato correttamente
   */
  checkAuthConfig(): {
    googleConfigured: boolean;
    jwtConfigured: boolean;
    frontendUrl: string;
    backendUrl: string;
  } {
    return {
      googleConfigured: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      jwtConfigured: !!process.env.JWT_SECRET,
      frontendUrl:
        process.env.FRONTEND_URL || 'https://kitsune-mojo.vercel.app',
      backendUrl:
        process.env.BACKEND_URL || 'https://kitsune-backend.onrender.com',
    };
  }

  /**
   * Statistiche riassuntive del sistema
   */
  getSystemSummary(): {
    status: string;
    uptime: string;
    memory: string;
    environment: string;
    apiVersion: string;
  } {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    return {
      status: 'online',
      uptime: `${hours}h ${minutes}m`,
      memory: `${memoryMB} MB`,
      environment: process.env.NODE_ENV || 'development',
      apiVersion: '1.0.0',
    };
  }
}
