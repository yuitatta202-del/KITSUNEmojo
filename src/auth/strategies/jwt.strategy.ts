// backend/src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        '❌ JWT_SECRET non configurato! Aggiungilo al file .env\n' +
          'Esempio: JWT_SECRET=una-chiave-segreta-molto-lunga',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });

    this.logger.log('✅ JwtStrategy inizializzata correttamente');
  }

  async validate(payload: any) {
    try {
      const user = await this.authService.validateJwt(payload);
      if (!user) {
        throw new UnauthorizedException('Utente non trovato');
      }
      return user;
    } catch (error) {
      this.logger.error(`Errore validazione JWT: ${error.message}`);
      throw new UnauthorizedException('Token non valido');
    }
  }
}
