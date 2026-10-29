import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

import {
  decimalTransformer,
  NOT_DELETED,
  WF_RECORD_STATUS,
  WF_REVIEW_STATUS,
  WfRecordStatus,
  WfReviewStatus,
} from '../mobile.constant'

/** 施工记录：挂到具体事项（风机）下，主键为客户端 UUID 保证断点续传幂等 */
@Entity({ name: 'wf_entry' })
@Index('IDX_entry_unit_time', ['unitId', 'occurredAt'])
@Index('IDX_entry_project_status', ['projectId', 'status'])
@Index('IDX_entry_review', ['reviewStatus'])
@Index('IDX_entry_recorder', ['recorderId'])
@Index('IDX_entry_step', ['unitId', 'stepCode'])
export class WfEntryEntity {
  @PrimaryColumn({ type: 'varchar', length: 36, comment: '记录ID，客户端UUID' })
  id: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ length: 40, default: '', comment: '人类可读编号' })
  code: string

  @Column({ name: 'project_id', type: 'int', comment: '所属项目' })
  projectId: number

  @Column({ name: 'unit_id', type: 'varchar', length: 36, comment: '所属事项/风机' })
  unitId: string

  @Column({ name: 'step_code', type: 'varchar', length: 32, nullable: true, comment: '关联工序' })
  stepCode: string | null

  @Column({ name: 'type_code', length: 32, default: 'other', comment: '施工内容类型' })
  typeCode: string

  @Column({ length: 120, default: '', comment: '事项名称' })
  title: string

  @Column({ length: 2000, default: '', comment: '施工说明/备注' })
  content: string

  @Column({ name: 'occurred_at', type: 'datetime', precision: 6, nullable: true, comment: '实际发生时间' })
  occurredAt: Date | null

  @Column({ name: 'work_date', type: 'date', comment: '施工日期' })
  workDate: string

  @Column({ length: 120, default: '', comment: '施工地点' })
  location: string

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '经度',
  })
  longitude: number | null

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '纬度',
  })
  latitude: number | null

  @Column({ length: 60, default: '', comment: '天气快照' })
  weather: string

  @Column({ type: 'tinyint', nullable: true, comment: '气温(℃)快照' })
  temperature: number | null

  @Column({ name: 'recorder_id', type: 'int', unsigned: true, comment: '记录人' })
  recorderId: number

  @Column({ type: 'enum', enum: WF_RECORD_STATUS, default: 'draft', comment: '上传状态机' })
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

  @Column({ name: 'submitted_at', type: 'datetime', precision: 6, nullable: true, comment: '提交时间' })
  submittedAt: Date | null

  @Column({
    name: 'deleted_at',
    type: 'datetime',
    precision: 6,
    default: () => `'${NOT_DELETED}'`,
    comment: '软删除时间',
  })
  deletedAt: Date
}
