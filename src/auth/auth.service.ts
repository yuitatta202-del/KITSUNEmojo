import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import type { User } from '../supabase/supabase.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cache } from '@nestjs/cache-manager';

// ============================================
// ENUM PER STATI E RUOLI
// ============================================

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  EDITOR = 'editor',
  MODERATOR = 'moderator',
}

export enum AuthProvider {
  GOOGLE = 'google',
  WALLET = 'wallet',
  EMAIL = 'email',
}

// ============================================
// INTERFACCE AVANZATE CON JSDOC COMPLETO
// ============================================

/**
 * Profilo utente proveniente da Google OAuth
 */
export interface GoogleProfile {
  id: string;
  displayName: string;
  emails: Array<{ value: string; verified: boolean }>;
  photos: Array<{ value: string }>;
  provider: string;
  name?: {
    givenName: string;
    familyName: string;
  };
}

/**
 * Utente Google normalizzato per il nostro sistema
 */
export interface GoogleUser {
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  accessToken: string;
  refreshToken?: string;
  provider: string;
  providerId: string;
}

/**
 * Payload del token JWT
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  wallet_address?: string;
  iat?: number;
  exp?: number;
}

/**
 * Risposta di autenticazione standardizzata
 */
export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    role: UserRole;
    wallet_address?: string;
    is_active: boolean;
  };
}

/**
 * Evento emesso dopo il login
 */
export interface UserLoginEvent {
  userId: string;
  email: string;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  provider: AuthProvider;
}

/**
 * Evento emesso dopo la registrazione
 */
export interface UserRegisteredEvent extends UserLoginEvent {
  provider: AuthProvider;
}

/**
 * Evento wallet connesso
 */
export interface WalletConnectedEvent {
  userId: string;
  wallet: string;
  timestamp: Date;
}

/**
 * Evento ruolo cambiato
 */
export interface RoleChangedEvent {
  userId: string;
  newRole: UserRole;
  oldRole?: UserRole;
  timestamp: Date;
}

/**
 * Evento stato utente cambiato
 */
export interface UserActiveChangedEvent {
  userId: string;
  isActive: boolean;
  timestamp: Date;
}

/**
 * Evento errore autenticazione
 */
export interface AuthErrorEvent {
  type: 'validation' | 'token' | 'login' | 'registration';
  provider?: AuthProvider;
  error: string;
  timestamp: Date;
  userId?: string;
  email?: string;
}

/**
 * Statistiche utente per dashboard admin
 */
export interface UserStatistics {
  total: number;
  activeToday: number;
  activeWeek: number;
  activeMonth: number;
  byProvider: Record<AuthProvider, number>;
  byRole: Record<UserRole, number>;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  loginFrequency: {
    daily: number[];
    weekly: number[];
    monthly: number[];
  };
}

/**
 * Opzioni per retry
 */
interface RetryOptions {
  maxRetries: number;
  retryDelay?: number;
  backoffFactor?: number;
  requestId?: string;
}

/**
 * Filtri per ricerca utenti
 */
export interface UserFilterOptions {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  provider?: AuthProvider;
  fromDate?: Date;
  toDate?: Date;
}

// ============================================
// DECORATOR PERSONALIZZATO PER METRICHE
// ============================================

function LogPerformance() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      const requestId = args[args.length - 1]?.requestId || 'unknown';

      try {
        const result = await originalMethod.apply(this, args);
        const end = performance.now();
        const duration = end - start;

        const logger = new Logger('Performance');
        logger.debug(
          `[${requestId}] ${propertyKey} executed in ${duration.toFixed(2)}ms`,
        );

        // ✅ Cast a any per accedere a eventEmitter
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const instance = this as any;
        if (instance?.eventEmitter) {
          instance.eventEmitter.emit('metrics.performance', {
            method: propertyKey,
            duration,
            requestId,
            timestamp: new Date(),
          });
        }

        return result;
      } catch (error) {
        const end = performance.now();
        const duration = end - start;
        Logger.error(
          `[${requestId}] ${propertyKey} failed after ${duration.toFixed(2)}ms`,
        );
        throw error;
      }
    };
    return descriptor;
  };
}

