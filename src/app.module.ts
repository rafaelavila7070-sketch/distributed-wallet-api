import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';

import { MikroOrmModule } from '@mikro-orm/nestjs';

import { mikroOrmConfig } from './mikro-orm.config.js';
import { WALLET_UNIT_OF_WORK } from './application/ports/wallet-unit-of-work.js';
import { WalletApplicationService } from './application/wallet-application.service.js';
import { MikroOrmWalletUnitOfWork } from './infrastructure/database/mikro-orm-wallet-unit-of-work.js';
import { HttpLoggerMiddleware } from './infrastructure/logging/http-logger.middleware.js';

import { AppController } from './app.controller.js';
import { WalletController } from './presentation/http/wallet.controller.js';

@Module({
  imports: [MikroOrmModule.forRoot(mikroOrmConfig)],
  controllers: [AppController, WalletController],
  providers: [
    WalletApplicationService,
    HttpLoggerMiddleware,
    {
      provide: WALLET_UNIT_OF_WORK,
      useClass: MikroOrmWalletUnitOfWork,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}