import { Column, Entity } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 项目通道：移动端以 scope(64位十六进制) 归属记录，instance 标识服务实例。 */
@Entity({ name: 'wf_project' })
export class WfProjectEntity extends CommonEntity {
  @Column({ type: 'char', length: 64, unique: true, comment: '项目通道标识' })
  scope: string

  @Column({ length: 120, comment: '项目名称' })
  name: string

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

  @Column({ name: 'expires_at', type: 'datetime', precision: 6, nullable: true, comment: '到期时间' })
  expiresAt: Date | null

  @Column({ type: 'tinyint', default: 1, comment: '状态 1启用 0停用' })
  status: number

  @Column({ length: 255, default: '', comment: '备注' })
  remark: string
}
