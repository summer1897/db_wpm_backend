import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

import { WF_MEMBER_ROLE, WfMemberRole } from '../mobile.constant'

/** 项目成员与角色：决定谁能填报、谁能审核、谁只读 */
@Entity({ name: 'wf_project_member' })
@Index('IDX_member_project_user', ['projectId', 'userId'], { unique: true })
@Index('IDX_member_user', ['userId'])
export class WfProjectMemberEntity extends CommonEntity {
  @Column({ name: 'project_id', type: 'int', comment: '项目' })
  projectId: number

  @Column({ name: 'user_id', type: 'int', unsigned: true, comment: '成员' })
  userId: number

  @Column({
    type: 'enum',
    enum: WF_MEMBER_ROLE,
    default: 'recorder',
    comment: 'owner负责人 manager管理 recorder记录员 viewer只读',
  })
  role: WfMemberRole

  @Column({ type: 'tinyint', default: 1, comment: '状态 1启用 0移出' })
  status: number
}
