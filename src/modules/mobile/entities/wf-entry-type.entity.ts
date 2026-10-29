import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 施工内容类型字典：基础 / 运输 / 组装 / 吊装 / 电装 / 调试 */
@Entity({ name: 'wf_entry_type' })
@Index('IDX_entry_type_code', ['code'], { unique: true })
export class WfEntryTypeEntity extends CommonEntity {
  @Column({ length: 32, comment: '类型编码' })
  code: string

  @Column({ length: 60, comment: '类型名称' })
  name: string

  @Column({ name: 'short_name', length: 30, default: '', comment: '简称' })
  shortName: string

  @Column({ length: 30, default: '', comment: '图标名' })
  icon: string

  @Column({ default: 0, comment: '排序' })
  sort: number

  @Column({ type: 'tinyint', default: 1, comment: '状态 1启用 0停用' })
  status: number
}
