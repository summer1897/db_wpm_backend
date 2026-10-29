import { Column, Entity } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 审核流转日志：记录 待审核→已审核/退回修改 的每次操作。 */
@Entity({ name: 'wf_review_log' })
export class WfReviewLogEntity extends CommonEntity {
  @Column({ name: 'record_id', type: 'varchar', length: 36, comment: '施工记录' })
  recordId: string

  @Column({ type: 'enum', enum: ['submit', 'approve', 'reject'], comment: '动作' })
  action: 'submit' | 'approve' | 'reject'

  @Column({ name: 'from_status', length: 20, default: '', comment: '流转前状态' })
  fromStatus: string

  @Column({ name: 'to_status', length: 20, default: '', comment: '流转后状态' })
  toStatus: string

  @Column({ name: 'operator_id', type: 'int', unsigned: true, nullable: true, comment: '操作人' })
  operatorId: number | null

  @Column({ length: 500, default: '', comment: '操作说明/退回原因' })
  remark: string
}
