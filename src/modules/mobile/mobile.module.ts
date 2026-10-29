import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserEntity } from '~/modules/user/user.entity'

import { MobileAttachmentService } from './attachment.service'
import { MobileAuditService } from './audit.service'
import { MobileAdminController } from './controllers/admin.controller'
import { MobileAttachmentController } from './controllers/attachment.controller'
import { MobileChannelController } from './controllers/channel.controller'
import { MobileDictController } from './controllers/dict.controller'
import { MobileEntryController } from './controllers/entry.controller'
import { MobileProjectController } from './controllers/project.controller'
import { MobileUnitController } from './controllers/unit.controller'
import { MobileDictService } from './dict.service'
import { WfAttachmentEntity } from './entities/wf-attachment.entity'
import { WfAuditLogEntity } from './entities/wf-audit-log.entity'
import { WfEntryTypeEntity } from './entities/wf-entry-type.entity'
import { WfEntryEntity } from './entities/wf-entry.entity'
import { WfLedgerSnapshotEntity } from './entities/wf-ledger-snapshot.entity'
import { WfProjectMemberEntity } from './entities/wf-project-member.entity'
import { WfProjectEntity } from './entities/wf-project.entity'
import { WfReviewLogEntity } from './entities/wf-review-log.entity'
import { WfStepEntity } from './entities/wf-step.entity'
import { WfUnitStepEntity } from './entities/wf-unit-step.entity'
import { WfUnitTypeEntity } from './entities/wf-unit-type.entity'
import { WfUnitEntity } from './entities/wf-unit.entity'
import { WfUploadLogEntity } from './entities/wf-upload-log.entity'
import { MobileEntryService } from './entry.service'
import { MobileLedgerService } from './ledger.service'
import { MinioService } from './minio.service'
import { MobileProjectService } from './project.service'
import { MobileUnitService } from './unit.service'

/**
 * 移动端（风电施工现场管理）统一模块，数据模型见 deploy/sql/wind_field_v2.sql：
 *
 *   项目 wf_project
 *     └ 事项/风机 wf_unit ── 工序实例 wf_unit_step（按 wf_step 模板生成）
 *          └ 施工记录 wf_entry ── 附件 wf_attachment（MinIO）
 *
 * 另含字典（wf_unit_type / wf_entry_type / wf_step）、留痕（wf_review_log /
 * wf_upload_log / wf_audit_log）与台账快照（wf_ledger_snapshot）。
 * 账号体系复用 sys_user，照片/文档统一存 MinIO。
 */
const entities = [
  WfProjectEntity,
  WfProjectMemberEntity,
  WfUnitTypeEntity,
  WfEntryTypeEntity,
  WfStepEntity,
  WfUnitEntity,
  WfUnitStepEntity,
  WfEntryEntity,
  WfAttachmentEntity,
  WfReviewLogEntity,
  WfUploadLogEntity,
  WfAuditLogEntity,
  WfLedgerSnapshotEntity,
  UserEntity,
]

const services = [
  MinioService,
  MobileProjectService,
  MobileUnitService,
  MobileEntryService,
  MobileAttachmentService,
  MobileDictService,
  MobileAuditService,
  MobileLedgerService,
]

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [
    MobileProjectController,
    MobileUnitController,
    MobileEntryController,
    MobileAttachmentController,
    MobileDictController,
    MobileChannelController,
    MobileAdminController,
  ],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class MobileModule {}
