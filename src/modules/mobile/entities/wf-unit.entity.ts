import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

import { decimalTransformer, NOT_DELETED, WF_UNIT_STATUS, WfUnitStatus } from '../mobile.constant'

/** 事项/风机：现场口中的「T20 风机」就是这一层，主键为客户端 UUID 以支持离线新建 */
@Entity({ name: 'wf_unit' })
@Index('IDX_unit_project_code', ['projectId', 'code', 'deletedAt'], { unique: true })
@Index('IDX_unit_project_status', ['projectId', 'status'])
@Index('IDX_unit_type', ['typeCode'])
export class WfUnitEntity {
  @PrimaryColumn({ type: 'varchar', length: 36, comment: '事项ID，客户端UUID' })
  id: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'project_id', type: 'int', comment: '所属项目' })
  projectId: number

  @Column({ name: 'type_code', length: 32, default: 'turbine', comment: '事项类型' })
  typeCode: string

  @Column({ length: 32, comment: '事项编号，如 T20' })
  code: string

  @Column({ length: 120, default: '', comment: '名称补充' })
  name: string

  @Column({ length: 160, default: '', comment: '位置描述' })
  location: string

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '经度',
  })
  longitude: number | null

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '纬度',
  })
  latitude: number | null

  @Column({ type: 'enum', enum: WF_UNIT_STATUS, default: 'planning', comment: '状态' })
  status: WfUnitStatus

  @Column({ type: 'tinyint', unsigned: true, default: 0, comment: '进度0-100' })
  progress: number

  @Column({ name: 'start_date', type: 'date', nullable: true, comment: '实际开工' })
  startDate: string | null

  @Column({ name: 'end_date', type: 'date', nullable: true, comment: '实际完工' })
  endDate: string | null

  @Column({ length: 500, default: '', comment: '备注' })
  remark: string

  @Column({ name: 'created_by', type: 'int', unsigned: true, nullable: true, comment: '创建人' })
  createdBy: number | null

  @Column({
    name: 'deleted_at',
    type: 'datetime',
    precision: 6,
    default: () => `'${NOT_DELETED}'`,
    comment: '软删除时间，未删除为1970',
  })
  deletedAt: Date
}
