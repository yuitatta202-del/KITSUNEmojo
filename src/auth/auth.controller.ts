// backend/src/auth/auth.controller.ts
import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  Logger,
  Post,
  HttpCode,
  HttpStatus,
  Headers,
  Header,
  All,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, AuthResponse, UserRole } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { UserAgent } from './decorators/user-agent.decorator';

// ============================================
// DTOs (Data Transfer Objects)s
// ============================================

/**
 * DTO per la risposta di autenticazione
 */
class AuthResponseDto {
  access_token: string = '';
  token_type: 'Bearer' = 'Bearer';
  expires_in: number = 0;
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    role: UserRole;
    wallet_address?: string;
    is_active: boolean;
  } = {
    id: '',
    email: '',
    name: '',
    avatar_url: '',
    role: UserRole.USER,
    is_active: true,
  };
}

/**
 * DTO per la risposta di stato autenticazione
 */
class AuthStatusResponseDto {
  authenticated: boolean = false;
  user?: {
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
    role?: UserRole;
  };
}

/**
 * DTO per la risposta di configurazione
 */
class ConfigResponseDto {
  googleConfigured: boolean = false;
  jwtConfigured: boolean = false;
  frontendUrl: string = '';
  backendUrl: string = '';
  environment: string = '';
  version: string = '';
}

/**
 * DTO per la risposta di errore
 */
class ErrorResponseDto {
  statusCode: number = 500;
  message: string = '';
  error?: string;
  timestamp: string = '';
  path?: string;
}

// ============================================
// INTERFACCE LOCALI
// ============================================

interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role?: UserRole;
  wallet_address?: string;
  is_active?: boolean;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// ============================================
// CONTROLLER PRINCIPALE - VERSIONE BLINDATA
// ============================================

