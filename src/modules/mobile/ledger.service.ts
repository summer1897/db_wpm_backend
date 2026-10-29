import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'

import { UserEntity } from '~/modules/user/user.entity'

import { WfLedgerSnapshotEntity } from './entities/wf-ledger-snapshot.entity'
import { WfRecordPhotoEntity } from './entities/wf-record-photo.entity'
import { WfRecordEntity } from './entities/wf-record.entity'
import { REVIEW_STATUS_NAMES } from './mobile.constant'
import { MobileRecordService } from './record.service'

function iso(value?: Date | string | null) {
  const time = value ? new Date(value as any).getTime() : Number.NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

function day(value?: Date | string | null) {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value.slice(0, 10)
  return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

/** 台账：管理员拉取全项目已提交记录，口径与移动端 analyzeLedger 一致（仅 submitted）。 */
@Injectable()
export class MobileLedgerService {
  constructor(
    private recordService: MobileRecordService,
    @InjectRepository(WfRecordEntity)
    private recordRepository: Repository<WfRecordEntity>,
    @InjectRepository(WfRecordPhotoEntity)
    private photoRepository: Repository<WfRecordPhotoEntity>,
    @InjectRepository(WfLedgerSnapshotEntity)
    private snapshotRepository: Repository<WfLedgerSnapshotEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  async snapshot(uid: number, scope?: string) {
    const project = await this.recordService.resolveScope(scope)
    const records = await this.recordRepository.find({
      where: { projectScope: project.scope, status: 'submitted' },
      order: { submittedAt: 'DESC' },
      take: 500,
    })

    const photos = records.length
      ? await this.photoRepository.findBy({ recordId: In(records.map(row => row.id)) })
      : []
    const photoMap = new Map<string, typeof photos>()
    for (const photo of photos) {
      const list = photoMap.get(photo.recordId) ?? []
      list.push(photo)
      photoMap.set(photo.recordId, list)
    }

    const ownerIds = [...new Set(records.map(row => row.ownerId))]
    const users = ownerIds.length
      ? await this.userRepository.find({ where: { id: In(ownerIds) } })
      : []
    const userMap = new Map(users.map(user => [user.id, user]))

    const reports = records.map((row) => {
      const user = userMap.get(row.ownerId)
      return {
        id: row.id,
        owner: String(row.ownerId),
        reporter: {
          id: String(row.ownerId),
          name: user?.nickname || user?.username || String(row.ownerId),
        },
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
        reviewRemark: row.reviewRemark,
        scope: row.projectScope,
        revision: row.revision,
      }
    })

    const generatedAt = new Date()
    // 每次拉取归档一份快照，便于回溯历史台账口径
    await this.snapshotRepository.insert({
      projectScope: project.scope,
      generatedAt,
      ledgerStatus: 'live',
      totalRecords: reports.length,
      totalPhotos: photos.length,
      payload: { reports },
      createdBy: uid,
    })

    return {
      scope: project.scope,
      projectName: project.name,
      generatedAt: generatedAt.toISOString(),
      ledgerStatus: 'live' as const,
      reports,
    }
  }
}
