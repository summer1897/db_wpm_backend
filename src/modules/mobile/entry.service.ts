import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Like, Raw, Repository } from 'typeorm'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { ErrorEnum } from '~/constants/error-code.constant'

import { MobileAuditService } from './audit.service'
import { EntryQueryDto, ReviewEntryDto, SubmitEntryDto } from './dto/entry.dto'
import { WfAttachmentEntity } from './entities/wf-attachment.entity'
import { WfEntryTypeEntity } from './entities/wf-entry-type.entity'
import { WfEntryEntity } from './entities/wf-entry.entity'
import { WfReviewLogEntity } from './entities/wf-review-log.entity'
import { WfUnitStepEntity } from './entities/wf-unit-step.entity'
import { WfUploadLogEntity } from './entities/wf-upload-log.entity'
import { NOT_DELETED, REVIEW_STATUS_NAMES, WfReviewStatus } from './mobile.constant'
import { day, iso, notDeleted, pagerOf } from './mobile.util'
import { MobileProjectService } from './project.service'
import { MobileUnitService } from './unit.service'

/** 施工记录层：提交（幂等）、查询、审核、编号生成 */
@Injectable()
export class MobileEntryService {
  constructor(
    private projectService: MobileProjectService,
    private unitService: MobileUnitService,
    private auditService: MobileAuditService,
    @InjectRepository(WfEntryEntity)
    private entryRepository: Repository<WfEntryEntity>,
    @InjectRepository(WfAttachmentEntity)
    private attachmentRepository: Repository<WfAttachmentEntity>,
    @InjectRepository(WfEntryTypeEntity)
    private entryTypeRepository: Repository<WfEntryTypeEntity>,
    @InjectRepository(WfUnitStepEntity)
    private stepInstanceRepository: Repository<WfUnitStepEntity>,
    @InjectRepository(WfReviewLogEntity)
    private reviewLogRepository: Repository<WfReviewLogEntity>,
    @InjectRepository(WfUploadLogEntity)
    private uploadLogRepository: Repository<WfUploadLogEntity>,
  ) {}

