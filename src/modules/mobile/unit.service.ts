import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Raw, Repository } from 'typeorm'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { ErrorEnum } from '~/constants/error-code.constant'

import { MobileAuditService } from './audit.service'
import { CreateUnitDto, UnitQueryDto, UpdateStepDto, UpdateUnitDto } from './dto/unit.dto'
import { WfAttachmentEntity } from './entities/wf-attachment.entity'
import { WfEntryEntity } from './entities/wf-entry.entity'
import { WfStepEntity } from './entities/wf-step.entity'
import { WfUnitStepEntity } from './entities/wf-unit-step.entity'
import { WfUnitTypeEntity } from './entities/wf-unit-type.entity'
import { WfUnitEntity } from './entities/wf-unit.entity'
import { NOT_DELETED, UNIT_STATUS_NAMES } from './mobile.constant'
import { day, iso, notDeleted, pagerOf, progressOf } from './mobile.util'
import { MobileProjectService } from './project.service'

interface UnitStat {
  doneSteps: number
  totalSteps: number
  entryCount: number
  attachmentCount: number
  lastEntryAt: Date | null
}

/** 事项（风机）层：列表、详情、新建套模板、工序推进与进度自动推导 */
@Injectable()
export class MobileUnitService {
  constructor(
    private dataSource: DataSource,
    private projectService: MobileProjectService,
    private auditService: MobileAuditService,
    @InjectRepository(WfUnitEntity)
    private unitRepository: Repository<WfUnitEntity>,
    @InjectRepository(WfUnitStepEntity)
    private stepInstanceRepository: Repository<WfUnitStepEntity>,
    @InjectRepository(WfStepEntity)
    private stepRepository: Repository<WfStepEntity>,
    @InjectRepository(WfUnitTypeEntity)
    private unitTypeRepository: Repository<WfUnitTypeEntity>,
    @InjectRepository(WfEntryEntity)
    private entryRepository: Repository<WfEntryEntity>,
    @InjectRepository(WfAttachmentEntity)
    private attachmentRepository: Repository<WfAttachmentEntity>,
  ) {}

  async findUnit(id: string): Promise<WfUnitEntity> {
    const unit = await this.unitRepository.findOne({
      where: { id, deletedAt: Raw(alias => `${alias} = '${NOT_DELETED}'`) },
    })
    if (!unit)
      throw new BusinessException(ErrorEnum.MOBILE_UNIT_NOT_FOUND)
    return unit
  }

