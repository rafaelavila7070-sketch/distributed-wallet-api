import { Inject, Injectable } from '@nestjs/common';

import { CreateWalletUseCase } from './use-cases/create-wallet.use-case.js';
import type { CreateWalletCommand } from './use-cases/create-wallet.use-case.js';
import { GetWalletUseCase } from './use-cases/get-wallet.use-case.js';
import { GetWalletLedgerUseCase } from './use-cases/get-wallet-ledger.use-case.js';
import { ReconcileWalletUseCase } from './use-cases/reconcile-wallet.use-case.js';
import {
  ProcessWagerTransactionUseCase,
} from './use-cases/process-wager-transaction.use-case.js';
import type {
  ProcessWagerTransactionCommand,
  InboxMessageMetadata,
  InboxProcessingResult,
} from './use-cases/process-wager-transaction.use-case.js';

import { WALLET_UNIT_OF_WORK } from './ports/wallet-unit-of-work.js';
import type { WalletUnitOfWork } from './ports/wallet-unit-of-work.js';

import { ApplicationError } from './errors/application-error.js';
import { WagerTransactionKind } from '../domain/wager-transaction/wager-transaction.js';

@Injectable()
export class WalletApplicationService {
  private readonly createWallet: CreateWalletUseCase;
  private readonly getWallet: GetWalletUseCase;
  private readonly getWalletLedger: GetWalletLedgerUseCase;
  private readonly reconcileWallet: ReconcileWalletUseCase;
  private readonly processTransaction: ProcessWagerTransactionUseCase;

  constructor(@Inject(WALLET_UNIT_OF_WORK) unitOfWork: WalletUnitOfWork) {
    this.createWallet = new CreateWalletUseCase(unitOfWork);
    this.getWallet = new GetWalletUseCase(unitOfWork);
    this.getWalletLedger = new GetWalletLedgerUseCase(unitOfWork);
    this.reconcileWallet = new ReconcileWalletUseCase(unitOfWork);
    this.processTransaction = new ProcessWagerTransactionUseCase(unitOfWork);
  }

  createWalletForPlayer(input: CreateWalletCommand) {
    if (!input || typeof input !== 'object') {
      throw new ApplicationError('INVALID_REQUEST_BODY', 400);
    }

    return this.createWallet.execute(input);
  }

  getWalletById(id: string) {
    return this.getWallet.execute(id);
  }

  getLedgerByWalletId(walletId: string) {
    return this.getWalletLedger.execute(walletId);
  }

  reconcileWalletById(walletId: string) {
    return this.reconcileWallet.execute(walletId);
  }

  processWager(input: ProcessWagerTransactionCommand) {
    if (!input || typeof input !== 'object') {
      throw new ApplicationError('INVALID_REQUEST_BODY', 400);
    }

    if (input.kind === WagerTransactionKind.Opening) {
      throw new ApplicationError('OPENING_TRANSACTION_NOT_ALLOWED', 400);
    }

    return this.processTransaction.execute(input);
  }

  processWagerFromMessage(
    input: ProcessWagerTransactionCommand,
    metadata: InboxMessageMetadata,
  ): Promise<InboxProcessingResult> {
    if (!input || typeof input !== 'object') {
      throw new ApplicationError('INVALID_MESSAGE_BODY', 400);
    }

    return this.processTransaction.executeFromMessage(input, metadata);
  }

  getTransaction(id: string) {
    return this.processTransaction.getById(id);
  }
}