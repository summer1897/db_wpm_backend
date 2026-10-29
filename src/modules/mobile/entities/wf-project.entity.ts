import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

import { decimalTransformer } from '../mobile.constant'

/** 项目：一个项目下有多台风机/多个事项 */
@Entity({ name: 'wf_project' })
@Index('IDX_project_scope', ['scope'], { unique: true })
@Index('IDX_project_code', ['code'], { unique: true })
@Index('IDX_project_status', ['status'])
export class WfProjectEntity extends CommonEntity {
  @Column({ length: 32, comment: '项目编号' })
  code: string

  @Column({ length: 120, comment: '项目名称' })
  name: string

  @Column({ type: 'char', length: 64, comment: '接入通道标识（移动端对接用）' })
  scope: string

  @Column({ length: 160, default: '', comment: '服务实例标识' })
  instance: string

  @Column({ type: 'enum', enum: ['trial', 'linked'], default: 'trial', comment: '通道模式' })
  mode: 'trial' | 'linked'

  @Column({
    type: 'enum',
    enum: ['desktop', 'manual', 'trial'],
    default: 'manual',
    comment: '接入方式',
  })
  integration: 'desktop' | 'manual' | 'trial'

  @Column({ name: 'registration_open', type: 'tinyint', default: 0, comment: '是否开放自助注册' })
  registrationOpen: number

  @Column({ name: 'expires_at', type: 'datetime', precision: 6, nullable: true, comment: '通道到期时间' })
  expiresAt: Date | null

  @Column({ name: 'owner_id', type: 'int', unsigned: true, nullable: true, comment: '项目负责人' })
  ownerId: number | null

  @Column({ name: 'start_date', type: 'date', nullable: true, comment: '计划开工' })
  startDate: string | null

  @Column({ name: 'end_date', type: 'date', nullable: true, comment: '计划完工' })
  endDate: string | null

  @Column({
    name: 'capacity_mw',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
    comment: '装机容量(MW)',
  })
  capacityMw: number | null

  @Column({ length: 160, default: '', comment: '项目所在地' })
  location: string

  @Column({
    type: 'enum',
    enum: ['active', 'paused', 'done'],
    default: 'active',
    comment: '状态',
  })
  status: 'active' | 'paused' | 'done'

  @Column({ length: 500, default: '', comment: '备注' })
  remark: string

  @Column({ name: 'created_by', type: 'int', unsigned: true, nullable: true, comment: '创建人' })
  createdBy: number | null
}
