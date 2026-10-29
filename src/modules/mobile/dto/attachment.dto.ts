import { ApiProperty } from '@nestjs/swagger'
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator'

import { WF_ATTACHMENT_KIND, WfAttachmentKind } from '../mobile.constant'

export class AttachmentQueryDto {
  @ApiProperty({ description: '事项ID', required: false })
  @IsOptional()
  @IsUUID('4', { message: '事项编号格式不正确' })
  unitId?: string

  @ApiProperty({ description: '施工记录ID', required: false })
  @IsOptional()
  @IsUUID('4', { message: '记录编号格式不正确' })
  entryId?: string

  @ApiProperty({ description: '附件类型', enum: WF_ATTACHMENT_KIND, required: false })
  @IsOptional()
  @IsIn(WF_ATTACHMENT_KIND, { message: '附件类型不正确' })
  kind?: WfAttachmentKind
}

export class AttachToUnitDto {
  @ApiProperty({ description: '事项ID' })
  @IsUUID('4', { message: '事项编号格式不正确' })
  unitId: string
}

/** 上传时通过 X-File-Meta 头传递，这里仅用于 Swagger 说明 */
export class AttachmentMetaDto {
  @ApiProperty({ description: '附件ID（客户端UUID）' })
  @IsUUID('4', { message: '附件编号格式不正确' })
  id: string

  @ApiProperty({ description: '所属事项ID', required: false })
  @IsOptional()
  @IsUUID('4', { message: '事项编号格式不正确' })
  unitId?: string

  @ApiProperty({ description: '附件类型', enum: WF_ATTACHMENT_KIND, required: false })
  @IsOptional()
  @IsIn(WF_ATTACHMENT_KIND, { message: '附件类型不正确' })
  kind?: WfAttachmentKind

  @ApiProperty({ description: '原始文件名', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 160, { message: '文件名最多160个字符' })
  name?: string

  @ApiProperty({ description: '拍摄/文件时间 ISO 字符串', required: false })
  @IsOptional()
  @IsString()
  takenAt?: string

  @ApiProperty({ description: '经度', required: false })
  @IsOptional()
  @IsNumber({}, { message: '经度格式不正确' })
  @Min(-180, { message: '经度范围不合法' })
  @Max(180, { message: '经度范围不合法' })
  longitude?: number

  @ApiProperty({ description: '纬度', required: false })
  @IsOptional()
  @IsNumber({}, { message: '纬度格式不正确' })
  @Min(-90, { message: '纬度范围不合法' })
  @Max(90, { message: '纬度范围不合法' })
  latitude?: number

  @ApiProperty({ description: '展示顺序', required: false })
  @IsOptional()
  @IsInt({ message: '顺序格式不正确' })
  sort?: number
}