  /** 事项列表：按项目 + 状态/类型/关键字筛选，附带工序与记录统计 */
  async list(projectId: number, query: UnitQueryDto, user: IAuthUser) {
    await this.projectService.assertAccess(projectId, user)
    const { page, pageSize, skip } = pagerOf(query.page, query.pageSize)

    const qb = this.unitRepository
      .createQueryBuilder('u')
      .where('u.projectId = :projectId', { projectId })
      .andWhere('u.deletedAt = :notDeleted', { notDeleted: notDeleted() })
    if (query.status)
      qb.andWhere('u.status = :status', { status: query.status })
    if (query.typeCode)
      qb.andWhere('u.typeCode = :typeCode', { typeCode: query.typeCode })
    if (query.keyword)
      qb.andWhere('(u.code LIKE :kw OR u.name LIKE :kw)', { kw: `%${query.keyword}%` })

    const [items, total] = await qb
      .orderBy('u.code', 'ASC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount()

    const stats = await this.statsOf(items.map(item => item.id))
    const types = await this.typeNames()
    return {
      page,
      pageSize,
      total,
      items: items.map(item => this.toClient(item, stats.get(item.id), types.get(item.typeCode))),
    }
  }

  /** 事项详情：基本信息 + 工序进度 + 最近记录 */
  async detail(id: string, user: IAuthUser) {
    const unit = await this.findUnit(id)
    await this.projectService.assertAccess(unit.projectId, user)

    const steps = await this.stepInstanceRepository.find({
      where: { unitId: id },
      order: { sort: 'ASC', id: 'ASC' },
    })
    const entries = await this.entryRepository.find({
      where: { unitId: id, status: 'submitted', deletedAt: Raw(alias => `${alias} = '${NOT_DELETED}'`) },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
      take: 20,
    })
    const attachments = await this.attachmentRepository.countBy({ unitId: id })
    const types = await this.typeNames()
    const stat = (await this.statsOf([id])).get(id)

    return {
      unit: this.toClient(unit, stat, types.get(unit.typeCode)),
      steps: steps.map(step => ({
        stepCode: step.stepCode,
        stepName: step.stepName,
        sort: step.sort,
        status: step.status,
        doneAt: iso(step.doneAt),
        doneBy: step.doneBy,
        remark: step.remark,
      })),
      entries: entries.map(entry => ({
        id: entry.id,
        code: entry.code,
        title: entry.title,
        typeCode: entry.typeCode,
        workDate: day(entry.workDate),
        occurredAt: iso(entry.occurredAt),
        reviewStatus: entry.reviewStatus,
      })),
      unitAttachments: attachments,
    }
  }

  /** 新建事项：同项目编号唯一，自动按类型套用标准工序模板 */
  async create(dto: CreateUnitDto, user: IAuthUser) {
    const project = dto.projectId
      ? await this.projectService.findById(dto.projectId)
      : await this.projectService.resolve(dto.scope)
    await this.projectService.assertAccess(project.id, user)

    const type = await this.unitTypeRepository.findOneBy({ code: dto.typeCode })
    if (!type)
      throw new BusinessException(ErrorEnum.MOBILE_UNIT_TYPE_INVALID)

    const duplicated = await this.unitRepository.count({
      where: {
        projectId: project.id,
        code: dto.code,
        deletedAt: Raw(alias => `${alias} = '${NOT_DELETED}'`),
      },
    })
    if (duplicated)
      throw new BusinessException(ErrorEnum.MOBILE_UNIT_CODE_DUPLICATED)

    const unit = this.unitRepository.create({
      id: dto.id,
      projectId: project.id,
      typeCode: dto.typeCode,
      code: dto.code.trim(),
      name: (dto.name || '').trim(),
      location: (dto.location || '').trim(),
      longitude: dto.longitude ?? null,
      latitude: dto.latitude ?? null,
      status: dto.status || 'planning',
      progress: 0,
      startDate: dto.startDate || null,
      endDate: dto.endDate || null,
      remark: (dto.remark || '').trim().slice(0, 500),
      createdBy: user.uid,
    })

    const templates = await this.stepRepository.find({
      where: { typeCode: dto.typeCode, status: 1 },
      order: { sort: 'ASC' },
    })

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(WfUnitEntity, unit)
      if (templates.length) {
        await manager.insert(
          WfUnitStepEntity,
          templates.map(template => ({
            unitId: unit.id,
            stepCode: template.code,
            stepName: template.name,
            sort: template.sort,
            status: 'pending' as const,
            remark: '',
          })),
        )
      }
    })

    await this.auditService.record({
      projectId: project.id,
      entity: 'unit',
      entityId: unit.id,
      action: 'create',
      after: { code: unit.code, typeCode: unit.typeCode, name: unit.name, status: unit.status },
      operatorId: user.uid,
    })

