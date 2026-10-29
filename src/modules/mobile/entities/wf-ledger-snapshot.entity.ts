import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 台账快照：每次导出/归档固定当时的报送口径 */
@Entity({ name: 'wf_ledger_snapshot' })
@Index('IDX_snapshot_project', ['projectId', 'generatedAt'])
export class WfLedgerSnapshotEntity extends CommonEntity {
  @Column({ name: 'project_id', type: 'int', comment: '项目' })
  projectId: number

  @Column({ name: 'generated_at', type: 'datetime', precision: 6, comment: '生成时间' })
  generatedAt: Date

  @Column({
    name: 'ledger_status',
    type: 'enum',
    enum: ['live', 'receipts'],
    default: 'live',
    comment: '口径',
  })
  ledgerStatus: 'live' | 'receipts'

  @Column({ name: 'total_units', type: 'int', default: 0, comment: '事项数' })
  totalUnits: number

  @Column({ name: 'total_entries', type: 'int', default: 0, comment: '记录数' })
  totalEntries: number

  @Column({ name: 'total_attachments', type: 'int', default: 0, comment: '附件数' })
  totalAttachments: number

  @Column({ type: 'json', comment: '快照明细' })
  payload: Record<string, any>

  @Column({ name: 'created_by', type: 'int', unsigned: true, nullable: true, comment: '生成人' })
  createdBy: number | null
}
