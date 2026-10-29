import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { ErrorEnum } from '~/constants/error-code.constant'

import { ReviewRecordDto, SubmitRecordDto } from './dto/record.dto'
import { WfConstructionTypeEntity } from './entities/wf-construction-type.entity'
import { WfProjectEntity } from './entities/wf-project.entity'
import { WfRecordPhotoEntity } from './entities/wf-record-photo.entity'
import { WfRecordEntity, WfReviewStatus } from './entities/wf-record.entity'
import { WfReviewLogEntity } from './entities/wf-review-log.entity'
import { WfUploadLogEntity } from './entities/wf-upload-log.entity'
import {
  MOBILE_CONSTRUCTION_TYPES,
  REVIEW_STATUS_NAMES,
} from './mobile.constant'

function iso(value?: Date | string | null) {
  const time = value ? new Date(value as any).getTime() : Number.NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

/** DATE 列统一按项目所在北京时间归日，避免 UTC 午夜偏移 */
function day(value?: Date | string | null) {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value.slice(0, 10)
  return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

@Injectable()
export class MobileRecordService {
  constructor(
    @InjectRepository(WfProjectEntity)
    private projectRepository: Repository<WfProjectEntity>,
    @InjectRepository(WfConstructionTypeEntity)
    private typeRepository: Repository<WfConstructionTypeEntity>,
    @InjectRepository(WfRecordEntity)
    private recordRepository: Repository<WfRecordEntity>,
    @InjectRepository(WfRecordPhotoEntity)
    private photoRepository: Repository<WfRecordPhotoEntity>,
    @InjectRepository(WfReviewLogEntity)
    private reviewLogRepository: Repository<WfReviewLogEntity>,
    @InjectRepository(WfUploadLogEntity)
    private uploadLogRepository: Repository<WfUploadLogEntity>,
  ) {}

  /**
   * 解析当前项目通道：请求显式携带 scope 时按 scope 查找；
   * 否则要求服务端只启用一个项目，避免记录归属错误。
   */
  async resolveScope(requested?: string): Promise<WfProjectEntity> {
    const qb = this.projectRepository
      .createQueryBuilder('p')
      .where('p.status = 1')
      .orderBy('p.id', 'ASC')

    if (requested)
      qb.andWhere('p.scope = :scope', { scope: requested })

    const projects = await qb.getMany()

    if (requested) {
      const project = projects.find(item => item.scope === requested)
      if (!project)
        throw new BusinessException(ErrorEnum.MOBILE_PROJECT_NOT_FOUND)
      return project
    }

    if (projects.length === 0)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_NOT_FOUND)
    if (projects.length > 1)
      throw new BusinessException(ErrorEnum.MOBILE_PROJECT_AMBIGUOUS)

    return projects[0]
  }

  /** 提交施工记录：照片已先行上传并绑定草稿记录，这里补全字段并置为待审核。重复提交直接回执，保证幂等。 */
  async submit(uid: number, dto: SubmitRecordDto, clientIp = '') {
    const project = await this.resolveScope(dto.scope)
    await this.ensureTypeValid(dto.type)

    const exists = await this.recordRepository.findOneBy({
      id: dto.id,
      projectScope: project.scope,
    })
    if (exists && exists.ownerId !== uid)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_OWNER_MISMATCH)
    // 已提交过的记录直接返回原回执，客户端不会重复发布
    if (exists && exists.status === 'submitted')
      return this.buildReceipt(exists)

    const submittedAt = new Date()
    if (exists) {
      await this.recordRepository.update(
        { id: exists.id },
        {
          typeCode: dto.type,
          workDate: dto.date,
          location: dto.location.trim(),
          content: dto.content.trim(),
          status: 'submitted',
          reviewStatus: 'pending',
          submittedAt,
          attempts: 0,
          nextRetryAt: 0,
          lastError: '',
        },
      )
    }
    else {
      await this.recordRepository.insert({
        id: dto.id,
        projectScope: project.scope,
        ownerId: uid,
        typeCode: dto.type,
        workDate: dto.date,
        location: dto.location.trim(),
        content: dto.content.trim(),
        status: 'submitted',
        reviewStatus: 'pending',
        submittedAt,
        clientCreatedAt: submittedAt,
      })
    }

    await this.bindPhotos(dto.id, project.scope, dto.photoIds)

    await this.reviewLogRepository.insert({
      recordId: dto.id,
      action: 'submit',
      fromStatus: exists?.reviewStatus ?? '',
      toStatus: 'pending',
      operatorId: uid,
      remark: '移动端提交',
    })

    await this.uploadLogRepository.insert({
      recordId: dto.id,
      photoId: null,
      action: 'submit',
      result: 'success',
      httpStatus: 201,
      message: '提交成功',
      clientIp,
    })

    return this.buildReceipt({
      id: dto.id,
      submittedAt,
      reviewStatus: 'pending',
    } as WfRecordEntity)
  }

  /** 本人已提交记录：供移动端同步与合并，deletedIds 预留服务端删除场景 */
  async listMine(uid: number, scope?: string) {
    const project = await this.resolveScope(scope)
    const records = await this.recordRepository.find({
      where: {
        ownerId: uid,
        projectScope: project.scope,
        status: 'submitted',
      },
      order: { submittedAt: 'DESC' },
      take: 200,
    })

    return {
      reports: await this.toClientRecords(records),
      deletedIds: [] as string[],
    }
  }

  /** 审核：仅管理员（由 @Perm + RBAC 保证） */
  async review(uid: number, recordId: string, dto: ReviewRecordDto) {
    if (dto.action === 'reject' && !dto.remark?.trim())
      throw new BusinessException(ErrorEnum.MOBILE_REJECT_REMARK_REQUIRED)

    const record = await this.recordRepository.findOneBy({ id: recordId })
    if (!record)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_NOT_FOUND)

    const nextStatus: WfReviewStatus = dto.action === 'approve' ? 'approved' : 'rejected'
    const fromStatus = record.reviewStatus ?? 'pending'

    await this.recordRepository.update(
      { id: recordId },
      {
        reviewStatus: nextStatus,
        reviewRemark: dto.remark?.trim() ?? '',
        reviewedBy: uid,
        reviewedAt: new Date(),
      },
    )

    await this.reviewLogRepository.insert({
      recordId,
      action: dto.action,
      fromStatus,
      toStatus: nextStatus,
      operatorId: uid,
      remark: dto.remark?.trim() ?? '',
    })

    return { id: recordId, reviewStatus: REVIEW_STATUS_NAMES[nextStatus] }
  }

  /** 照片上传时确保记录草稿存在（照片先于提交到达），并校验归属 */
  async ensureDraftRecord(
    uid: number,
    project: WfProjectEntity,
    recordId: string,
    draft: { typeCode?: string, date?: string, location?: string, content?: string },
  ) {
    const record = await this.recordRepository.findOneBy({
      id: recordId,
      projectScope: project.scope,
    })
    if (record && record.ownerId !== uid)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_OWNER_MISMATCH)
    if (record)
      return record

    const typeCode = MOBILE_CONSTRUCTION_TYPES.includes(draft.typeCode as any)
      ? (draft.typeCode as string)
      : 'other'
    await this.recordRepository.insert({
      id: recordId,
      projectScope: project.scope,
      ownerId: uid,
      typeCode,
      workDate: draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date)
        ? draft.date
        : day(new Date()),
      location: draft.location?.slice(0, 120) || '待填写',
      content: draft.content?.slice(0, 2000) || '（照片先传，说明随提交更新）',
      status: 'draft',
      reviewStatus: 'pending',
      clientCreatedAt: new Date(),
    })
    return this.recordRepository.findOneByOrFail({ id: recordId })
  }

  private async ensureTypeValid(code: string) {
    const type = await this.typeRepository.findOneBy({ code })
    if (!type || type.status !== 1)
      throw new BusinessException(ErrorEnum.MOBILE_TYPE_INVALID)
    return type
  }

  /** 校验并绑定照片：所有照片必须已上传、属于同一项目、且绑定到当前记录 */
  private async bindPhotos(recordId: string, scope: string, photoIds: string[]) {
    const photos = await this.photoRepository.findBy({ id: In(photoIds) })
    for (const photoId of photoIds) {
      const photo = photos.find(item => item.id === photoId)
      if (!photo)
        throw new BusinessException(ErrorEnum.MOBILE_PHOTO_NOT_FOUND)
      if (photo.projectScope !== scope || (photo.recordId && photo.recordId !== recordId))
        throw new BusinessException(ErrorEnum.MOBILE_SCOPE_MISMATCH)
    }
    const unbound = photos.filter(item => item.recordId !== recordId)
    for (const photo of unbound)
      await this.photoRepository.update({ id: photo.id }, { recordId })
  }

  /** 转成移动端 WorkRecord 结构（日期/时间均为 ISO 字符串） */
  async toClientRecords(records: WfRecordEntity[]) {
    if (!records.length)
      return []

    const photos = await this.photoRepository.findBy({
      recordId: In(records.map(row => row.id)),
    })
    const photoMap = new Map<string, WfRecordPhotoEntity[]>()
    for (const photo of photos) {
      const list = photoMap.get(photo.recordId) ?? []
      list.push(photo)
      photoMap.set(photo.recordId, list)
    }

    return records.map((row) => {
      return {
        id: row.id,
        owner: String(row.ownerId),
        type: row.typeCode,
        date: day(row.workDate),
        location: row.location,
        content: row.content,
        photos: (photoMap.get(row.id) ?? []).map(photo => ({
          id: photo.id,
          key: '',
          name: photo.name,
          mime: photo.mime,
          size: photo.size,
          remoteId: photo.id,
          remoteScope: photo.projectScope,
        })),
        status: 'submitted' as const,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        submittedAt: iso(row.submittedAt),
        serverId: row.id,
        reviewStatus: REVIEW_STATUS_NAMES[row.reviewStatus ?? 'pending'],
        scope: row.projectScope,
        revision: row.revision,
      }
    })
  }

  private buildReceipt(record: WfRecordEntity) {
    return {
      id: record.id,
      serverId: record.id,
      createdAt: iso(record.submittedAt),
      reviewStatus: REVIEW_STATUS_NAMES[record.reviewStatus ?? 'pending'],
    }
  }
}
