import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

import { decimalTransformer, WF_ATTACHMENT_KIND, WfAttachmentKind } from '../mobile.constant'

/** 附件：照片 / 文档 / 语音统一存放，storage_path 为 MinIO 对象键 */
@Entity({ name: 'wf_attachment' })
@Index('IDX_attach_entry', ['entryId', 'sort'])
@Index('IDX_attach_unit', ['unitId'])
@Index('IDX_attach_project', ['projectId'])
@Index('IDX_attach_hash', ['sha256'])
export class WfAttachmentEntity {
  @PrimaryColumn({ type: 'varchar', length: 36, comment: '附件ID，客户端UUID' })
  id: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'project_id', type: 'int', comment: '所属项目' })
  projectId: number

  @Column({ name: 'unit_id', type: 'varchar', length: 36, nullable: true, comment: '挂事项' })
  unitId: string | null

  @Column({ name: 'entry_id', type: 'varchar', length: 36, nullable: true, comment: '挂施工记录' })
  entryId: string | null

  @Column({ type: 'enum', enum: WF_ATTACHMENT_KIND, default: 'photo', comment: '附件类型' })
  kind: WfAttachmentKind

  @Column({ length: 160, default: '', comment: '原始文件名' })
  name: string

  @Column({ length: 60, default: '', comment: 'MIME' })
  mime: string

  @Column({ type: 'int', unsigned: true, default: 0, comment: '字节数' })
  size: number

  @Column({ name: 'storage_path', length: 500, comment: 'MinIO 对象键' })
  storagePath: string

  @Column({ type: 'char', length: 64, default: '', comment: '内容哈希' })
  sha256: string

  @Column({ name: 'taken_at', type: 'datetime', precision: 6, nullable: true, comment: '拍摄/文件时间' })
  takenAt: Date | null

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '拍摄经度',
  })
  longitude: number | null

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '拍摄纬度',
  })
  latitude: number | null

  @Column({ default: 0, comment: '展示顺序' })
  sort: number

  @Column({ name: 'created_by', type: 'int', unsigned: true, nullable: true, comment: '上传人' })
  createdBy: number | null
}
