import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

export const WF_RECORD_STATUS = ['draft', 'queued', 'uploading', 'failed', 'submitted'] as const
export type WfRecordStatus = (typeof WF_RECORD_STATUS)[number]

export const WF_REVIEW_STATUS = ['pending', 'approved', 'rejected'] as const
export type WfReviewStatus = (typeof WF_REVIEW_STATUS)[number]

/**
 * 施工记录：主键为客户端生成的 UUID，实现断点续传的幂等提交；
 * 照片先于记录到达（上传时按 X-File-Meta 创建草稿记录），提交时补全并置为 submitted。
 */
@Entity({ name: 'wf_record' })
export class WfRecordEntity {
  @PrimaryColumn({ type: 'varchar', length: 36, comment: '记录ID，客户端UUID' })
  id: string

  @Column({ name: 'project_scope', type: 'char', length: 64, comment: '所属项目通道' })
  projectScope: string

  @Column({ name: 'owner_id', type: 'int', unsigned: true, comment: '填报人' })
  ownerId: number

  @Column({ name: 'type_code', type: 'varchar', length: 32, comment: '施工类型' })
  typeCode: string

  @Column({ name: 'work_date', type: 'date', comment: '施工日期' })
  workDate: string

  @Column({ length: 120, comment: '施工地点' })
  location: string

  @Column({ length: 2000, comment: '施工说明' })
  content: string

  @Column({
    type: 'enum',
    enum: WF_RECORD_STATUS,
    default: 'draft',
    comment: '上传状态',
  })
  status: WfRecordStatus

  @Column({
    name: 'review_status',
    type: 'enum',
    enum: WF_REVIEW_STATUS,
    nullable: true,
    default: 'pending',
    comment: '审核状态',
  })
  reviewStatus: WfReviewStatus | null

  @Column({ name: 'review_remark', length: 500, default: '', comment: '审核意见' })
  reviewRemark: string

  @Column({ name: 'reviewed_by', type: 'int', unsigned: true, nullable: true, comment: '审核人' })
  reviewedBy: number | null

  @Column({ name: 'reviewed_at', type: 'datetime', precision: 6, nullable: true, comment: '审核时间' })
  reviewedAt: Date | null

  @Column({ default: 1, comment: '本机编辑版本号' })
  revision: number

  @Column({ default: 0, comment: '上传尝试次数' })
  attempts: number

  @Column({ name: 'next_retry_at', type: 'bigint', default: 0, comment: '下次重试时间戳(毫秒)' })
  nextRetryAt: number

  @Column({ name: 'last_error', length: 500, default: '', comment: '最近上传失败原因' })
  lastError: string

  @Column({
    name: 'client_created_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
    comment: '客户端创建时间',
  })
  clientCreatedAt: Date | null

  @Column({
    name: 'submitted_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
    comment: '提交时间',
  })
  submittedAt: Date | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
