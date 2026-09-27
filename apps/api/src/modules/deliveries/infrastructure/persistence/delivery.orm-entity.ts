import type { DeliveryStatus, FeeRule } from '@checkout/shared/enums';
import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'deliveries' })
export class DeliveryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transactionId!: string;

  @Column({ type: 'uuid', name: 'warehouse_id' })
  warehouseId!: string;

  @Column({ type: 'char', length: 5, name: 'municipality_code' })
  municipalityCode!: string;

  @Column({ type: 'varchar', length: 20, default: 'AWAITING_PAYMENT' })
  status!: DeliveryStatus;

  @Column({ type: 'varchar', length: 120, name: 'recipient_name' })
  recipientName!: string;

  @Column({ type: 'varchar', length: 10 })
  phone!: string;

  @Column({ type: 'varchar', length: 200, name: 'address_line' })
  addressLine!: string;

  @Column({ type: 'varchar', length: 120, name: 'address_detail', nullable: true })
  addressDetail!: string | null;

  @Column({ type: 'integer', name: 'distance_km' })
  distanceKm!: number;

  @Column({ type: 'varchar', length: 24, name: 'fee_rule' })
  feeRule!: FeeRule;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
