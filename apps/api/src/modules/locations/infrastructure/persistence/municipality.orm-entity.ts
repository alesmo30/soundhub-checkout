import { Column, DeleteDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { numericTransformer } from '../../../../shared/infrastructure/persistence/transformers';

@Entity({ name: 'municipalities' })
export class MunicipalityOrmEntity {
  @PrimaryColumn({ type: 'char', length: 5 })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'char', length: 2, name: 'department_code' })
  departmentCode!: string;

  @Column({ type: 'varchar', length: 80, name: 'department_name' })
  departmentName!: string;

  @Column({ type: 'numeric', precision: 9, scale: 6, transformer: numericTransformer })
  latitude!: number;

  @Column({ type: 'numeric', precision: 9, scale: 6, transformer: numericTransformer })
  longitude!: number;

  @Column({ type: 'boolean', name: 'is_metro_area', default: false })
  isMetroArea!: boolean;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
