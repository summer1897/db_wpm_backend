import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { WfEntryTypeEntity } from './entities/wf-entry-type.entity'
import { WfStepEntity } from './entities/wf-step.entity'
import { WfUnitTypeEntity } from './entities/wf-unit-type.entity'
import {
  REVIEW_STATUS_NAMES,
  STEP_STATUS_NAMES,
  UNIT_STATUS_NAMES,
  WF_ATTACHMENT_KIND,
  WF_MEMBER_ROLE,
  WF_RECORD_STATUS,
  WF_REVIEW_STATUS,
  WF_STEP_STATUS,
  WF_UNIT_STATUS,
} from './mobile.constant'

interface DictCache {
  at: number
  payload: Awaited<ReturnType<MobileDictService['build']>>
}

/** 字典层：事项类型 / 施工内容类型 / 标准工序，移动端首次进入时一次拉全 */
@Injectable()
export class MobileDictService {
  private cache: DictCache | null = null

  constructor(
    @InjectRepository(WfUnitTypeEntity)
    private unitTypeRepository: Repository<WfUnitTypeEntity>,
    @InjectRepository(WfEntryTypeEntity)
    private entryTypeRepository: Repository<WfEntryTypeEntity>,
    @InjectRepository(WfStepEntity)
    private stepRepository: Repository<WfStepEntity>,
  ) {}

  /** 字典变动不频繁，进程内缓存 60 秒，避免每次进页面都打三张表 */
  async bootstrap(force = false) {
    const now = Date.now()
    if (!force && this.cache && now - this.cache.at < 60_000)
      return this.cache.payload

    const payload = await this.build()
    this.cache = { at: now, payload }
    return payload
  }

  async unitTypes() {
    const types = await this.unitTypeRepository.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    })
    return types.map(item => ({
      code: item.code,
      name: item.name,
      icon: item.icon,
      codeLabel: item.codeLabel,
      sort: item.sort,
    }))
  }

  async entryTypes() {
    const types = await this.entryTypeRepository.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    })
    return types.map(item => ({
      code: item.code,
      name: item.name,
      shortName: item.shortName,
      icon: item.icon,
      sort: item.sort,
    }))
  }

  /** 工序模板：传入类型编码时只返回该类型的工序 */
  async steps(typeCode?: string) {
    const steps = await this.stepRepository.find({
      where: typeCode ? { typeCode, status: 1 } : { status: 1 },
      order: { typeCode: 'ASC', sort: 'ASC' },
    })
    return steps.map(item => ({
      typeCode: item.typeCode,
      code: item.code,
      name: item.name,
      sort: item.sort,
      required: Boolean(item.required),
    }))
  }

  private async build() {
    const [unitTypes, entryTypes, steps] = await Promise.all([
      this.unitTypes(),
      this.entryTypes(),
      this.steps(),
    ])
    return {
      unitTypes,
      entryTypes,
      steps,
      enums: {
        unitStatus: WF_UNIT_STATUS.map(code => ({ code, name: UNIT_STATUS_NAMES[code] })),
        recordStatus: WF_RECORD_STATUS.map(code => ({ code, name: code })),
        reviewStatus: WF_REVIEW_STATUS.map(code => ({ code, name: REVIEW_STATUS_NAMES[code] })),
        stepStatus: WF_STEP_STATUS.map(code => ({ code, name: STEP_STATUS_NAMES[code] })),
        attachmentKind: WF_ATTACHMENT_KIND.map(code => ({ code, name: code })),
        memberRole: WF_MEMBER_ROLE.map(code => ({ code, name: code })),
      },
    }
  }
}
