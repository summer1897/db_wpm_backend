import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 标准工序模板：按事项类型定义应该施工的步骤 */
@Entity({ name: 'wf_step' })
@Index('IDX_step_type_code', ['typeCode', 'code'], { unique: true })
export class WfStepEntity extends CommonEntity {
  @Column({ name: 'type_code', length: 32, comment: '事项类型' })
  typeCode: string

  @Column({ length: 32, comment: '工序编码' })
  code: string

  @Column({ length: 60, comment: '工序名称' })
  name: string

  @Column({ default: 0, comment: '顺序' })
  sort: number

  @Column({ type: 'tinyint', default: 1, comment: '1必做 0可选' })
  required: number

  @Column({ type: 'tinyint', default: 1, comment: '状态 1启用 0停用' })
  status: number
}
