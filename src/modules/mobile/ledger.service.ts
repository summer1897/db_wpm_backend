import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { UserEntity } from '~/modules/user/user.entity'

import { LedgerQueryDto } from './dto/audit.dto'
import { WfAttachmentEntity } from './entities/wf-attachment.entity'
import { WfEntryEntity } from './entities/wf-entry.entity'
import { WfLedgerSnapshotEntity } from './entities/wf-ledger-snapshot.entity'
import { WfUnitEntity } from './entities/wf-unit.entity'
import {
  REVIEW_STATUS_NAMES,
  UNIT_STATUS_NAMES,
  WfReviewStatus,
  WfUnitStatus,
} from './mobile.constant'
import { day, iso, notDeleted, num, pagerOf, progressOf } from './mobile.util'
import { MobileProjectService } from './project.service'
import { MobileUnitService } from './unit.service'

/**
 * 台账层：把「项目 → 事项 → 记录 → 附件」按报送口径汇总成一份可归档的快照。
 * 每次拉取都会落一份 wf_ledger_snapshot，历史口径可回溯，避免后期数据变动导致对不上数。
 */
@Injectable()
export class MobileLedgerService {
  constructor(
    private projectService: MobileProjectService,
    private unitService: MobileUnitService,
    @InjectRepository(WfEntryEntity)
    private entryRepository: Repository<WfEntryEntity>,
    @InjectRepository(WfUnitEntity)
    private unitRepository: Repository<WfUnitEntity>,
    @InjectRepository(WfAttachmentEntity)
    private attachmentRepository: Repository<WfAttachmentEntity>,
    @InjectRepository(WfLedgerSnapshotEntity)
    private snapshotRepository: Repository<WfLedgerSnapshotEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  /** 首页看板：不落快照，只给当前进度与待办 */
  async dashboard(scope: string | undefined, user: IAuthUser) {
    const project = await this.projectService.resolve(scope)
    const role = await this.projectService.assertAccess(project.id, user)

    const units = await this.unitRepository.find({
      where: { projectId: project.id },
      order: { code: 'ASC' },
    })
    const alive = units.filter(item => day(item.deletedAt) === '1970-01-01')

    const byStatus = new Map<WfUnitStatus, number>()
    for (const unit of alive)
      byStatus.set(unit.status, (byStatus.get(unit.status) || 0) + 1)

    const pending = await this.entryRepository.countBy({
      projectId: project.id,
      status: 'submitted',
      reviewStatus: 'pending',
    })
    const entries = alive.length
      ? await this.entryRepository.find({
        where: { projectId: project.id, status: 'submitted' },
        order: { occurredAt: 'DESC' },
        take: 5,
      })
      : []

    const progress = alive.length
      ? Math.round(alive.reduce((sum, item) => sum + (item.progress || 0), 0) / alive.length)
      : 0

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        scope: project.scope,
        status: project.status,
        capacityMw: num(project.capacityMw),
        location: project.location,
        startDate: day(project.startDate),
        endDate: day(project.endDate),
      },
      role,
      progress,
      unitTotal: alive.length,
      unitStatus: (Object.keys(UNIT_STATUS_NAMES) as WfUnitStatus[]).map(code => ({
        code,
        name: UNIT_STATUS_NAMES[code],
        count: byStatus.get(code) || 0,
      })),
      pendingReview: pending,
      recentEntries: entries.map(item => ({
        id: item.id,
        code: item.code,
        title: item.title,
        unitId: item.unitId,
        workDate: day(item.workDate),
        occurredAt: iso(item.occurredAt),
        reviewStatus: item.reviewStatus || 'pending',
        reviewName: REVIEW_STATUS_NAMES[(item.reviewStatus || 'pending') as WfReviewStatus],
      })),
    }
  }

  /** 工作台账：按项目汇总事项与记录，落快照后返回 */
  async snapshot(uid: number, query: LedgerQueryDto, user: IAuthUser) {
    const project = await this.projectService.resolve(query.scope)
    await this.projectService.assertManager(project.id, user)

    const units = await this.unitService.list(
      project.id,
      { page: 1, pageSize: 100, typeCode: query.typeCode },
      user,
    )

    const qb = this.entryRepository
      .createQueryBuilder('e')
      .where('e.projectId = :projectId', { projectId: project.id })
      .andWhere('e.status = :status', { status: 'submitted' })
      .andWhere('e.deletedAt = :notDeleted', { notDeleted: notDeleted() })
    if (query.reviewStatus)
      qb.andWhere('e.reviewStatus = :reviewStatus', { reviewStatus: query.reviewStatus })
    if (query.typeCode)
      qb.andWhere('e.typeCode = :typeCode', { typeCode: query.typeCode })
    if (query.dateFrom)
      qb.andWhere('e.workDate >= :dateFrom', { dateFrom: query.dateFrom })
    if (query.dateTo)
      qb.andWhere('e.workDate <= :dateTo', { dateTo: query.dateTo })

    const entries = await qb
      .orderBy('e.occurredAt', 'DESC')
      .addOrderBy('e.code', 'DESC')
      .take(500)
      .getMany()

    const entryIds = entries.map(item => item.id)
    const attachments = entryIds.length
      ? await this.attachmentRepository.find({
        where: { entryId: In(entryIds) },
        order: { sort: 'ASC' },
      })
      : []
    const attachmentMap = new Map<string, WfAttachmentEntity[]>()
    for (const item of attachments) {
      if (!item.entryId)
        continue
      const list = attachmentMap.get(item.entryId) || []
      list.push(item)
      attachmentMap.set(item.entryId, list)
    }

    const recorderIds = [...new Set(entries.map(item => item.recorderId))]
    const users = recorderIds.length
      ? await this.userRepository.find({ where: { id: In(recorderIds) } })
      : []
    const userMap = new Map(users.map(item => [item.id, item]))

    const unitMap = new Map(units.items.map(item => [item.id, item]))
    const ledgerEntries = entries.map((entry) => {
      const unit = unitMap.get(entry.unitId)
      const recorder = userMap.get(entry.recorderId)
      return {
        id: entry.id,
        code: entry.code,
        unitId: entry.unitId,
        unitCode: unit?.code || '',
        unitName: unit?.name || '',
        stepCode: entry.stepCode,
        typeCode: entry.typeCode,
        title: entry.title,
        content: entry.content,
        workDate: day(entry.workDate),
        occurredAt: iso(entry.occurredAt),
        location: entry.location,
        weather: entry.weather,
        recorderId: String(entry.recorderId),
        recorderName: recorder?.nickname || recorder?.username || String(entry.recorderId),
        reviewStatusCode: entry.reviewStatus || 'pending',
        reviewStatus: REVIEW_STATUS_NAMES[(entry.reviewStatus || 'pending') as WfReviewStatus],
        reviewRemark: entry.reviewRemark,
        submittedAt: iso(entry.submittedAt),
        attachments: (attachmentMap.get(entry.id) || []).map(item => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mime: item.mime,
          size: item.size,
          url: `/api/mobile/attachments/${item.id}`,
        })),
      }
    })

    const summary = {
      totalUnits: units.total,
      unitDone: units.items.filter(item => item.status === 'done').length,
      unitBuilding: units.items.filter(item => item.status === 'building').length,
      totalEntries: ledgerEntries.length,
      entriesPending: ledgerEntries.filter(item => item.reviewStatusCode === 'pending').length,
      entriesApproved: ledgerEntries.filter(item => item.reviewStatusCode === 'approved').length,
      entriesRejected: ledgerEntries.filter(item => item.reviewStatusCode === 'rejected').length,
      totalAttachments: attachments.length,
      progress: units.items.length
        ? Math.round(units.items.reduce((sum, item) => sum + (item.progress || 0), 0) / units.items.length)
        : 0,
    }

    const generatedAt = new Date()
    const payload = {
      summary,
      units: units.items.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        typeCode: item.typeCode,
        typeName: item.typeName,
        status: item.status,
        statusName: item.statusName,
        progress: item.progress,
        doneSteps: item.doneSteps,
        totalSteps: item.totalSteps,
        entryCount: item.entryCount,
        attachmentCount: item.attachmentCount,
      })),
      entries: ledgerEntries,
    }

    // 每次拉取归档一份，历史口径可回溯
    await this.snapshotRepository.insert({
      projectId: project.id,
      generatedAt,
      ledgerStatus: 'live',
      totalUnits: summary.totalUnits,
      totalEntries: summary.totalEntries,
      totalAttachments: summary.totalAttachments,
      payload,
      createdBy: uid,
    } as any)

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        scope: project.scope,
      },
      generatedAt: iso(generatedAt),
      ledgerStatus: 'live' as const,
      ...payload,
    }
  }

  /** 历史快照：只返回表头，点开再看明细，避免一次拉回巨大 JSON */
  async snapshots(projectId: number, page: number | undefined, pageSize: number | undefined, user: IAuthUser) {
    await this.projectService.assertAccess(projectId, user)
    const pager = pagerOf(page, pageSize)
    const [items, total] = await this.snapshotRepository.findAndCount({
      where: { projectId },
      order: { generatedAt: 'DESC', id: 'DESC' },
      skip: pager.skip,
      take: pager.pageSize,
    })
    return {
      page: pager.page,
      pageSize: pager.pageSize,
      total,
      items: items.map(item => ({
        id: item.id,
        generatedAt: iso(item.generatedAt),
        ledgerStatus: item.ledgerStatus,
        totalUnits: item.totalUnits,
        totalEntries: item.totalEntries,
        totalAttachments: item.totalAttachments,
        createdBy: item.createdBy,
      })),
    }
  }

  /** 快照明细 */
  async snapshotDetail(id: number, user: IAuthUser) {
    const snapshot = await this.snapshotRepository.findOneBy({ id })
    if (!snapshot)
      return null
    await this.projectService.assertAccess(snapshot.projectId, user)
    return {
      id: snapshot.id,
      generatedAt: iso(snapshot.generatedAt),
      ledgerStatus: snapshot.ledgerStatus,
      ...(snapshot.payload || {}),
    }
  }

  /**
   * 项目整体汇总，PC 端看板同源。
   *
   * 这里直接聚合基表，不再依赖 `vw_project_summary` 视图：
   * 视图只存在于 deploy/sql 里，而开发环境靠 TypeORM synchronize 建表，
   * 视图不会被创建，页面就会因为「表不存在」整体报错。
   */
  async projectSummaries() {
    const rows = await this.unitRepository.manager.query(
      `SELECT p.id, p.code, p.name, p.status, p.capacity_mw AS capacityMw,
              (SELECT COUNT(*) FROM wf_unit u
                WHERE u.project_id = p.id AND u.deleted_at = ?) AS unitTotal,
              (SELECT COUNT(*) FROM wf_unit u
                WHERE u.project_id = p.id AND u.status = 'done' AND u.deleted_at = ?) AS unitDone,
              (SELECT COUNT(*) FROM wf_entry e
                WHERE e.project_id = p.id AND e.status = 'submitted' AND e.deleted_at = ?) AS entryTotal,
              (SELECT COUNT(*) FROM wf_entry e
                WHERE e.project_id = p.id AND e.status = 'submitted'
                  AND e.review_status = 'pending' AND e.deleted_at = ?) AS entryPending,
              (SELECT COUNT(*) FROM wf_attachment a
                WHERE a.project_id = p.id) AS attachmentTotal
         FROM wf_project p
        ORDER BY p.id ASC`,
      [notDeleted(), notDeleted(), notDeleted(), notDeleted()],
    ) as Array<Record<string, any>>
    return rows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      capacityMw: num(row.capacityMw),
      unitTotal: num(row.unitTotal) || 0,
      unitDone: num(row.unitDone) || 0,
      entryTotal: num(row.entryTotal) || 0,
      entryPending: num(row.entryPending) || 0,
      attachmentTotal: num(row.attachmentTotal) || 0,
      progress: progressOf(num(row.unitDone) || 0, num(row.unitTotal) || 0),
    }))
  }
}
