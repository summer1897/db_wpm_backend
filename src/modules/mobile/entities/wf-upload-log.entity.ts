import { Column, Entity } from 'typeorm'

import { CommonEntity } from '~/common/entity/common.entity'

/** 上传流水：照片上传与记录提交逐笔留痕，便于审计与排障。 */
@Entity({ name: 'wf_upload_log' })
export class WfUploadLogEntity extends CommonEntity {
  @Column({ name: 'record_id', type: 'varchar', length: 36, comment: '施工记录' })
  recordId: string

  @Column({ name: 'photo_id', type: 'varchar', length: 36, nullable: true, comment: '照片' })
  photoId: string | null

  @Column({ type: 'enum', enum: ['photo', 'submit'], comment: '动作' })
  action: 'photo' | 'submit'

  @Column({ type: 'enum', enum: ['success', 'fail'], comment: '结果' })
  result: 'success' | 'fail'

  @Column({ name: 'http_status', type: 'int', nullable: true, comment: 'HTTP 状态码' })
  httpStatus: number | null

  @Column({ length: 500, default: '', comment: '结果说明' })
  message: string

  @Column({ name: 'client_ip', length: 64, default: '', comment: '客户端 IP' })
  clientIp: string
}
