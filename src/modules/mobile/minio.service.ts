import { Readable } from 'node:stream'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { Client } from 'minio'

import { BusinessException } from '~/common/exceptions/biz.exception'

import { IMinioConfig, MinioConfig } from '~/config'

import { ErrorEnum } from '~/constants/error-code.constant'

/**
 * MinIO 对象存储：移动端施工照片的存取统一走这里。
 * 桶不存在时启动阶段自动创建；MinIO 暂不可用只影响照片上传，不阻塞服务启动。
 */
@Injectable()
export class MinioService implements OnModuleInit {
  private client: Client

  constructor(@Inject(MinioConfig.KEY) private config: IMinioConfig) {
    this.client = new Client({
      endPoint: this.config.endpoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    })
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.config.bucket)
      if (!exists) {
        await this.client.makeBucket(this.config.bucket, 'cn-north-1')
        console.log(`[minio] bucket ${this.config.bucket} 已自动创建`)
      }
    }
    catch (error) {
      console.warn(`[minio] 连接失败（${this.config.endpoint}:${this.config.port}），照片上传暂不可用：${error?.message}`)
    }
  }

  /** 对象键约定：mobile/{scope}/{unitId|inbox}/{attachmentId}{ext} */
  objectPath(scope: string, unitId: string, attachmentId: string, extname: string) {
    return `mobile/${scope}/${unitId}/${attachmentId}${extname}`
  }

  async put(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.putObject(this.config.bucket, objectPath, buffer, buffer.length, {
        'Content-Type': contentType,
      })
    }
    catch (error) {
      console.warn(`[minio] 上传失败 ${objectPath}: ${error?.message}`)
      throw new BusinessException(ErrorEnum.MOBILE_STORAGE_UNAVAILABLE)
    }
  }

  async getStream(objectPath: string): Promise<Readable> {
    try {
      return await this.client.getObject(this.config.bucket, objectPath)
    }
    catch (error) {
      console.warn(`[minio] 读取失败 ${objectPath}: ${error?.message}`)
      throw new BusinessException(ErrorEnum.MOBILE_STORAGE_UNAVAILABLE)
    }
  }

  async remove(objectPath: string): Promise<void> {
    try {
      await this.client.removeObject(this.config.bucket, objectPath)
    }
    catch {
      // 删除失败不阻断业务，避免脏数据掩盖主流程错误
    }
  }
}
