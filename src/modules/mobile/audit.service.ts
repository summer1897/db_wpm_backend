import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { AuditQueryDto } from './dto/audit.dto'
import { WfAuditLogEntity } from './entities/wf-audit-log.entity'
import { iso, pagerOf } from './mobile.util'
import { MobileProjectService } from './project.service'

export interface AuditInput {
  projectId: number
  entity: 'project' | 'unit' | 'unit_step' | 'entry' | 'attachment'
  entityId: string
  action: string
  before?: Record<string, any> | null
  after?: Record<string, any> | null
  operatorId?: number | null
  ip?: string
}

/** 留痕层：任何增删改都能追到人、追到改前改后的值 */
@Injectable()
export class MobileAuditService {
  constructor(
    private projectService: MobileProjectService,
    @InjectRepository(WfAuditLogEntity)
    private auditRepository: Repository<WfAuditLogEntity>,
  ) {}

  /** 写审计不阻断主流程：审计失败只告警，避免日志问题影响现场填报 */
  async record(input: AuditInput) {
    try {
      await this.auditRepository.insert({
        projectId: input.projectId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action.slice(0, 32),
        before: input.before ?? null,
        after: input.after ?? null,
        operatorId: input.operatorId ?? null,
        ip: (input.ip || '').slice(0, 64),
      })
    }
    catch (error) {
      console.warn(`[mobile] 审计写入失败 ${input.entity}:${input.entityId} -> ${error?.message}`)
    }
  }

  async list(projectId: number, query: AuditQueryDto, user: IAuthUser) {
    await this.projectService.assertAccess(projectId, user)
    const { page, pageSize, skip } = pagerOf(query.page, query.pageSize)
    const qb = this.auditRepository
      .createQueryBuilder('a')
      .where('a.projectId = :projectId', { projectId })
    if (query.entity)
      qb.andWhere('a.entity = :entity', { entity: query.entity })
    if (query.entityId)
      qb.andWhere('a.entityId = :entityId', { entityId: query.entityId })
    if (query.action)
      qb.andWhere('a.action LIKE :action', { action: `%${query.action}%` })

    const [items, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount()

    return {
      page,
      pageSize,
      total,
      items: items.map(item => ({
        id: String(item.id),
        entity: item.entity,
        entityId: item.entityId,
        action: item.action,
        before: item.before,
        after: item.after,
        operatorId: item.operatorId,
        ip: item.ip,
        createdAt: iso(item.createdAt),
      })),
    }
  }
}