  async findEntry(id: string): Promise<WfEntryEntity> {
    const entry = await this.entryRepository.findOne({
      where: { id, deletedAt: Raw(alias => `${alias} = '${NOT_DELETED}'`) },
    })
    if (!entry)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_NOT_FOUND)
    return entry
  }

  /**
   * 提交施工记录：客户端 UUID 作主键，重复提交返回原回执；
   * 附件必须是本批次上传且尚未绑定的，防止跨记录挪用。
   */
  async submit(user: IAuthUser, dto: SubmitEntryDto, ip: string) {
    const uid = user.uid
    const unit = await this.unitService.findUnit(dto.unitId)
    await this.projectService.assertAccess(unit.projectId, user)

    const exists = await this.entryRepository.findOneBy({ id: dto.id })
    if (exists && exists.recorderId !== uid)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_OWNER_MISMATCH)
    if (exists && exists.status === 'submitted')
      return this.receipt(exists)

    const entryType = await this.entryTypeRepository.findOneBy({ code: dto.typeCode })
    if (!entryType)
      throw new BusinessException(ErrorEnum.MOBILE_ENTRY_TYPE_INVALID)

    if (dto.stepCode) {
      const step = await this.stepInstanceRepository.findOneBy({
        unitId: unit.id,
        stepCode: dto.stepCode,
      })
      if (!step)
        throw new BusinessException(ErrorEnum.MOBILE_STEP_NOT_FOUND)
    }

    const attachmentIds = dto.attachmentIds || []
    const attachments = attachmentIds.length
      ? await this.attachmentRepository.findBy({ id: In(attachmentIds) })
      : []
    if (attachments.length !== attachmentIds.length)
      throw new BusinessException(ErrorEnum.MOBILE_ATTACHMENT_NOT_FOUND)
    for (const attachment of attachments) {
      if (attachment.projectId !== unit.projectId)
        throw new BusinessException(ErrorEnum.MOBILE_SCOPE_MISMATCH)
      if (attachment.entryId && attachment.entryId !== dto.id)
        throw new BusinessException(ErrorEnum.MOBILE_SCOPE_MISMATCH)
    }

    const workDate = dto.workDate || day(new Date())
    const code = exists?.code || (await this.nextCode(unit.code, workDate))
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date()

    const payload = {
      code,
      projectId: unit.projectId,
      unitId: unit.id,
      stepCode: dto.stepCode || null,
      typeCode: dto.typeCode,
      title: dto.title.trim().slice(0, 120),
      content: (dto.content || '').trim().slice(0, 2000),
      occurredAt,
      workDate,
      location: (dto.location || '').trim().slice(0, 120),
      longitude: dto.longitude ?? null,
      latitude: dto.latitude ?? null,
      weather: (dto.weather || '').slice(0, 60),
      temperature: dto.temperature ?? null,
      recorderId: uid,
      status: 'submitted' as const,
      reviewStatus: 'pending' as WfReviewStatus,
      reviewRemark: '',
      submittedAt: new Date(),
      lastError: '',
      attempts: 0,
      nextRetryAt: 0,
      deletedAt: new Date(NOT_DELETED),
    }

    let entry: WfEntryEntity
    if (exists) {
      await this.entryRepository.update(
        { id: dto.id },
        { ...payload, revision: (exists.revision || 1) + 1 },
      )
      entry = await this.findEntry(dto.id)
    }
    else {
      entry = this.entryRepository.create({
        id: dto.id,
        clientCreatedAt: dto.clientCreatedAt ? new Date(dto.clientCreatedAt) : new Date(),
        revision: 1,
        ...payload,
      })
      await this.entryRepository.insert(entry)
    }

    if (attachmentIds.length) {
      await this.attachmentRepository.update(
        { id: In(attachmentIds) },
        { entryId: entry.id, unitId: unit.id },
      )
    }

    await this.reviewLogRepository.insert({
      entryId: entry.id,
      action: 'submit',
      fromStatus: exists?.status || 'draft',
      toStatus: 'submitted',
      operatorId: uid,
      remark: '',
    })
    await this.uploadLogRepository.insert({
      entryId: entry.id,
      attachmentId: null,
      action: 'entry',
      result: 'success',
      httpStatus: 201,
      message: '提交成功',
      clientIp: ip || '',
    })
    await this.unitService.markBuilding(unit)
    await this.auditService.record({
      projectId: unit.projectId,
      entity: 'entry',
      entityId: entry.id,
      action: exists ? 'resubmit' : 'submit',
      after: { code: entry.code, unitId: entry.unitId, typeCode: entry.typeCode, title: entry.title },
      operatorId: uid,
      ip,
    })

    return this.receipt(entry)
  }

  /** 本人记录：移动端增量同步用 */
  async listMine(uid: number, query: EntryQueryDto) {
    const qb = this.entryRepository
      .createQueryBuilder('e')
      .where('e.recorderId = :uid', { uid })
      .andWhere('e.deletedAt = :notDeleted', { notDeleted: notDeleted() })
    if (query.status)
      qb.andWhere('e.status = :status', { status: query.status })
    if (query.unitId)
      qb.andWhere('e.unitId = :unitId', { unitId: query.unitId })
    if (query.updatedAfter)
      qb.andWhere('e.updatedAt > :updatedAfter', { updatedAfter: new Date(query.updatedAfter) })

    const entries = await qb
      .orderBy('e.updatedAt', 'DESC')
      .take(Math.min(500, Number(query.limit) || 200))
      .getMany()

    return {
      entries: await this.toClientList(entries),
      deletedIds: [] as string[],
      serverTime: iso(new Date()),
    }
  }

  /** 某事项下的记录列表 */
  async listByUnit(unitId: string, query: EntryQueryDto, user: IAuthUser) {
    const unit = await this.unitService.findUnit(unitId)
    await this.projectService.assertAccess(unit.projectId, user)
    const { page, pageSize, skip } = pagerOf(query.page, query.pageSize)

    const qb = this.entryRepository
      .createQueryBuilder('e')
      .where('e.unitId = :unitId', { unitId })
      .andWhere('e.deletedAt = :notDeleted', { notDeleted: notDeleted() })
    if (query.status)
      qb.andWhere('e.status = :status', { status: query.status })
    if (query.reviewStatus)
      qb.andWhere('e.reviewStatus = :reviewStatus', { reviewStatus: query.reviewStatus })
    if (query.typeCode)
      qb.andWhere('e.typeCode = :typeCode', { typeCode: query.typeCode })
    if (query.keyword)
      qb.andWhere('(e.title LIKE :kw OR e.content LIKE :kw)', { kw: `%${query.keyword}%` })

    const [entries, total] = await qb
      .orderBy('e.occurredAt', 'DESC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount()

    return { page, pageSize, total, items: await this.toClientList(entries) }
  }

  /** 待审核列表：项目负责人/管理员在移动端批量审核用 */
  async pending(user: IAuthUser, query: EntryQueryDto & { scope?: string }) {
    const project = await this.projectService.resolve(query.scope)
    await this.projectService.assertManager(project.id, user)
    const { page, pageSize, skip } = pagerOf(query.page, query.pageSize)

    const qb = this.entryRepository
      .createQueryBuilder('e')
      .where('e.projectId = :projectId', { projectId: project.id })
      .andWhere('e.status = :status', { status: 'submitted' })
      .andWhere('e.reviewStatus = :reviewStatus', { reviewStatus: 'pending' })
      .andWhere('e.deletedAt = :notDeleted', { notDeleted: notDeleted() })
    if (query.typeCode)
      qb.andWhere('e.typeCode = :typeCode', { typeCode: query.typeCode })
    if (query.keyword)
      qb.andWhere('(e.title LIKE :kw OR e.code LIKE :kw)', { kw: `%${query.keyword}%` })

    const [entries, total] = await qb
      .orderBy('e.submittedAt', 'ASC')
      .addOrderBy('e.occurredAt', 'ASC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount()

    return {
      page,
      pageSize,
      total,
      scope: project.scope,
      items: await this.toClientList(entries),
    }
  }

  /** 记录详情：含附件、事项信息、审核流水 */
  async detail(id: string, user: IAuthUser) {
    const entry = await this.findEntry(id)
    await this.projectService.assertAccess(entry.projectId, user)
    const unit = await this.unitService.findUnit(entry.unitId)
    const attachments = await this.attachmentRepository.find({
      where: { entryId: entry.id },
      order: { sort: 'ASC', createdAt: 'ASC' },
    })
    const logs = await this.reviewLogRepository.find({
      where: { entryId: entry.id },
      order: { createdAt: 'ASC' },
    })
    const [client] = await this.toClientList([entry])
    return {
      entry: client,
      unitCode: unit.code,
      unitName: unit.name,
      attachments: attachments.map(item => this.attachmentClient(item)),
      reviewLogs: logs.map(log => ({
        action: log.action,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        operatorId: log.operatorId,
        remark: log.remark,
        createdAt: iso(log.createdAt),
      })),
    }
  }

  /** 审核：退回必须填写原因，审核留痕 */
  async review(user: IAuthUser, id: string, dto: ReviewEntryDto) {
    const entry = await this.findEntry(id)
    await this.projectService.assertManager(entry.projectId, user)
    if (dto.action === 'reject' && !dto.remark?.trim())
      throw new BusinessException(ErrorEnum.MOBILE_REJECT_REMARK_REQUIRED)

    const fromStatus = entry.reviewStatus || 'pending'
    const toStatus: WfReviewStatus = dto.action === 'approve' ? 'approved' : 'rejected'
    entry.reviewStatus = toStatus
    entry.reviewRemark = (dto.remark || '').trim().slice(0, 500)
    entry.reviewedBy = user.uid
    entry.reviewedAt = new Date()
    await this.entryRepository.save(entry)

    await this.reviewLogRepository.insert({
      entryId: entry.id,
      action: dto.action,
      fromStatus,
      toStatus,
      operatorId: user.uid,
      remark: entry.reviewRemark,
    })
    await this.auditService.record({
      projectId: entry.projectId,
      entity: 'entry',
      entityId: entry.id,
      action: `review:${dto.action}`,
      before: { reviewStatus: fromStatus },
      after: { reviewStatus: toStatus, reviewRemark: entry.reviewRemark },
      operatorId: user.uid,
    })

    return {
      id: entry.id,
      reviewStatus: REVIEW_STATUS_NAMES[(entry.reviewStatus || 'pending') as WfReviewStatus],
      reviewStatusCode: entry.reviewStatus || 'pending',
      reviewRemark: entry.reviewRemark,
      reviewedAt: iso(entry.reviewedAt),
    }
  }

  /** 软删除：仅允许删除本人尚未提交的记录 */
  async remove(id: string, user: IAuthUser) {
    const entry = await this.findEntry(id)
    if (entry.recorderId !== user.uid && !user.roles?.includes('admin'))
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_OWNER_MISMATCH)
    if (entry.status === 'submitted')
      throw new BusinessException(ErrorEnum.MOBILE_ENTRY_LOCKED)
    await this.entryRepository.update({ id }, { deletedAt: new Date() })
    return { id, deleted: true }
  }

  async nextCode(unitCode: string, workDate: string) {
    const prefix = `${unitCode}-${workDate.replace(/-/g, '')}`
    const count = await this.entryRepository.count({ where: { code: Like(`${prefix}-%`) } })
    return `${prefix}-${String(count + 1).padStart(3, '0')}`
  }

  private receipt(entry: WfEntryEntity) {
    return {
      id: entry.id,
      serverId: entry.id,
      code: entry.code,
      unitId: entry.unitId,
      createdAt: iso(entry.submittedAt || entry.createdAt),
      reviewStatus: REVIEW_STATUS_NAMES[(entry.reviewStatus || 'pending') as WfReviewStatus],
      reviewStatusCode: entry.reviewStatus || 'pending',
    }
  }

  private attachmentClient(item: WfAttachmentEntity) {
    return {
      id: item.id,
      kind: item.kind,
      name: item.name,
      mime: item.mime,
      size: item.size,
      sort: item.sort,
      takenAt: iso(item.takenAt),
      longitude: item.longitude,
      latitude: item.latitude,
    }
  }

  private async toClientList(entries: WfEntryEntity[]) {
    if (!entries.length)
      return []
    const unitIds = [...new Set(entries.map(item => item.unitId))]
    const units = await this.entryTypeRepository.manager.query(
      `SELECT id, code, name FROM wf_unit WHERE id IN (${unitIds.map(() => '?').join(',')})`,
      unitIds,
    ) as Array<{ id: string, code: string, name: string }>
    const unitMap = new Map(units.map(item => [item.id, item]))

    const attachments = await this.attachmentRepository
      .createQueryBuilder('a')
      .where('a.entryId IN (:...ids)', { ids: entries.map(item => item.id) })
      .orderBy('a.sort', 'ASC')
      .getMany()
    const grouped = new Map<string, WfAttachmentEntity[]>()
    for (const attachment of attachments) {
      if (!attachment.entryId)
        continue
      const list = grouped.get(attachment.entryId) || []
      list.push(attachment)
      grouped.set(attachment.entryId, list)
    }

    return entries.map(entry => ({
      id: entry.id,
      serverId: entry.id,
      code: entry.code,
      unitId: entry.unitId,
      unitCode: unitMap.get(entry.unitId)?.code || '',
      unitName: unitMap.get(entry.unitId)?.name || '',
      stepCode: entry.stepCode,
      typeCode: entry.typeCode,
      title: entry.title,
      content: entry.content,
      workDate: day(entry.workDate),
      occurredAt: iso(entry.occurredAt),
      location: entry.location,
      weather: entry.weather,
      temperature: entry.temperature,
      status: entry.status,
      recorderId: String(entry.recorderId),
      reviewStatus: REVIEW_STATUS_NAMES[(entry.reviewStatus || 'pending') as WfReviewStatus],
      reviewStatusCode: entry.reviewStatus || 'pending',
      reviewRemark: entry.reviewRemark,
      submittedAt: iso(entry.submittedAt),
      updatedAt: iso(entry.updatedAt),
      attachments: (grouped.get(entry.id) || []).map(item => this.attachmentClient(item)),
    }))
  }
}