    return {
      ...this.toClient(unit, undefined, type.name),
      stepsCreated: templates.length,
    }
  }

  async update(id: string, dto: UpdateUnitDto, user: IAuthUser) {
    const unit = await this.findUnit(id)
    await this.projectService.assertAccess(unit.projectId, user)
    const before = { code: unit.code, name: unit.name, status: unit.status, remark: unit.remark }

    if (dto.code && dto.code.trim() !== unit.code) {
      const duplicated = await this.unitRepository.count({
        where: {
          projectId: unit.projectId,
          code: dto.code.trim(),
          deletedAt: Raw(alias => `${alias} = '${NOT_DELETED}'`),
        },
      })
      if (duplicated)
        throw new BusinessException(ErrorEnum.MOBILE_UNIT_CODE_DUPLICATED)
      unit.code = dto.code.trim()
    }
    if (dto.name !== undefined)
      unit.name = dto.name.trim()
    if (dto.location !== undefined)
      unit.location = dto.location.trim()
    if (dto.longitude !== undefined)
      unit.longitude = dto.longitude ?? null
    if (dto.latitude !== undefined)
      unit.latitude = dto.latitude ?? null
    if (dto.status !== undefined)
      unit.status = dto.status
    if (dto.startDate !== undefined)
      unit.startDate = dto.startDate || null
    if (dto.endDate !== undefined)
      unit.endDate = dto.endDate || null
    if (dto.remark !== undefined)
      unit.remark = dto.remark.slice(0, 500)

    await this.unitRepository.save(unit)
    await this.auditService.record({
      projectId: unit.projectId,
      entity: 'unit',
      entityId: unit.id,
      action: 'update',
      before,
      after: { code: unit.code, name: unit.name, status: unit.status, remark: unit.remark },
      operatorId: user.uid,
    })
    const stat = (await this.statsOf([id])).get(id)
    const types = await this.typeNames()
    return this.toClient(unit, stat, types.get(unit.typeCode))
  }

  /** 软删除：记录与附件保留，仅供审计追溯 */
  async remove(id: string, user: IAuthUser) {
    const unit = await this.findUnit(id)
    await this.projectService.assertAccess(unit.projectId, user)
    await this.unitRepository.update({ id }, { deletedAt: new Date() })
    await this.auditService.record({
      projectId: unit.projectId,
      entity: 'unit',
      entityId: unit.id,
      action: 'remove',
      before: { code: unit.code, name: unit.name, status: unit.status },
      operatorId: user.uid,
    })
    return { id, deleted: true }
  }

  async steps(unitId: string, user: IAuthUser) {
    const unit = await this.findUnit(unitId)
    await this.projectService.assertAccess(unit.projectId, user)
    const steps = await this.stepInstanceRepository.find({
      where: { unitId },
      order: { sort: 'ASC', id: 'ASC' },
    })
    return steps.map(step => ({
      stepCode: step.stepCode,
      stepName: step.stepName,
      sort: step.sort,
      status: step.status,
      doneAt: iso(step.doneAt),
      doneBy: step.doneBy,
      remark: step.remark,
    }))
  }

  /** 工序推进：标记完成后重算事项进度；全部工序完成则事项自动置为已完成 */
  async setStep(unitId: string, stepCode: string, dto: UpdateStepDto, user: IAuthUser) {
    const unit = await this.findUnit(unitId)
    await this.projectService.assertAccess(unit.projectId, user)

    const step = await this.stepInstanceRepository.findOneBy({ unitId, stepCode })
    if (!step)
      throw new BusinessException(ErrorEnum.MOBILE_STEP_NOT_FOUND)

    step.status = dto.status
    if (dto.remark !== undefined)
      step.remark = dto.remark.slice(0, 255)
    if (dto.status === 'done') {
      step.doneAt = new Date()
      step.doneBy = user.uid
    }
    else {
      step.doneAt = null
      step.doneBy = null
    }
    await this.stepInstanceRepository.save(step)
    await this.auditService.record({
      projectId: unit.projectId,
      entity: 'unit_step',
      entityId: `${unitId}:${stepCode}`,
      action: 'set',
      after: { status: step.status, remark: step.remark },
      operatorId: user.uid,
    })

    await this.recalc(unitId)
    return this.steps(unitId, user)
  }

  /** 依据工序完成情况刷新事项进度与状态 */
  async recalc(unitId: string) {
    const unit = await this.findUnit(unitId)
    const steps = await this.stepInstanceRepository.find({ where: { unitId } })
    const countable = steps.filter(step => step.status !== 'skipped')
    const done = countable.filter(step => step.status === 'done').length
    const progress = progressOf(done, countable.length)

    unit.progress = progress
    if (countable.length && done === countable.length) {
      unit.status = 'done'
      if (!unit.endDate)
        unit.endDate = day(new Date())
    }
    else if (unit.status === 'done') {
      unit.status = 'building'
      unit.endDate = null
    }
    else if (progress > 0 && unit.status === 'planning') {
      unit.status = 'building'
    }
    await this.unitRepository.save(unit)
    return unit
  }

  /** 记录提交时把待施工的事项推进为施工中 */
  async markBuilding(unit: WfUnitEntity) {
    if (unit.status === 'planning') {
      unit.status = 'building'
      if (!unit.startDate)
        unit.startDate = day(new Date())
      await this.unitRepository.save(unit)
    }
  }

  private async typeNames() {
    const types = await this.unitTypeRepository.find()
    return new Map(types.map(item => [item.code, item.name]))
  }

  private async statsOf(ids: string[]): Promise<Map<string, UnitStat>> {
    const result = new Map<string, UnitStat>()
    if (!ids.length)
      return result
    for (const id of ids)
      result.set(id, { doneSteps: 0, totalSteps: 0, entryCount: 0, attachmentCount: 0, lastEntryAt: null })

    const steps = await this.stepInstanceRepository
      .createQueryBuilder('s')
      .select('s.unitId', 'unitId')
      .addSelect('SUM(CASE WHEN s.status = :done THEN 1 ELSE 0 END)', 'doneSteps')
      .addSelect('SUM(CASE WHEN s.status <> :skipped THEN 1 ELSE 0 END)', 'totalSteps')
      .where('s.unitId IN (:...ids)', { ids })
      .setParameters({ done: 'done', skipped: 'skipped' })
      .groupBy('s.unitId')
      .getRawMany<{ unitId: string, doneSteps: string, totalSteps: string }>()

    for (const row of steps) {
      const item = result.get(row.unitId)
      if (item) {
        item.doneSteps = Number(row.doneSteps) || 0
        item.totalSteps = Number(row.totalSteps) || 0
      }
    }

    const entries = await this.entryRepository
      .createQueryBuilder('e')
      .select('e.unitId', 'unitId')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('MAX(e.occurredAt)', 'lastEntryAt')
      .where('e.unitId IN (:...ids)', { ids })
      .andWhere('e.status = :status', { status: 'submitted' })
      .andWhere('e.deletedAt = :notDeleted', { notDeleted: notDeleted() })
      .groupBy('e.unitId')
      .getRawMany<{ unitId: string, entryCount: string, lastEntryAt: Date | null }>()

    for (const row of entries) {
      const item = result.get(row.unitId)
      if (item) {
        item.entryCount = Number(row.entryCount) || 0
        item.lastEntryAt = row.lastEntryAt ? new Date(row.lastEntryAt) : null
      }
    }

    const attachments = await this.attachmentRepository
      .createQueryBuilder('a')
      .select('a.unitId', 'unitId')
      .addSelect('COUNT(*)', 'attachmentCount')
      .where('a.unitId IN (:...ids)', { ids })
      .groupBy('a.unitId')
      .getRawMany<{ unitId: string, attachmentCount: string }>()

    for (const row of attachments) {
      const item = result.get(row.unitId)
      if (item)
        item.attachmentCount = Number(row.attachmentCount) || 0
    }

    return result
  }

  toClient(unit: WfUnitEntity, stat?: UnitStat, typeName?: string) {
    const done = stat?.doneSteps ?? 0
    const total = stat?.totalSteps ?? 0
    return {
      id: unit.id,
      projectId: unit.projectId,
      typeCode: unit.typeCode,
      typeName: typeName || '',
      code: unit.code,
      name: unit.name,
      location: unit.location,
      longitude: unit.longitude,
      latitude: unit.latitude,
      status: unit.status,
      statusName: UNIT_STATUS_NAMES[unit.status] || unit.status,
      progress: total ? progressOf(done, total) : unit.progress,
      startDate: day(unit.startDate),
      endDate: day(unit.endDate),
      remark: unit.remark,
      doneSteps: done,
      totalSteps: total,
      entryCount: stat?.entryCount ?? 0,
      attachmentCount: stat?.attachmentCount ?? 0,
      lastEntryAt: iso(stat?.lastEntryAt),
      createdBy: unit.createdBy,
      createdAt: iso(unit.createdAt),
      updatedAt: iso(unit.updatedAt),
    }
  }
}
