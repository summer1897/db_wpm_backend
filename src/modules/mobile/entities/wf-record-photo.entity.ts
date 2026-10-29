import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/** 施工照片：上传接口幂等，photo id 即移动端 Photo.remoteId。 */
@Entity({ name: 'wf_record_photo' })
export class WfRecordPhotoEntity {
  @PrimaryColumn({ type: 'varchar', length: 36, comment: '照片ID，客户端UUID' })
  id: string

  @Column({ name: 'record_id', type: 'varchar', length: 36, comment: '所属施工记录' })
  recordId: string

  @Column({ name: 'project_scope', type: 'char', length: 64, comment: '所属项目通道' })
  projectScope: string

  @Column({ length: 160, default: '', comment: '原始文件名' })
  name: string

  @Column({ length: 60, default: '', comment: 'MIME 类型' })
  mime: string

  @Column({ type: 'int', unsigned: true, default: 0, comment: '文件字节数' })
  size: number

  @Column({ length: 500, comment: 'MinIO 对象键' })
  storagePath: string

  @Column({ name: 'meta_module', type: 'varchar', length: 32, nullable: true, comment: '拍摄时关联的施工类型' })
  metaModule: string | null

  @Column({ name: 'meta_date', type: 'date', nullable: true, comment: '拍摄时记录的施工日期' })
  metaDate: string | null

  @Column({ name: 'meta_location', length: 120, nullable: true, comment: '拍摄时记录的施工地点' })
  metaLocation: string | null

  @Column({
    name: 'meta_description',
    length: 500,
    nullable: true,
    comment: '拍摄时记录的说明',
  })
  metaDescription: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
