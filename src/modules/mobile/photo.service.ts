import type { MultipartFile } from '@fastify/multipart'
import type { FastifyReply } from 'fastify'
import { extname } from 'node:path'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { ErrorEnum } from '~/constants/error-code.constant'

import { WfRecordPhotoEntity } from './entities/wf-record-photo.entity'
import { WfRecordEntity } from './entities/wf-record.entity'
import { WfUploadLogEntity } from './entities/wf-upload-log.entity'
import { MinioService } from './minio.service'
import { MOBILE_MAX_PHOTO_BYTES } from './mobile.constant'
import { MobileRecordService } from './record.service'

export interface MobilePhotoMeta {
  id: string
  recordId: string
  module?: string
  date?: string
  location?: string
  name?: string
  description?: string
}

const UUID_RE = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i

@Injectable()
export class MobilePhotoService {
  constructor(
    private recordService: MobileRecordService,
    private minioService: MinioService,
    @InjectRepository(WfRecordPhotoEntity)
    private photoRepository: Repository<WfRecordPhotoEntity>,
    @InjectRepository(WfRecordEntity)
    private recordRepository: Repository<WfRecordEntity>,
    @InjectRepository(WfUploadLogEntity)
    private uploadLogRepository: Repository<WfUploadLogEntity>,
  ) {}

  /**
   * 上传施工照片：X-File-Meta 携带 {id, recordId, module, date, location, name, description}。
   * 记录草稿随首张照片创建；重复上传同一 photoId 直接返回原回执，保证断点续传幂等。
   */
  async upload(
    uid: number,
    file: MultipartFile | undefined,
    metaHeader: string | string[] | undefined,
    clientIp = '',
  ) {
    if (!file)
      throw new BadRequestException('Request is not multipart')
    const meta = this.parseMeta(metaHeader)

    const buffer = await file.toBuffer()
    if (buffer.length <= 0 || buffer.length > MOBILE_MAX_PHOTO_BYTES)
      throw new BusinessException(ErrorEnum.MOBILE_FILE_TOO_LARGE)

    const project = await this.recordService.resolveScope()

    const record = await this.recordService.ensureDraftRecord(uid, project, meta.recordId, {
      typeCode: meta.module,
      date: meta.date,
      location: meta.location,
      content: meta.description,
    })
    if (record.ownerId !== uid)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_OWNER_MISMATCH)

    // 幂等：同一照片重复上传返回原回执
    const exists = await this.photoRepository.findOneBy({ id: meta.id })
    if (exists) {
      if (exists.projectScope !== project.scope)
        throw new BusinessException(ErrorEnum.MOBILE_SCOPE_MISMATCH)
      return { id: exists.id, scope: project.scope }
    }

    const extname = this.resolveExtname(meta.name, file.mimetype)
    const storagePath = this.minioService.objectPath(project.scope, meta.recordId, meta.id, extname)

    try {
      await this.minioService.put(storagePath, buffer, file.mimetype || 'application/octet-stream')
    }
    catch (error) {
      await this.uploadLogRepository.insert({
        recordId: meta.recordId,
        photoId: meta.id,
        action: 'photo',
        result: 'fail',
        httpStatus: null,
        message: error?.message || '对象存储不可用',
        clientIp,
      })
      throw error
    }

    await this.photoRepository.insert({
      id: meta.id,
      recordId: meta.recordId,
      projectScope: project.scope,
      name: (meta.name || '').slice(0, 160),
      mime: file.mimetype || '',
      size: buffer.length,
      storagePath,
      metaModule: meta.module || null,
      metaDate: meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : null,
      metaLocation: meta.location?.slice(0, 120) || null,
      metaDescription: meta.description?.slice(0, 500) || null,
    })

    await this.uploadLogRepository.insert({
      recordId: meta.recordId,
      photoId: meta.id,
      action: 'photo',
      result: 'success',
      httpStatus: 201,
      message: '上传成功',
      clientIp,
    })

    return { id: meta.id, scope: project.scope }
  }

  /** 照片读取：本人记录或管理员（台账照片浏览共用一个入口） */
  async stream(id: string, user: IAuthUser, reply: FastifyReply) {
    const photo = await this.photoRepository.findOneBy({ id })
    if (!photo)
      throw new BusinessException(ErrorEnum.MOBILE_PHOTO_NOT_FOUND)

    const record = await this.recordRepository.findOneBy({ id: photo.recordId })
    const isOwner = record && record.ownerId === user.uid
    const isAdmin = user.roles?.includes('admin')
    if (!isOwner && !isAdmin)
      throw new BusinessException(ErrorEnum.MOBILE_RECORD_OWNER_MISMATCH)

    const stream = await this.minioService.getStream(photo.storagePath)
    return reply
      .type(photo.mime || 'application/octet-stream')
      .header('Content-Disposition', 'inline')
      .send(stream)
  }

  private parseMeta(metaHeader: string | string[] | undefined): MobilePhotoMeta {
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

    if (
      !value
      || !UUID_RE.test(value.id || '')
      || !UUID_RE.test(value.recordId || '')
    ) {
      throw new BusinessException(ErrorEnum.MOBILE_PHOTO_META_INVALID)
    }

    return {
      id: value.id,
      recordId: value.recordId,
      module: value.module,
      date: value.date,
      location: value.location,
      name: value.name,
      description: value.description,
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
    return '.jpg'
  }
}
