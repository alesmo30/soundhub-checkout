import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { bigintTransformer } from '../../../../shared/infrastructure/persistence/transformers';

@Entity({ name: 'products' })
export class ProductOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  sku!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 60 })
  brand!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'bigint', name: 'price_cents', transformer: bigintTransformer })
  priceCents!: number;

  @Column({ type: 'varchar', length: 500, name: 'image_url' })
  imageUrl!: string;

  @Column({ type: 'integer', name: 'stock_available', default: 0 })
  stockAvailable!: number;

  @Column({ type: 'integer', name: 'stock_reserved', default: 0 })
  stockReserved!: number;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
