import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

import { WF_STEP_STATUS, WfStepStatus } from '../mobile.constant'

/** 事项工序实例：某台风机每道工序的完成情况 */
@Entity({ name: 'wf_unit_step' })
@Index('IDX_unit_step_unique', ['unitId', 'stepCode'], { unique: true })
@Index('IDX_unit_step_status', ['unitId', 'status'])
@Index('IDX_unit_step_code', ['stepCode'])
export class WfUnitStepEntity extends CommonEntity {
  @Column({ name: 'unit_id', type: 'varchar', length: 36, comment: '事项' })
  unitId: string

  @Column({ name: 'step_code', length: 32, comment: '工序编码' })
  stepCode: string

  @Column({ name: 'step_name', length: 60, comment: '工序名称快照' })
  stepName: string

  @Column({ default: 0, comment: '顺序快照' })
  sort: number

  @Column({ type: 'enum', enum: WF_STEP_STATUS, default: 'pending', comment: '状态' })
  status: WfStepStatus

  @Column({ name: 'done_at', type: 'datetime', precision: 6, nullable: true, comment: '完成时间' })
  doneAt: Date | null

  @Column({ name: 'done_by', type: 'int', unsigned: true, nullable: true, comment: '完成人' })
  doneBy: number | null

  @Column({ length: 255, default: '', comment: '备注' })
  remark: string
}
