import type { MultipartFile } from '@fastify/multipart'
import type { FastifyReply } from 'fastify'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { ErrorEnum } from '~/constants/error-code.constant'

import { MobileAuditService } from './audit.service'
import { AttachmentQueryDto } from './dto/attachment.dto'
import { WfAttachmentEntity } from './entities/wf-attachment.entity'
import { WfEntryEntity } from './entities/wf-entry.entity'
import { WfUploadLogEntity } from './entities/wf-upload-log.entity'
import { MinioService } from './minio.service'
import {
  MOBILE_MAX_DOC_BYTES,
  MOBILE_MAX_PHOTO_BYTES,
  WfAttachmentKind,
} from './mobile.constant'
import { iso, num, UUID_RE } from './mobile.util'
import { MobileProjectService } from './project.service'
import { MobileUnitService } from './unit.service'

export interface MobileAttachmentMeta {
  id: string
  unitId?: string
  entryId?: string
  kind?: WfAttachmentKind
  name?: string
  takenAt?: string
  longitude?: number
  latitude?: number
  sort?: number
}

/**
 * 附件层：照片 / 文档 / 语音统一走 MinIO。
 * 上传与提交解耦——现场先传附件拿到回执，记录提交时再用 attachmentIds 绑定，
 * 弱网下即便记录一直提交不上去，照片也不会丢。
 */
@Injectable()
export class MobileAttachmentService {
  constructor(
    private projectService: MobileProjectService,
    private unitService: MobileUnitService,
    private minioService: MinioService,
    private auditService: MobileAuditService,
    @InjectRepository(WfAttachmentEntity)
    private attachmentRepository: Repository<WfAttachmentEntity>,
    @InjectRepository(WfEntryEntity)
    private entryRepository: Repository<WfEntryEntity>,
    @InjectRepository(WfUploadLogEntity)
    private uploadLogRepository: Repository<WfUploadLogEntity>,
  ) {}

  async findAttachment(id: string): Promise<WfAttachmentEntity> {
    const attachment = await this.attachmentRepository.findOneBy({ id })
    if (!attachment)
      throw new BusinessException(ErrorEnum.MOBILE_ATTACHMENT_NOT_FOUND)
    return attachment
  }