// ============================================
// SERVICE PRINCIPALE - VERSIONE CARROARMATO
// ============================================

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string = '7d';
  private readonly refreshTokenExpiresIn: string = '30d';
  private readonly cacheTTL = {
    user: 300000, // 5 minuti
    admin: 600000, // 10 minuti
    stats: 3600000, // 1 ora
    google: 300000, // 5 minuti
    wallet: 300000, // 5 minuti
  };
  private readonly rateLimits = {
    validateGoogle: 10,
    generateToken: 100,
    refreshToken: 20,
    connectWallet: 5,
  };
  private requestCounter: Map<string, { count: number; timestamp: number }> =
    new Map();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('CACHE_MANAGER') private cacheManager: Cache,
  ) {
    // Validazione configurazione all'avvio
    this.jwtSecret = this.validateConfig('JWT_SECRET');
    this.validateConfig('FRONTEND_URL');
    this.validateConfig('BACKEND_URL');
    this.validateConfig('GOOGLE_CLIENT_ID');
    this.validateConfig('GOOGLE_CLIENT_SECRET');

    // Log iniziale
    this.logger.log('🚀 AuthService initialized with enterprise configuration');
    this.logger.log(`📊 Cache TTL: ${JSON.stringify(this.cacheTTL)}`);
    this.logger.log(`🛡️ Rate limits: ${JSON.stringify(this.rateLimits)}`);

    // Cleanup interval per rate limiting
    setInterval(() => this.cleanupRateLimits(), 60000); // Ogni minuto
  }

  /**
   * Valida la presenza delle variabili d'ambiente
   */
  private validateConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      const error = `❌ CRITICAL: ${key} is not configured in environment`;
      this.logger.error(error);
      throw new Error(error);
    }
    return value;
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(action: string, identifier: string): boolean {
    const key = `${action}:${identifier}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minuto

    const record = this.requestCounter.get(key);

    if (!record || now - record.timestamp > windowMs) {
      this.requestCounter.set(key, { count: 1, timestamp: now });
      return true;
    }

    const limit =
      this.rateLimits[action as keyof typeof this.rateLimits] || 100;

    if (record.count >= limit) {
      return false;
    }

    record.count++;
    this.requestCounter.set(key, record);
    return true;
  }

  /**
   * Cleanup rate limits
   */
  private cleanupRateLimits(): void {
    const now = Date.now();
    const windowMs = 60000;

    for (const [key, record] of this.requestCounter.entries()) {
      if (now - record.timestamp > windowMs) {
        this.requestCounter.delete(key);
      }
    }
  }

  /**
   * Genera ID univoco per request tracing
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Valida profilo Google
   */
  private validateGoogleProfile(profile: GoogleProfile): void {
    if (!profile) {
      throw new BadRequestException({
        code: 'PROFILE_REQUIRED',
        message: 'Google profile is required',
      });
    }

    if (!profile.emails?.length) {
      throw new BadRequestException({
        code: 'EMAIL_REQUIRED',
        message: 'Google profile has no email',
      });
    }

    if (!profile.id) {
      throw new BadRequestException({
        code: 'ID_REQUIRED',
        message: 'Google profile has no ID',
      });
    }

    const email = profile.emails[0].value;
    if (!this.isValidEmail(email)) {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',
        message: 'Invalid email format',
      });
    }
  }

  /**
   * Normalizza profilo Google
   */
  private normalizeGoogleProfile(profile: GoogleProfile): GoogleUser {
    const firstName =
      profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
    const lastName =
      profile.name?.familyName ||
      profile.displayName?.split(' ').slice(1).join(' ') ||
      '';

    return {
      email: profile.emails[0].value,
      firstName: this.sanitizeString(firstName),
      lastName: this.sanitizeString(lastName),
      picture: profile.photos?.[0]?.value || '',
      accessToken: '',
      provider: profile.provider || AuthProvider.GOOGLE,
      providerId: profile.id,
    };
  }

  /**
   * Sanitizza stringa
   */
  private sanitizeString(input: string): string {
    if (!input) return '';
    // Rimuovi caratteri potenzialmente pericolosi
    return input.replace(/[<>"']/g, '').trim();
  }

  /**
   * Valida email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida payload JWT
   */
  private validateJwtPayload(payload: JwtPayload): void {
    if (!payload) {
      throw new UnauthorizedException({
        code: 'PAYLOAD_REQUIRED',
        message: 'Invalid JWT payload',
      });
    }

    if (!payload.sub) {
      throw new UnauthorizedException({
        code: 'SUBJECT_REQUIRED',
        message: 'JWT missing subject',
      });
    }

    if (!payload.email) {
      throw new UnauthorizedException({
        code: 'EMAIL_REQUIRED',
        message: 'JWT missing email',
      });
    }

    if (!payload.role || !Object.values(UserRole).includes(payload.role)) {
      throw new UnauthorizedException({
        code: 'INVALID_ROLE',
        message: 'JWT has invalid role',
      });
    }
  }

  /**
   * Valida utente
   */
  private validateUser(user: User): void {
    if (!user) {
      throw new InternalServerErrorException({
        code: 'USER_REQUIRED',
        message: 'User is required',
      });
    }

    if (!user.id) {
      throw new InternalServerErrorException({
        code: 'USER_ID_REQUIRED',
        message: 'User has no ID',
      });
    }

    if (!user.email) {
      throw new InternalServerErrorException({
        code: 'USER_EMAIL_REQUIRED',
        message: 'User has no email',
      });
    }

    if (
      !user.role ||
      !Object.values(UserRole).includes(user.role as UserRole)
    ) {
      throw new InternalServerErrorException({
        code: 'USER_INVALID_ROLE',
        message: 'User has invalid role',
      });
    }
  }

  /**
   * Sanitizza utente (rimuove dati sensibili)
   */
  private sanitizeUser(user: User): AuthResponse['user'] {
    return {
      id: user.id,
      email: user.email,
      name: user.name || '',
      avatar_url: user.avatar_url || '',
      role: user.role as UserRole,
      wallet_address: (user as any).wallet_address,
      is_active: user.is_active ?? true,
    };
  }

  /**
   * Valida indirizzo Ethereum
   */
  private isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Invalida cache per utente
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    await Promise.all([
      this.cacheManager.del(`user_${userId}`),
      this.cacheManager.del(`is_admin_${userId}`),
      this.cacheManager.del(`user_stats_${userId}`),
    ]);
    this.logger.debug(`🧹 Cache invalidated for user ${userId}`);
  }

  /**
   * Parsing durata in secondi
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([dhms])$/);
    if (!match) return 604800; // default 7 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value * 86400;
      case 'h':
        return value * 3600;
      case 'm':
        return value * 60;
      case 's':
        return value;
      default:
        return 604800;
    }
  }

  /**
   * Retry logic con exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
  ): Promise<T> {
    const {
      maxRetries,
      retryDelay = 500,
      backoffFactor = 2,
      requestId = 'unknown',
    } = options;

    let lastError: Error | null = null;
    let delay = retryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        this.logger.warn(
          `[${requestId}] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff con jitter
        const jitter = Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        delay *= backoffFactor;
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Normalizza errori per risposte uniformi
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    if (error && typeof error === 'object') {
      const err = error as any;
      if (err.message) {
        return new Error(err.message);
      }
    }

    return new Error('An unexpected error occurred');
  }

  /**
   * Ottieni client IP (per eventi)
   */
  private getClientIp(): string {
    // In un'app reale, questo verrebbe passato come parametro
    return '0.0.0.0';
  }

  /**
   * Ottieni user agent (per eventi)
   */
  private getUserAgent(): string {
    // In un'app reale, questo verrebbe passato come parametro
    return 'unknown';
  }

  // ============================================
  // METODI PUBBLICI PRINCIPALI
  // ============================================

  /**
   * Valida un utente Google e lo crea/aggiorna nel database
   * Con sistema di retry, cache e rate limiting
   */
  @LogPerformance()
  async validateGoogleUser(
    profile: GoogleProfile,
    ip?: string,
    userAgent?: string,
  ): Promise<User> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      // Rate limiting
      if (!this.checkRateLimit('validateGoogle', ip || 'unknown')) {
        throw new UnauthorizedException({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many validation attempts',
        });
      }

      // Validazione input
      this.validateGoogleProfile(profile);

      const email = profile.emails[0].value;
      this.logger.log(`[${requestId}] Validating Google user: ${email}`);

      // Cache check
      const cacheKey = `google_user_${profile.id}`;
      const cachedUser = await this.cacheManager.get<User>(cacheKey);
      if (cachedUser) {
        this.logger.debug(`[${requestId}] Cache hit for user ${email}`);

        // Aggiorna ultimo login in background
        this.updateLastLogin(cachedUser.id).catch((err) => {
          this.logger.error(
            `Background last_login update failed: ${err.message}`,
          );
        });

        return cachedUser;
      }

      // Trasforma il profilo Google
      const googleUser = this.normalizeGoogleProfile(profile);

      // Operazione con retry logic
      const user = await this.withRetry(
        async () => {
          const result =
            await this.supabaseService.findOrCreateUserFromGoogle(googleUser);
          if (!result) {
            throw new Error('User creation returned null');
          }
          return result;
        },
        {
          maxRetries: 3,
          retryDelay: 500,
          backoffFactor: 2,
          requestId,
        },
      );

      // Aggiorna ultimo login in background
      this.updateLastLogin(user.id).catch((err) => {
        this.logger.error(
          `[${requestId}] Background last_login update failed: ${err.message}`,
        );
      });

      // Emetti evento di login
      this.eventEmitter.emit('user.login', {
        userId: user.id,
        email: user.email,
        timestamp: new Date(),
        ip: ip || this.getClientIp(),
        userAgent: userAgent || this.getUserAgent(),
        provider: AuthProvider.GOOGLE,
      } as UserLoginEvent);

      // Emetti evento di registrazione se nuovo utente
      if (user.created_at === user.updated_at) {
        this.eventEmitter.emit('user.registered', {
          userId: user.id,
          email: user.email,
          timestamp: new Date(),
          provider: AuthProvider.GOOGLE,
        } as UserRegisteredEvent);
      }

      // Salva in cache
      await this.cacheManager.set(cacheKey, user, this.cacheTTL.google);
      await this.cacheManager.set(`user_${user.id}`, user, this.cacheTTL.user);

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ [${requestId}] User validated in ${duration}ms: ${user.id} (${user.email})`,
      );

      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorCode =
        error instanceof Error && 'code' in error
          ? (error as any).code
          : 'UNKNOWN';

      this.logger.error(
        `❌ [${requestId}] Error validating Google user: ${errorMessage}`,
      );

      // Emetti evento di errore
      this.eventEmitter.emit('auth.error', {
        type: 'validation',
        provider: AuthProvider.GOOGLE,
        error: errorMessage,
        code: errorCode,
        timestamp: new Date(),
        email: profile.emails?.[0]?.value,
      } as AuthErrorEvent);

      throw this.normalizeError(error);
    }
  }

  /**
   * Genera un token JWT con fingerprint e security claims
   */
  @LogPerformance()
  generateJwtToken(user: User, fingerprint?: string): AuthResponse {
    try {
      this.validateUser(user);

      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        wallet_address: (user as any).wallet_address,
      };

      const signOptions: any = {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiresIn,
        issuer: this.configService.get('BACKEND_URL'),
        audience: this.configService.get('FRONTEND_URL'),
      };

      if (fingerprint) {
        signOptions.subject = fingerprint;
      }

      const token = this.jwtService.sign(payload, signOptions);
      const expiresIn = this.parseDuration(this.jwtExpiresIn);
      const safeUser = this.sanitizeUser(user);

      this.logger.debug(`✅ JWT token generated for user: ${user.id}`);

      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        user: safeUser,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error generating JWT: ${errorMessage}`);

      this.eventEmitter.emit('auth.error', {
        type: 'token',
        error: errorMessage,
        timestamp: new Date(),
        userId: user?.id,
      } as AuthErrorEvent);

      throw this.normalizeError(error);
    }
  }

  /**
   * Valida un token JWT con controlli di sicurezza avanzati
   */
  @LogPerformance()
  async validateJwt(payload: JwtPayload, fingerprint?: string): Promise<User> {
    try {
      this.validateJwtPayload(payload);

      if (fingerprint && payload.sub !== fingerprint) {
        throw new UnauthorizedException({
          code: 'FINGERPRINT_MISMATCH',
          message: 'Token fingerprint mismatch',
        });
      }

      const cacheKey = `user_${payload.sub}`;
      let user = await this.cacheManager.get<User>(cacheKey);

      if (!user) {
        const fetchedUser = await this.withRetry(
          () => this.supabaseService.getUserById(payload.sub),
          { maxRetries: 2 },
        );

        if (!fetchedUser) {
          throw new UnauthorizedException({
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          });
        }

        user = fetchedUser;
        await this.cacheManager.set(cacheKey, user, this.cacheTTL.user);
      }

      if (!user.is_active) {
        throw new UnauthorizedException({
          code: 'USER_INACTIVE',
          message: 'User account is deactivated',
        });
      }

      if (user.role !== (payload.role as string)) {
        this.logger.warn(
          `Role mismatch for user ${user.id}: ${payload.role} vs ${user.role}`,
        );

        this.eventEmitter.emit('security.warning', {
          type: 'role_mismatch',
          userId: user.id,
          expectedRole: payload.role,
          actualRole: user.role,
          timestamp: new Date(),
        });
      }

      this.logger.debug(`✅ JWT validated for user: ${user.id}`);
      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error validating JWT: ${errorMessage}`);

      this.eventEmitter.emit('auth.error', {
        type: 'validation',
        error: errorMessage,
        timestamp: new Date(),
        userId: payload?.sub,
      } as AuthErrorEvent);

      throw this.normalizeError(error);
    }
  }

  /**
   * Verifica token con parsing avanzato e validazione
   */
  verifyToken(
    token: string,
    options?: {
      ignoreExpiration?: boolean;
      fingerprint?: string;
    },
  ): JwtPayload {
    try {
      if (!token) {
        throw new UnauthorizedException({
          code: 'TOKEN_REQUIRED',
          message: 'Token is required',
        });
      }

      // Rimuovi prefisso Bearer se presente
      const cleanToken = token.replace(/^Bearer\s+/i, '');

      const verifyOptions: any = {
        secret: this.jwtSecret,
        issuer: this.configService.get('BACKEND_URL'),
        audience: this.configService.get('FRONTEND_URL'),
        ignoreExpiration: options?.ignoreExpiration || false,
      };

      const payload = this.jwtService.verify<JwtPayload>(
        cleanToken,
        verifyOptions,
      );

      // Verifica fingerprint se richiesto
      if (options?.fingerprint && payload.sub !== options.fingerprint) {
        throw new UnauthorizedException({
          code: 'FINGERPRINT_MISMATCH',
          message: 'Token fingerprint mismatch',
        });
      }

      return payload;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error verifying token: ${errorMessage}`);

      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError') {
          throw new UnauthorizedException({
            code: 'TOKEN_EXPIRED',
            message: 'Token expired',
            expiredAt: (error as any).expiredAt,
          });
        }

        if (error.name === 'JsonWebTokenError') {
          throw new UnauthorizedException({
            code: 'INVALID_TOKEN',
            message: 'Token non valido',
          });
        }
      }

      throw new UnauthorizedException({
        code: 'VERIFICATION_FAILED',
        message: 'Token verification failed',
      });
    }
  }

  /**
   * Ottiene utente con caching intelligente e validazione
   */
  async getUserById(
    userId: string,
    options?: {
      skipCache?: boolean;
      validate?: boolean;
    },
  ): Promise<User | null> {
    const cacheKey = `user_${userId}`;

    try {
      if (!userId) {
        throw new BadRequestException({
          code: 'USER_ID_REQUIRED',
          message: 'User ID is required',
        });
      }

      // Try cache first
      if (!options?.skipCache) {
        const cached = await this.cacheManager.get<User>(cacheKey);
        if (cached) {
          if (options?.validate) {
            this.validateUser(cached);
          }
          return cached;
        }
      }

      // Fetch from database
      const user = await this.supabaseService.getUserById(userId);

      if (user) {
        // Cache for 5 minutes
        await this.cacheManager.set(cacheKey, user, this.cacheTTL.user);

        if (options?.validate) {
          this.validateUser(user);
        }
      }

      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting user by id ${userId}: ${errorMessage}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      return null;
    }
  }

  /**
   * Trova utente per wallet con validazione e caching
   */
  async findUserByWallet(
    wallet: string,
    options?: {
      skipCache?: boolean;
      validate?: boolean;
    },
  ): Promise<User | null> {
    try {
      if (!wallet) {
        throw new BadRequestException({
          code: 'WALLET_REQUIRED',
          message: 'Wallet is required',
        });
      }

      if (!this.isValidEthereumAddress(wallet)) {
        throw new BadRequestException({
          code: 'INVALID_WALLET',
          message: 'Invalid wallet address format',
        });
      }

      const normalizedWallet = wallet.toLowerCase();
      const cacheKey = `wallet_${normalizedWallet}`;

      // Try cache
      if (!options?.skipCache) {
        const cached = await this.cacheManager.get<User>(cacheKey);
        if (cached) {
          if (options?.validate) {
            this.validateUser(cached);
          }
          return cached;
        }
      }

      // Fetch from database
      const user =
        await this.supabaseService.findUserByWallet(normalizedWallet);

      if (user) {
        await this.cacheManager.set(cacheKey, user, this.cacheTTL.wallet);

        if (options?.validate) {
          this.validateUser(user);
        }
      }

      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error finding user by wallet ${wallet}: ${errorMessage}`,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      return null;
    }
  }

  /**
   * Collega wallet con transazione atomica e validazioni multiple
   */
  @LogPerformance()
  async connectWallet(
    userId: string,
    wallet: string,
    options?: {
      skipValidation?: boolean;
      emitEvent?: boolean;
    },
  ): Promise<User | null> {
    const requestId = this.generateRequestId();

    try {
      // Rate limiting
      if (!this.checkRateLimit('connectWallet', userId)) {
        throw new BadRequestException({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many wallet connection attempts',
        });
      }

      // Validazioni base
      if (!userId) {
        throw new BadRequestException({
          code: 'USER_ID_REQUIRED',
          message: 'User ID is required',
        });
      }

      if (!wallet) {
        throw new BadRequestException({
          code: 'WALLET_REQUIRED',
          message: 'Wallet is required',
        });
      }

      if (!options?.skipValidation && !this.isValidEthereumAddress(wallet)) {
        throw new BadRequestException({
          code: 'INVALID_WALLET',
          message: 'Invalid wallet address format',
        });
      }

      const normalizedWallet = wallet.toLowerCase();

      // Verifica che il wallet non sia già associato
      const existingUser =
        await this.supabaseService.findUserByWallet(normalizedWallet);
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException({
          code: 'WALLET_ALREADY_CONNECTED',
          message: 'Wallet already connected to another user',
        });
      }

      // Verifica che l'utente esista
      const userExists = await this.supabaseService.getUserById(userId);
      if (!userExists) {
        throw new BadRequestException({
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Collega wallet
      const user = await this.withRetry(
        () =>
          this.supabaseService.connectWalletToUser(userId, normalizedWallet),
        {
          maxRetries: 3,
          retryDelay: 500,
          requestId,
        },
      );

      if (!user) {
        throw new InternalServerErrorException({
          code: 'CONNECTION_FAILED',
          message: 'Failed to connect wallet',
        });
      }

      // Invalida cache
      await this.invalidateUserCache(userId);
      await this.cacheManager.del(`wallet_${normalizedWallet}`);

      this.logger.log(`✅ [${requestId}] Wallet connected to user: ${userId}`);

      // Emetti evento
      if (options?.emitEvent !== false) {
        this.eventEmitter.emit('wallet.connected', {
          userId,
          wallet: normalizedWallet,
          timestamp: new Date(),
        } as WalletConnectedEvent);
      }

      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `[${requestId}] Error connecting wallet: ${errorMessage}`,
      );

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException({
        code: 'CONNECTION_FAILED',
        message: 'Wallet connection failed',
      });
    }
  }

  /**
   * Verifica ruolo admin con caching e validazione
   */
  async isAdminUser(
    userId: string,
    options?: {
      skipCache?: boolean;
      validateUser?: boolean;
    },
  ): Promise<boolean> {
    const cacheKey = `is_admin_${userId}`;

    try {
      if (!userId) {
        return false;
      }

      // Try cache
      if (!options?.skipCache) {
        const cached = await this.cacheManager.get<boolean>(cacheKey);
        if (cached !== undefined) {
          return cached;
        }
      }

      // Opzionale: verifica che l'utente esista
      if (options?.validateUser) {
        const user = await this.getUserById(userId);
        if (!user) {
          return false;
        }
      }

      const isAdmin = await this.supabaseService.isAdminUser(userId);

      // Cache for 10 minutes
      await this.cacheManager.set(cacheKey, isAdmin, this.cacheTTL.admin);

      return isAdmin;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error checking admin status for user ${userId}: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * Aggiorna ultimo login con resilienza
   */
  async updateLastLogin(
    userId: string,
    options?: {
      force?: boolean;
      skipCache?: boolean;
    },
  ): Promise<void> {
    try {
      if (!userId) {
        return;
      }

      // Aggiorna last_login nel database
      await this.supabaseService.updateUserLastLogin(userId);

      // Invalida cache se richiesto
      if (!options?.skipCache) {
        await this.cacheManager.del(`user_${userId}`);
      }

      this.logger.debug(`✅ Last login updated for user: ${userId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error updating last login for user ${userId}: ${errorMessage}`,
      );
      // Non throw - operazione non critica
    }
  }

  /**
   * Ottiene tutti gli utenti con paginazione e filtri avanzati
   */
  async getAllUsers(
    limit: number = 100,
    offset: number = 0,
    filters?: UserFilterOptions,
  ): Promise<{ users: User[]; total: number; hasMore: boolean }> {
    try {
      // Validazione parametri
      const validatedLimit = Math.min(Math.max(1, limit), 1000);
      const validatedOffset = Math.max(0, offset);

      // Costruisci query
      let query = this.supabaseService.supabase
        .from('users')
        .select('*', { count: 'exact' });

      if (filters?.role) {
        query = query.eq('role', filters.role);
      }

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters?.provider) {
        query = query.eq('provider', filters.provider);
      }

      if (filters?.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`,
        );
      }

      if (filters?.fromDate) {
        query = query.gte('created_at', filters.fromDate.toISOString());
      }

      if (filters?.toDate) {
        query = query.lte('created_at', filters.toDate.toISOString());
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(validatedOffset, validatedOffset + validatedLimit - 1);

      if (error) {
        throw error;
      }

      const users = (data as User[]) || [];
      const total = count || 0;

      return {
        users,
        total,
        hasMore: validatedOffset + validatedLimit < total,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting all users: ${errorMessage}`);
      return { users: [], total: 0, hasMore: false };
    }
  }

  /**
   * Aggiorna ruolo utente con validazione e audit
   */
  @LogPerformance()
  async updateUserRole(
    userId: string,
    role: UserRole,
    options?: {
      emitEvent?: boolean;
      auditReason?: string;
    },
  ): Promise<User | null> {
    try {
      if (!userId) {
        throw new BadRequestException({
          code: 'USER_ID_REQUIRED',
          message: 'User ID is required',
        });
      }

      if (!Object.values(UserRole).includes(role)) {
        throw new BadRequestException({
          code: 'INVALID_ROLE',
          message: `Invalid role: ${role}`,
        });
      }

      // ✅ Converti enum a stringa letterale
      const roleString = role as string as 'user' | 'admin' | 'editor';

      const oldUser = await this.getUserById(userId);
      const oldRole = oldUser?.role as UserRole;

      const user = await this.supabaseService.updateUserRole(
        userId,
        roleString,
      );

      if (user) {
        await this.invalidateUserCache(userId);

        this.logger.log(
          `✅ User role updated: ${userId} -> ${role}${options?.auditReason ? ` (${options.auditReason})` : ''}`,
        );

        if (options?.emitEvent !== false) {
          this.eventEmitter.emit('user.role_changed', {
            userId,
            newRole: role,
            oldRole,
            timestamp: new Date(),
            reason: options?.auditReason,
          } as RoleChangedEvent);
        }
      }

      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error updating user role ${userId}: ${errorMessage}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException({
        code: 'ROLE_UPDATE_FAILED',
        message: 'Failed to update user role',
      });
    }
  }

  /**
   * Disabilita/abilita utente con validazione
   */
  @LogPerformance()
  async setUserActive(
    userId: string,
    isActive: boolean,
    options?: {
      emitEvent?: boolean;
      auditReason?: string;
    },
  ): Promise<User | null> {
    try {
      if (!userId) {
        throw new BadRequestException({
          code: 'USER_ID_REQUIRED',
          message: 'User ID is required',
        });
      }

      const user = await this.supabaseService.setUserActive(userId, isActive);

      if (user) {
        // Invalida cache
        await this.invalidateUserCache(userId);

        this.logger.log(
          `✅ User active status updated: ${userId} -> ${isActive}${options?.auditReason ? ` (${options.auditReason})` : ''}`,
        );

        // Emetti evento
        if (options?.emitEvent !== false) {
          this.eventEmitter.emit('user.active_changed', {
            userId,
            isActive,
            timestamp: new Date(),
            reason: options?.auditReason,
          } as UserActiveChangedEvent);
        }
      }

      return user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error updating user active status ${userId}: ${errorMessage}`,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException({
        code: 'STATUS_UPDATE_FAILED',
        message: 'Failed to update user status',
      });
    }
  }

  /**
   * Ottiene statistiche utente complete
   */
  async getUserStatistics(options?: {
    skipCache?: boolean;
    detailed?: boolean;
  }): Promise<UserStatistics> {
    const cacheKey = 'user_statistics';

    try {
      // Try cache
      if (!options?.skipCache) {
        const cached = await this.cacheManager.get<UserStatistics>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const stats = await this.supabaseService.getUserStats();

      // Calcola statistiche aggiuntive
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const weekAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1)).toISOString();

      // Qui potresti aggiungere query per statistiche più dettagliate
      // Per ora usiamo dati di esempio o placeholder

      const result: UserStatistics = {
        total: stats.total_users,
        activeToday: stats.active_today,
        activeWeek: stats.active_week,
        activeMonth: stats.active_month,
        byProvider: {
          [AuthProvider.GOOGLE]: stats.google_users,
          [AuthProvider.WALLET]: 0,
          [AuthProvider.EMAIL]: 0,
        },
        byRole: {
          [UserRole.USER]: 0,
          [UserRole.ADMIN]: 0,
          [UserRole.EDITOR]: 0,
          [UserRole.MODERATOR]: 0,
        },
        newUsersToday: 0,
        newUsersWeek: 0,
        newUsersMonth: 0,
        loginFrequency: {
          daily: new Array(24).fill(0),
          weekly: new Array(7).fill(0),
          monthly: new Array(30).fill(0),
        },
      };

      // Cache per 1 ora
      await this.cacheManager.set(cacheKey, result, this.cacheTTL.stats);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting user statistics: ${errorMessage}`);

      return {
        total: 0,
        activeToday: 0,
        activeWeek: 0,
        activeMonth: 0,
        byProvider: {} as Record<AuthProvider, number>,
        byRole: {} as Record<UserRole, number>,
        newUsersToday: 0,
        newUsersWeek: 0,
        newUsersMonth: 0,
        loginFrequency: {
          daily: [],
          weekly: [],
          monthly: [],
        },
      };
    }
  }

  /**
   * Refresh token con validazione e rotazione
   */
  @LogPerformance()
  refreshToken(oldToken: string, fingerprint?: string): AuthResponse {
    try {
      // Verifica il vecchio token
      const payload = this.verifyToken(oldToken, {
        ignoreExpiration: true, // Ignora scadenza per refresh
        fingerprint,
      });

      // Rimuovi campi temporali
      const { iat, exp, ...cleanPayload } = payload;

      // Verifica che il token non sia troppo vecchio (max 30 giorni)
      if (exp && Date.now() / 1000 - exp > 30 * 24 * 60 * 60) {
        throw new UnauthorizedException({
          code: 'REFRESH_EXPIRED',
          message: 'Refresh period expired',
        });
      }

      // Crea utente virtuale per generare nuovo token
      const virtualUser = {
        id: cleanPayload.sub,
        email: cleanPayload.email,
        role: cleanPayload.role,
        wallet_address: cleanPayload.wallet_address,
        name: '',
        avatar_url: '',
        google_id: null,
        provider: 'google',
        last_login: null,
        created_at: '',
        updated_at: '',
        is_active: true,
      } as unknown as User;

      this.logger.debug(`Token refreshed for user: ${cleanPayload.sub}`);

      return this.generateJwtToken(virtualUser, fingerprint);
    } catch (error) {
      this.logger.error('Token refresh failed');

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException({
        code: 'REFRESH_FAILED',
        message: 'Invalid refresh token',
      });
    }
  }

  /**
   * Graceful shutdown - pulizia risorse
   */
  async onModuleDestroy() {
    this.logger.log('🧹 Cleaning up AuthService resources...');

    // Pulisci rate limiting
    this.requestCounter.clear();

    // Pulisci cache (opzionale)
    // Nota: non cancelliamo tutta la cache perché potrebbe essere condivisa
    this.logger.log('✅ AuthService cleanup completed');
  }
}
