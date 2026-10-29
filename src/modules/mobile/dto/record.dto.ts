import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator'

import { MOBILE_CONSTRUCTION_TYPES, MobileConstructionType } from '../mobile.constant'

export class SubmitRecordDto {
  @ApiProperty({ description: '记录ID（客户端UUID）' })
  @IsUUID('4', { message: '记录编号格式不正确' })
  id: string

  @ApiProperty({ description: '施工类型', enum: MOBILE_CONSTRUCTION_TYPES })
  @IsIn(MOBILE_CONSTRUCTION_TYPES, { message: '施工类型不存在' })
  type: MobileConstructionType

  @ApiProperty({ description: '施工日期 YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '施工日期格式不正确' })
  date: string

  @ApiProperty({ description: '施工地点' })
  @IsString()
  @Length(1, 120, { message: '施工地点需为1-120个字' })
  location: string

  @ApiProperty({ description: '施工说明' })
  @IsString()
  @Length(1, 2000, { message: '施工说明需为1-2000个字' })
  content: string

  @ApiProperty({ description: '已上传的照片ID列表', type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: '至少上传1张施工照片' })
  @ArrayMaxSize(10, { message: '最多上传10张施工照片' })
  @IsUUID('4', { each: true, message: '照片编号格式不正确' })
  photoIds: string[]

  @ApiProperty({ description: '项目通道（多项目部署时必填）', required: false })
  @IsOptional()
  @IsNotEmpty({ message: '项目通道不能为空' })
  scope?: string
}

export class ReviewRecordDto {
  @ApiProperty({ description: '审核动作', enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'], { message: '审核动作不正确' })
  action: 'approve' | 'reject'

  @ApiProperty({ description: '审核意见（退回时必填原因）', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '审核意见最多500字' })
  remark?: string
}
