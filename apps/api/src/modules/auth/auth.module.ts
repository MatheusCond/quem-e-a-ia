import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PlayerAuthGuard } from './player-auth.guard';
import { PlayerTokenService } from './player-token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  providers: [PlayerTokenService, PlayerAuthGuard],
  exports: [PlayerTokenService, PlayerAuthGuard],
})
export class AuthModule {}
