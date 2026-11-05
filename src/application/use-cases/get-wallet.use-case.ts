import { ApplicationError } from '../errors/application-error.js';
import type { WalletUnitOfWork } from '../ports/wallet-unit-of-work.js';
import { Wallet } from '../../domain/wallet/wallet.js';

export class GetWalletUseCase {
  constructor(private readonly unitOfWork: WalletUnitOfWork) {}

  execute(id: string): Promise<Wallet> {
    return this.unitOfWork.execute(async ({ wallets }) => {
      const wallet = await wallets.findById(id);
      if (!wallet) {
        throw new ApplicationError('WALLET_NOT_FOUND', 404);
      }
      return wallet;
    });
  }
}
