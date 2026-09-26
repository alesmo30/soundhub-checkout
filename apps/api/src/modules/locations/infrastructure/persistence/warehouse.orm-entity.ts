import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { numericTransformer } from '../../../../shared/infrastructure/persistence/transformers';

@Entity({ name: 'warehouses' })
export class WarehouseOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'char', length: 5, name: 'municipality_code' })
  municipalityCode!: string;

  @Column({ type: 'varchar', length: 200 })
  address!: string;

  @Column({ type: 'numeric', precision: 9, scale: 6, transformer: numericTransformer })
  latitude!: number;

  @Column({ type: 'numeric', precision: 9, scale: 6, transformer: numericTransformer })
  longitude!: number;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
