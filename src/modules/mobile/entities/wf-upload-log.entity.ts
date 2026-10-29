import { Column, Entity, Index } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 上传流水：照片/文档上传与记录提交逐笔留痕，便于弱网排障 */
@Entity({ name: 'wf_upload_log' })
@Index('IDX_upload_entry', ['entryId'])
export class WfUploadLogEntity extends CommonEntity {
  @Column({ name: 'entry_id', type: 'varchar', length: 36, nullable: true, comment: '施工记录（附件先传时为NULL）' })
  entryId: string | null

  @Column({ name: 'attachment_id', type: 'varchar', length: 36, nullable: true, comment: '附件' })
  attachmentId: string | null

  @Column({ type: 'enum', enum: ['photo', 'doc', 'entry'], comment: '动作' })
  action: 'photo' | 'doc' | 'entry'

  @Column({ type: 'enum', enum: ['success', 'fail'], comment: '结果' })
  result: 'success' | 'fail'

  @Column({ name: 'http_status', type: 'int', nullable: true, comment: 'HTTP 状态' })
  httpStatus: number | null

  @Column({ length: 500, default: '', comment: '结果说明' })
  message: string

  @Column({ name: 'client_ip', length: 64, default: '', comment: '客户端IP' })
  clientIp: string
}
