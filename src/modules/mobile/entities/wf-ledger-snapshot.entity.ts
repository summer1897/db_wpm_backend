import { Column, Entity } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 台账快照：管理员每次拉取台账归档一份，payload 保存明细。 */
@Entity({ name: 'wf_ledger_snapshot' })
export class WfLedgerSnapshotEntity extends CommonEntity {
  @Column({ name: 'project_scope', type: 'char', length: 64, comment: '项目通道' })
  projectScope: string

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

  @Column({ name: 'total_records', default: 0, comment: '记录总数' })
  totalRecords: number

  @Column({ name: 'total_photos', default: 0, comment: '照片总数' })
  totalPhotos: number

  @Column({ type: 'json', comment: '快照明细' })
  payload: Record<string, any>

  @Column({ name: 'created_by', type: 'int', unsigned: true, nullable: true, comment: '生成人' })
  createdBy: number | null
}
