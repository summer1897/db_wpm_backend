import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserEntity } from '~/modules/user/user.entity'

import { MobileAdminController } from './controllers/admin.controller'
import { MobilePhotoController } from './controllers/photo.controller'
import { MobileRecordController } from './controllers/record.controller'
import { WfConstructionTypeEntity } from './entities/wf-construction-type.entity'
import { WfLedgerSnapshotEntity } from './entities/wf-ledger-snapshot.entity'
import { WfProjectEntity } from './entities/wf-project.entity'
import { WfRecordPhotoEntity } from './entities/wf-record-photo.entity'
import { WfRecordEntity } from './entities/wf-record.entity'
import { WfReviewLogEntity } from './entities/wf-review-log.entity'
import { WfUploadLogEntity } from './entities/wf-upload-log.entity'
import { MobileLedgerService } from './ledger.service'
import { MinioService } from './minio.service'
import { MobilePhotoService } from './photo.service'
import { MobileRecordService } from './record.service'

/**
 * 移动端（风电施工现场管理）统一模块：
 * 施工记录、照片（MinIO 存储）、项目台账与审核。
 * 表结构见 deploy/sql/wind_field_mobile.sql，账号体系复用 sys_user。
 */
const entities = [
  WfProjectEntity,
  WfConstructionTypeEntity,
  WfRecordEntity,
  WfRecordPhotoEntity,
  WfReviewLogEntity,
  WfUploadLogEntity,
  WfLedgerSnapshotEntity,
  UserEntity,
]

const services = [MinioService, MobileRecordService, MobilePhotoService, MobileLedgerService]

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [MobileRecordController, MobilePhotoController, MobileAdminController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class MobileModule {}