@ApiTags('Authentication')
@Controller({
  path: 'auth',
  version: '1',
})
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly startTime: number;

  constructor(private readonly authService: AuthService) {
    this.startTime = Date.now();
  }

  // ============================================
  // ENDPOINT PUBBLICI
  // ============================================

  /**
   * Avvia il flusso di autenticazione Google OAuth
   * @description Reindirizza l'utente alla pagina di login di Google
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Login con Google OAuth' })
  @ApiResponse({ status: 302, description: 'Redirect a Google' })
  @Throttle({ default: { limit: 10, ttl: 60 } }) // Max 10 richieste al minuto
  googleAuth(): void {
    this.logger.log('🔄 Google auth initiated');
  }

  /**
   * Callback OAuth di Google
   * @description Riceve il callback da Google, crea/aggiorna utente e reindirizza al frontend
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback OAuth Google' })
  @ApiResponse({ status: 302, description: 'Redirect al frontend con token' })
  @ApiResponse({ status: 400, description: 'Dati Google mancanti' })
  @ApiResponse({ status: 500, description: 'Errore interno' })
  @Throttle({ default: { limit: 20, ttl: 60 } })
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async googleAuthRedirect(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      this.logger.log(`[${requestId}] Google callback received`);

      // Estrai user dal request (aggiunto da Passport)
      const user = (req as any).user;

      // Logging dettagliato
      this.logger.debug(
        `[${requestId}] User data: ${JSON.stringify({
          email: user?.email,
          provider: user?.provider,
          hasName: !!user?.name,
          hasPicture: !!user?.picture,
        })}`,
      );

      // Validazione user
      if (!user) {
        this.logger.error(`[${requestId}] No user data received from Google`);
        return this.redirectWithError(res, 'no_user_data', requestId);
      }

      if (!user.email) {
        this.logger.error(`[${requestId}] User has no email`);
        return this.redirectWithError(res, 'no_email', requestId);
      }

      // Genera token JWT (sincrono)
      const authResponse = this.authService.generateJwtToken(user);

      // Log metrics
      const duration = Date.now() - startTime;
      this.logger.log(
        `[${requestId}] JWT generated in ${duration}ms for user: ${user.email}`,
      );

      // Prepara URL di redirect con token
      const frontendUrl = this.getFrontendUrl();
      const redirectUrl = this.buildCallbackUrl(
        frontendUrl,
        authResponse,
        requestId,
      );

      // Log redirect (senza esporre il token completo)
      this.logger.log(
        `[${requestId}] Redirecting to frontend: ${frontendUrl}/auth/callback`,
      );

      // Set security headers
      this.setSecurityHeaders(res);

      // Redirect
      res.redirect(redirectUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;

      this.logger.error(
        `[${requestId}] Google callback failed after ${duration}ms: ${errorMessage}`,
      );

      // Log dettagliato per debug
      if (error instanceof Error && error.stack) {
        this.logger.debug(`[${requestId}] Stack trace: ${error.stack}`);
      }

      return this.redirectWithError(res, 'auth_failed', requestId);
    }
  }

  /**
   * Ottiene i dati dell'utente corrente
   * @description Richiede token JWT valido
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ottieni utente corrente' })
  @ApiResponse({
    status: 200,
    description: 'Utente trovato',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @Throttle({ default: { limit: 100, ttl: 60 } })
  @Header('Cache-Control', 'private, max-age=60')
  getCurrentUser(
    @Req() req: AuthenticatedRequest,
    @UserAgent() userAgent?: string,
  ): AuthenticatedUser {
    try {
      this.logger.debug(
        `Getting current user: ${req.user?.email} [UA: ${userAgent}]`,
      );

      // Validazione user
      if (!req.user) {
        throw new UnauthorizedException({
          code: 'NO_USER',
          message: 'User not found in request',
        });
      }

      // Return sanitized user
      return {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        avatar_url: req.user.avatar_url,
        role: req.user.role as UserRole,
        wallet_address: req.user.wallet_address,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting current user: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Logout utente
   * @description Il logout è gestito dal frontend (rimozione token)
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout utente' })
  @ApiResponse({ status: 200, description: 'Logout effettuato' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const requestId = this.generateRequestId();

    try {
      this.logger.log(
        `[${requestId}] Logout request received for user: ${req.user?.email}`,
      );

      // Qui puoi aggiungere logiche aggiuntive:
      // - Invalidate token in blacklist (se implementato)
      // - Logout da altri servizi
      // - Event tracking

      // Set security headers
      this.setSecurityHeaders(res);

      res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
        requestId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[${requestId}] Logout failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Logout failed',
        error: errorMessage,
        requestId,
      });
    }
  }

  /**
   * Verifica stato autenticazione
   * @description Utile per il frontend per controllare sessione
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verifica stato autenticazione' })
  @ApiResponse({
    status: 200,
    description: 'Autenticato',
    type: AuthStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Non autenticato' })
  @Throttle({ default: { limit: 200, ttl: 60 } })
  @Header('Cache-Control', 'private, max-age=30')
  authStatus(@Req() req: AuthenticatedRequest): AuthStatusResponseDto {
    return {
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        avatar_url: req.user.avatar_url,
        role: req.user.role as UserRole,
      },
    };
  }

  /**
   * Configurazione autenticazione
   * @description Endpoint pubblico per configurazione frontend
   */
  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Configurazione autenticazione' })
  @ApiResponse({
    status: 200,
    description: 'Configurazione',
    type: ConfigResponseDto,
  })
  @Throttle({ default: { limit: 100, ttl: 60 } })
  @Header('Cache-Control', 'public, max-age=300') // Cache 5 minuti
  getConfig(): ConfigResponseDto {
    const environment = process.env.NODE_ENV || 'development';

    return {
      googleConfigured: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      jwtConfigured: !!process.env.JWT_SECRET,
      frontendUrl: this.getFrontendUrl(),
      backendUrl: this.getBackendUrl(),
      environment,
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  /**
   * Token di sviluppo (SOLO PER TEST)
   * @description Da disabilitare in produzione
   */
  @Public()
  @Get('dev-token')
  @ApiOperation({ summary: 'Token di sviluppo (SOLO TEST)' })
  @ApiResponse({ status: 200, description: 'Token generato' })
  @ApiResponse({ status: 403, description: 'Non disponibile in produzione' })
  @Throttle({ default: { limit: 5, ttl: 60 } })
  getDevToken(
    @Query('role') role?: UserRole,
  ): { token: string; expires_in: number } | { error: string } {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn('⚠️ Attempt to access dev-token in production');
      return { error: 'Not available in production' };
    }

    try {
      const testUser = {
        id: `dev-${Date.now()}`,
        email: `dev-${Date.now()}@example.com`,
        name: 'Development User',
        avatar_url: 'https://via.placeholder.com/150',
        role: (role || UserRole.USER) as string,
        google_id: null,
        provider: 'google',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: null,
        is_active: true,
      } as any;

      const authResponse = this.authService.generateJwtToken(testUser);

      this.logger.debug(`✅ Dev token generated with role: ${testUser.role}`);

      return {
        token: authResponse.access_token,
        expires_in: authResponse.expires_in,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error generating dev token: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * Refresh token
   * @description Ottiene nuovo token con refresh token (se implementato)
   */
  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Token rinnovato',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token non valido' })
  @Throttle({ default: { limit: 20, ttl: 60 } })
  @Header('Cache-Control', 'no-store')
  refreshToken(@Headers('authorization') auth: string): AuthResponseDto {
    try {
      if (!auth) {
        throw new UnauthorizedException('No token provided');
      }

      const token = auth.replace(/^Bearer\s+/i, '');
      const newAuthResponse = this.authService.refreshToken(token);

      this.logger.debug(
        `Token refreshed for user: ${newAuthResponse.user.email}`,
      );

      return newAuthResponse;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error refreshing token: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Health check dell'auth
   * @description Endpoint per monitoring
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service healthy' })
  @Throttle({ default: { limit: 10, ttl: 60 } })
  healthCheck(): {
    status: 'ok' | 'error';
    uptime: number;
    timestamp: string;
    version: string;
  } {
    return {
      status: 'ok',
      uptime: (Date.now() - this.startTime) / 1000,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  // ============================================
  // ENDPOINT DI CATCH-ALL PER ERRORI 404
  // ============================================

  @All('*')
  @Public()
  @ApiOperation({ summary: '404 Handler' })
  @ApiResponse({ status: 404, description: 'Endpoint non trovato' })
  handleNotFound(@Req() req: Request, @Res() res: Response): void {
    const errorResponse: ErrorResponseDto = {
      statusCode: HttpStatus.NOT_FOUND,
      message: `Cannot ${req.method} ${req.url}`,
      error: 'Not Found',
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    this.logger.warn(`404: ${req.method} ${req.url}`);

    res.status(HttpStatus.NOT_FOUND).json(errorResponse);
  }

  // ============================================
  // METODI PRIVATI DI SUPPORTO
  // ============================================

  /**
   * Genera ID univoco per request tracing
   */
  private generateRequestId(): string {
    return `auth_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Ottieni URL frontend con fallback
   */
  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'https://kitsune-mojo.vercel.app';
  }

  /**
   * Ottieni URL backend con fallback
   */
  private getBackendUrl(): string {
    return process.env.BACKEND_URL || 'https://kitsune-backend.onrender.com';
  }

  /**
   * Costruisce URL di callback con token
   */
  private buildCallbackUrl(
    frontendUrl: string,
    authResponse: AuthResponse,
    requestId: string,
  ): string {
    // Costruisci URL base
    const baseUrl = `${frontendUrl}/auth/callback`;

    // Parametri URL
    const params = new URLSearchParams({
      token: authResponse.access_token,
      expires_in: authResponse.expires_in.toString(),
      token_type: authResponse.token_type,
      request_id: requestId,
    });

    // Aggiungi informazioni utente (opzionale, per debug)
    if (process.env.NODE_ENV !== 'production') {
      params.append('user_id', authResponse.user.id);
      params.append('user_email', authResponse.user.email);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Redirect con errore
   */
  private redirectWithError(
    res: Response,
    errorCode: string,
    requestId: string,
  ): void {
    const frontendUrl = this.getFrontendUrl();
    const errorUrl = `${frontendUrl}/auth/error?error=${errorCode}&request_id=${requestId}`;

    this.setSecurityHeaders(res);
    res.redirect(errorUrl);
  }

  /**
   * Imposta headers di sicurezza
   */
  private setSecurityHeaders(res: Response): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Strict-Transport-Security solo in produzione
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }
  }
}
