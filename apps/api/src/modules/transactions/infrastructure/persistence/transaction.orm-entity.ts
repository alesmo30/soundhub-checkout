import type { CardBrand, TransactionStatus } from '@checkout/shared/enums';
import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { bigintTransformer } from '../../../../shared/infrastructure/persistence/transformers';

@Entity({ name: 'transactions' })
export class TransactionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  reference!: string;

  @Column({ type: 'uuid', name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ type: 'char', length: 64, name: 'request_hash' })
  requestHash!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string;

  @Column({ type: 'smallint' })
  quantity!: number;

  @Column({ type: 'bigint', name: 'unit_price_cents', transformer: bigintTransformer })
  unitPriceCents!: number;

  @Column({ type: 'bigint', name: 'subtotal_cents', transformer: bigintTransformer })
  subtotalCents!: number;

  @Column({ type: 'bigint', name: 'base_fee_cents', transformer: bigintTransformer })
  baseFeeCents!: number;

  @Column({ type: 'bigint', name: 'delivery_fee_cents', transformer: bigintTransformer })
  deliveryFeeCents!: number;

  @Column({ type: 'bigint', name: 'total_cents', transformer: bigintTransformer })
  totalCents!: number;

  @Column({ type: 'char', length: 3, default: 'COP' })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: TransactionStatus;

  @Column({ type: 'smallint', default: 1 })
  installments!: number;

  @Column({ type: 'varchar', length: 12, name: 'card_brand' })
  cardBrand!: CardBrand;

  @Column({ type: 'char', length: 4, name: 'card_last4' })
  cardLast4!: string;

  @Column({ type: 'varchar', length: 64, name: 'provider_transaction_id', nullable: true })
  providerTransactionId!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'provider_status_message', nullable: true })
  providerStatusMessage!: string | null;

  @Column({ type: 'timestamptz', name: 'reservation_expires_at' })
  reservationExpiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'finalized_at', nullable: true })
  finalizedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'email_sent_at', nullable: true })
  emailSentAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
