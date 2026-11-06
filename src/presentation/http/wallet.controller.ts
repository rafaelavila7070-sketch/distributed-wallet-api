
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { WalletApplicationService } from '../../application/wallet-application.service.js';
import type { CreateWalletCommand } from '../../application/use-cases/create-wallet.use-case.js';
import type { ProcessWagerTransactionCommand } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { ApplicationError } from '../../application/errors/application-error.js';

@Controller()
export class WalletController {
  constructor(private readonly walletService: WalletApplicationService) {}

  @Post('wallets')
  async createWallet(@Body() body: CreateWalletCommand) {
    const wallet = await this.walletService.createWalletForPlayer(body);
    return this.serializeWallet(wallet);
  }

  @Get('wallets/:id')
  async getWallet(@Param('id', new ParseUUIDPipe()) id: string) {
    const wallet = await this.walletService.getWalletById(id);
    return this.serializeWallet(wallet);
  }

  @Get('wallets/:id/ledger')
  async getWalletLedger(@Param('id', new ParseUUIDPipe()) id: string) {
    const entries = await this.walletService.getLedgerByWalletId(id);

    return entries.map((entry) => ({
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      amount: entry.money.toString(),
      currency: entry.money.currency,
      balanceBefore: entry.balanceBefore.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      createdAt: entry.createdAt,
    }));
  }

  @Get('wallets/:id/reconciliation')
  async reconcileWallet(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.walletService.reconcileWalletById(id);
  }

  @Post('transactions')
  async processTransaction(
    @Body()
    body: Omit<ProcessWagerTransactionCommand, 'idempotencyKey'>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new ApplicationError('IDEMPOTENCY_KEY_REQUIRED', 400);
    }

    const transaction = await this.walletService.processWager({
      ...body,
      idempotencyKey: idempotencyKey.trim(),
    });

    return this.serializeTransaction(transaction);
  }

  @Get('transactions/:id')
  async getTransaction(@Param('id', new ParseUUIDPipe()) id: string) {
    const transaction = await this.walletService.getTransaction(id);
    return this.serializeTransaction(transaction);
  }

  private serializeWallet(
    wallet: Awaited<ReturnType<WalletApplicationService['getWalletById']>>,
  ) {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.balance.currency,
      balance: wallet.balance.toString(),
      version: wallet.version,
    };
  }

  private serializeTransaction(
    transaction: Awaited<
      ReturnType<WalletApplicationService['getTransaction']>
    >,
  ) {
    return {
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      amount: transaction.money.toString(),
      currency: transaction.money.currency,
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId,
      referenceTransactionId: transaction.referenceTransactionId,
      status: transaction.status,
      failureCode: transaction.failureCode,
      createdAt: transaction.createdAt,
      processedAt: transaction.processedAt,
    };
  }
}
