import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 事项类型字典：风机 / 箱变 / 集电线路 / 升压站 / 道路 */
@Entity({ name: 'wf_unit_type' })
@Index('IDX_unit_type_code', ['code'], { unique: true })
export class WfUnitTypeEntity extends CommonEntity {
  @Column({ length: 32, comment: '类型编码' })
  code: string

  @Column({ length: 60, comment: '类型名称' })
  name: string

  @Column({ length: 30, default: '', comment: '图标名' })
  icon: string

  @Column({ name: 'code_label', length: 20, default: '编号', comment: '编号在界面上的叫法' })
  codeLabel: string

  @Column({ default: 0, comment: '排序' })
  sort: number

  @Column({ type: 'tinyint', default: 1, comment: '状态 1启用 0停用' })
  status: number
}
