import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator'

import { WF_RECORD_STATUS, WF_REVIEW_STATUS, WfRecordStatus, WfReviewStatus } from '../mobile.constant'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class SubmitEntryDto {
  @ApiProperty({ description: '记录ID（客户端UUID，保证断点续传幂等）' })
  @IsUUID('4', { message: '记录编号格式不正确' })
  id: string

  @ApiProperty({ description: '所属事项/风机ID' })
  @IsUUID('4', { message: '事项编号格式不正确' })
  unitId: string

  @ApiProperty({ description: '施工内容类型，如 hoist 吊装 / transit 运输' })
  @IsString()
  @Length(1, 32, { message: '施工内容类型不正确' })
  typeCode: string

  @ApiProperty({ description: '关联工序编码（完成该工序时填写）', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 32, { message: '工序编码不正确' })
  stepCode?: string

  @ApiProperty({ description: '事项名称，如 T20 风机吊装' })
  @IsString()
  @Length(1, 120, { message: '事项名称需为1-120个字' })
  title: string

  @ApiProperty({ description: '施工说明/备注', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 2000, { message: '施工说明最多2000个字' })
  content?: string

  @ApiProperty({ description: '施工日期 YYYY-MM-DD，默认取当天', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '施工日期格式不正确' })
  workDate?: string

  @ApiProperty({ description: '实际发生时间 ISO 字符串', required: false })
  @IsOptional()
  @IsString()
  occurredAt?: string

  @ApiProperty({ description: '施工地点', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 120, { message: '施工地点最多120个字' })
  location?: string

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

  @ApiProperty({ description: '天气快照', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 60, { message: '天气最多60个字' })
  weather?: string

  @ApiProperty({ description: '气温快照(℃)', required: false })
  @IsOptional()
  @IsInt({ message: '气温格式不正确' })
  @Min(-60, { message: '气温范围不合法' })
  @Max(80, { message: '气温范围不合法' })
  temperature?: number

  @ApiProperty({ description: '本批次已上传的附件ID列表', type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: '最多绑定20个附件' })
  @IsUUID('4', { each: true, message: '附件编号格式不正确' })
  attachmentIds?: string[]

  @ApiProperty({ description: '客户端创建时间 ISO 字符串', required: false })
  @IsOptional()
  @IsString()
  clientCreatedAt?: string
}

export class ReviewEntryDto {
  @ApiProperty({ description: '审核动作', enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'], { message: '审核动作不正确' })
  action: 'approve' | 'reject'

  @ApiProperty({ description: '审核意见（退回时必填原因）', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '审核意见最多500字' })
  remark?: string
}

export class EntryQueryDto {
  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @IsInt({ message: '页码格式不正确' })
  @Min(1, { message: '页码最小为1' })
  page?: number

  @ApiProperty({ description: '每页条数，最大100', required: false, default: 10 })
  @IsOptional()
  @IsInt({ message: '每页条数格式不正确' })
  @Min(1, { message: '每页条数最小为1' })
  @Max(100, { message: '每页条数最大为100' })
  pageSize?: number

  @ApiProperty({ description: '上传状态', enum: WF_RECORD_STATUS, required: false })
  @IsOptional()
  @IsIn(WF_RECORD_STATUS, { message: '记录状态不正确' })
  status?: WfRecordStatus

  @ApiProperty({ description: '审核状态', enum: WF_REVIEW_STATUS, required: false })
  @IsOptional()
  @IsIn(WF_REVIEW_STATUS, { message: '审核状态不正确' })
  reviewStatus?: WfReviewStatus

  @ApiProperty({ description: '施工内容类型', required: false })
  @IsOptional()
  @IsString()
  typeCode?: string

  @ApiProperty({ description: '事项ID', required: false })
  @IsOptional()
  @IsUUID('4', { message: '事项编号格式不正确' })
  unitId?: string

  @ApiProperty({ description: '关键字（名称/说明）', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 60, { message: '关键字最多60个字' })
  keyword?: string

  @ApiProperty({ description: '增量同步起点：只取该时间之后更新的记录', required: false })
  @IsOptional()
  @IsString()
  updatedAfter?: string

  @ApiProperty({ description: '增量同步条数上限，最大500', required: false, default: 200 })
  @IsOptional()
  @IsInt({ message: '同步条数格式不正确' })
  @Min(1, { message: '同步条数最小为1' })
  @Max(500, { message: '同步条数最大为500' })
  limit?: number
}
