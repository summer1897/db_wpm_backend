import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 操作审计：任何改动可追到人，before/after 留快照 */
@Entity({ name: 'wf_audit_log' })
@Index('IDX_audit_entity', ['entity', 'entityId'])
@Index('IDX_audit_project_time', ['projectId', 'createdAt'])
export class WfAuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'project_id', type: 'int', comment: '项目' })
  projectId: number

  @Column({
    type: 'enum',
    enum: ['project', 'unit', 'unit_step', 'entry', 'attachment'],
    comment: '对象类型',
  })
  entity: 'project' | 'unit' | 'unit_step' | 'entry' | 'attachment'

  @Column({ name: 'entity_id', type: 'varchar', length: 36, comment: '对象ID' })
  entityId: string

  @Column({ length: 32, comment: '动作' })
  action: string

  @Column({ type: 'json', nullable: true, comment: '变更前快照' })
  before: Record<string, any> | null

  @Column({ type: 'json', nullable: true, comment: '变更后快照' })
  after: Record<string, any> | null

  @Column({ name: 'operator_id', type: 'int', unsigned: true, nullable: true, comment: '操作人' })
  operatorId: number | null

  @Column({ length: 64, default: '', comment: '来源IP' })
  ip: string
}
