import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { verifyMessage } from 'ethers';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly AUTHORIZED_ADMINS =
    process.env.AUTHORIZED_ADMINS?.split(',') || [];

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-signature'];
    const message = request.headers['x-message'];
    const wallet = request.headers['x-wallet'];

    if (!signature || !message || !wallet) {
      throw new UnauthorizedException('Missing authentication headers');
    }

    try {
      const recoveredAddress = verifyMessage(message, signature).toLowerCase();

      if (recoveredAddress !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Invalid signature');
      }

      if (!this.AUTHORIZED_ADMINS.includes(recoveredAddress)) {
        throw new UnauthorizedException('Unauthorized wallet');
      }

      request.admin = { address: recoveredAddress };
      return true;
    } catch (error) {
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