  /**
   * 上传附件：X-File-Meta 携带 { id, unitId, kind, name, takenAt, longitude, latitude, sort }。
   * 幂等两级——同一附件ID重复上传返回原回执；同一项目内内容哈希命中直接复用已存对象（秒传）。
   */
  async upload(
    user: IAuthUser,
    file: MultipartFile | undefined,
    metaHeader: string | string[] | undefined,
    clientIp = '',
  ) {
    const uid = user.uid
    if (!file)
      throw new BadRequestException('Request is not multipart')
    const meta = this.parseMeta(metaHeader)
    const kind = meta.kind || this.kindOf(file.mimetype)

    const buffer = await file.toBuffer()
    const limit = kind === 'photo' ? MOBILE_MAX_PHOTO_BYTES : MOBILE_MAX_DOC_BYTES
    if (buffer.length <= 0 || buffer.length > limit)
      throw new BusinessException(ErrorEnum.MOBILE_FILE_TOO_LARGE)

    const unit = meta.unitId ? await this.unitService.findUnit(meta.unitId) : null
    const project = unit
      ? await this.projectService.findById(unit.projectId)
      : await this.projectService.resolve()
    await this.projectService.assertAccess(project.id, user)
    // 幂等：同一附件ID重复上传，直接返回原回执，保证断点续传
    const exists = await this.attachmentRepository.findOneBy({ id: meta.id })
    if (exists) {
      if (exists.projectId !== project.id)
        throw new BusinessException(ErrorEnum.MOBILE_SCOPE_MISMATCH)
      return { ...this.receipt(exists, project.scope), reused: true }
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex')
    // 秒传：同项目内同内容只存一份对象，附件行各自保留便于按事项/记录追溯
    const sameHash = await this.attachmentRepository.findOneBy({ projectId: project.id, sha256 })
    const mime = file.mimetype || 'application/octet-stream'
    const storagePath = sameHash
      ? sameHash.storagePath
      : this.minioService.objectPath(
          project.scope,
          unit?.id || 'inbox',
          meta.id,
          this.resolveExtname(meta.name, file.mimetype),
        )

    if (!sameHash) {
      try {
        await this.minioService.put(storagePath, buffer, mime)
      }
      catch (error) {
        await this.log(meta.id, kind, 'fail', null, error?.message || '对象存储不可用', clientIp)
        throw error
      }
    }

    const attachment = this.attachmentRepository.create({
      id: meta.id,
      projectId: project.id,
      unitId: unit?.id || null,
      entryId: null,
      kind,
      name: (meta.name || file.filename || '').slice(0, 160),
      mime,
      size: buffer.length,
      storagePath,
      sha256,
      takenAt: meta.takenAt ? new Date(meta.takenAt) : new Date(),
      longitude: meta.longitude ?? null,
      latitude: meta.latitude ?? null,
      sort: meta.sort ?? 0,
      createdBy: uid,
    })
    await this.attachmentRepository.insert(attachment)
    await this.log(meta.id, kind, 'success', 201, '上传成功', clientIp)

    return { ...this.receipt(attachment, project.scope), reused: Boolean(sameHash) }
  }

  /** 附件列表：按事项或记录筛选，用于详情页画廊 */
  async list(projectId: number, query: AttachmentQueryDto, user: IAuthUser) {
    await this.projectService.assertAccess(projectId, user)
    const qb = this.attachmentRepository
      .createQueryBuilder('a')
      .where('a.projectId = :projectId', { projectId })
    if (query.unitId)
      qb.andWhere('a.unitId = :unitId', { unitId: query.unitId })
    if (query.entryId)
      qb.andWhere('a.entryId = :entryId', { entryId: query.entryId })
    if (query.kind)
      qb.andWhere('a.kind = :kind', { kind: query.kind })

    const items = await qb
      .orderBy('a.sort', 'ASC')
      .addOrderBy('a.createdAt', 'ASC')
      .take(500)
      .getMany()
    return { total: items.length, items: items.map(item => this.toClient(item)) }
  }

  /** 读取附件：项目成员均可读，台账浏览共用同一入口 */
  async stream(id: string, user: IAuthUser, reply: FastifyReply) {
    const attachment = await this.findAttachment(id)
    await this.projectService.assertAccess(attachment.projectId, user)

    const stream = await this.minioService.getStream(attachment.storagePath)
    return reply
      .type(attachment.mime || 'application/octet-stream')
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.name || attachment.id)}`)
      .send(stream)
  }

  /** 删除附件：已归档到已提交记录的附件不允许删除，保证溯源完整 */
  async remove(id: string, user: IAuthUser) {
    const attachment = await this.findAttachment(id)
    await this.projectService.assertAccess(attachment.projectId, user)

    if (attachment.entryId) {
      const entry = await this.entryRepository.findOneBy({ id: attachment.entryId })
      if (entry && entry.status === 'submitted')
        throw new BusinessException(ErrorEnum.MOBILE_ATTACHMENT_LOCKED)
    }

    await this.attachmentRepository.delete({ id })
    // 对象可能被多条附件行复用（秒传），确认没有其它引用后再删对象
    const remains = await this.attachmentRepository.countBy({ storagePath: attachment.storagePath })
    if (!remains)
      await this.minioService.remove(attachment.storagePath)

    await this.auditService.record({
      projectId: attachment.projectId,
      entity: 'attachment',
      entityId: attachment.id,
      action: 'remove',
      before: { kind: attachment.kind, name: attachment.name, storagePath: attachment.storagePath },
      operatorId: user.uid,
    })

    return { id, deleted: true }
  }

  /** 先传后挂：把未绑定记录的附件挂到具体事项，便于按风机翻照片 */
  async attachToUnit(id: string, unitId: string, user: IAuthUser) {
    const attachment = await this.findAttachment(id)
    const unit = await this.unitService.findUnit(unitId)
    if (attachment.projectId !== unit.projectId)
      throw new BusinessException(ErrorEnum.MOBILE_SCOPE_MISMATCH)
    await this.projectService.assertAccess(unit.projectId, user)

    attachment.unitId = unit.id
    await this.attachmentRepository.save(attachment)
    return this.toClient(attachment)
  }

  toClient(item: WfAttachmentEntity) {
    return {
      id: item.id,
      projectId: item.projectId,
      unitId: item.unitId,
      entryId: item.entryId,
      kind: item.kind,
      name: item.name,
      mime: item.mime,
      size: item.size,
      sha256: item.sha256,
      sort: item.sort,
      takenAt: iso(item.takenAt),
      longitude: num(item.longitude),
      latitude: num(item.latitude),
      url: `/api/mobile/attachments/${item.id}`,
      createdAt: iso(item.createdAt),
    }
  }

  private receipt(item: WfAttachmentEntity, scope: string) {
    return {
      id: item.id,
      scope,
      kind: item.kind,
      size: item.size,
      sha256: item.sha256,
      unitId: item.unitId,
      entryId: item.entryId,
      url: `/api/mobile/attachments/${item.id}`,
    }
  }

  private async log(
    attachmentId: string,
    kind: WfAttachmentKind,
    result: 'success' | 'fail',
    httpStatus: number | null,
    message: string,
    clientIp: string,
  ) {
    await this.uploadLogRepository.insert({
      entryId: null,
      attachmentId,
      action: kind === 'doc' ? 'doc' : 'photo',
      result,
      httpStatus,
      message: message.slice(0, 500),
      clientIp: clientIp || '',
    })
  }

  private kindOf(mime?: string): WfAttachmentKind {
    if (!mime)
      return 'photo'
    if (mime.startsWith('image/'))
      return 'photo'
    if (mime.startsWith('audio/') || mime.startsWith('video/'))
      return 'audio'
    return 'doc'
  }

  private parseMeta(metaHeader: string | string[] | undefined): MobileAttachmentMeta {
    const raw = Array.isArray(metaHeader) ? metaHeader[0] : metaHeader
    if (!raw)
      throw new BusinessException(ErrorEnum.MOBILE_PHOTO_META_INVALID)

    let value: any
    try {
      value = JSON.parse(decodeURIComponent(raw))
    }
    catch {
      throw new BusinessException(ErrorEnum.MOBILE_PHOTO_META_INVALID)
    }

    if (!value || !UUID_RE.test(value.id || ''))
      throw new BusinessException(ErrorEnum.MOBILE_PHOTO_META_INVALID)
    if (value.unitId && !UUID_RE.test(value.unitId))
      throw new BusinessException(ErrorEnum.MOBILE_PHOTO_META_INVALID)

    return {
      id: value.id,
      unitId: value.unitId || undefined,
      entryId: value.entryId || undefined,
      kind: value.kind,
      name: value.name,
      takenAt: value.takenAt,
      longitude: value.longitude === undefined || value.longitude === null ? undefined : Number(value.longitude),
      latitude: value.latitude === undefined || value.latitude === null ? undefined : Number(value.latitude),
      sort: value.sort === undefined ? undefined : Number(value.sort),
    }
  }

  private resolveExtname(name?: string, mime?: string) {
    const fromName = extname(name || '').toLowerCase()
    if (/^\.[a-z\d]{1,8}$/.test(fromName))
      return fromName
    if (mime === 'image/png')
      return '.png'
    if (mime === 'image/webp')
      return '.webp'
    if (mime === 'image/gif')
      return '.gif'
    if (mime === 'audio/mpeg')
      return '.mp3'
    if (mime === 'application/pdf')
      return '.pdf'
    return '.jpg'
  }
}
