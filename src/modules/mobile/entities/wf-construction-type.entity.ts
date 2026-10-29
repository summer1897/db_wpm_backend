import { Column, Entity } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 施工类型字典：与移动端 domain.ts 的 constructionTypes 保持一致，code 为前端 workType。 */
@Entity({ name: 'wf_construction_type' })
export class WfConstructionTypeEntity extends CommonEntity {
  @Column({ length: 32, unique: true, comment: '类型编码' })
  code: string

  @Column({ length: 60, comment: '类型名称' })
  name: string

  @Column({ length: 30, default: '', comment: '简称' })
  shortName: string

  @Column({ length: 30, default: '', comment: '图标名' })
  icon: string

  @Column({ default: 0, comment: '排序' })
  sort: number

  @Column({ type: 'tinyint', default: 1, comment: '状态 1启用 0停用' })
  status: number
}
