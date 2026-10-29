import { ApiProperty } from '@nestjs/swagger'
import {
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

import { WF_UNIT_STATUS, WfUnitStatus } from '../mobile.constant'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class CreateUnitDto {
  @ApiProperty({ description: '事项ID（客户端UUID，离线新建时生成）' })
  @IsUUID('4', { message: '事项编号格式不正确' })
  id: string

  @ApiProperty({ description: '所属项目ID（与 scope 二选一）', required: false })
  @IsOptional()
  @IsInt({ message: '项目ID格式不正确' })
  projectId?: number

  @ApiProperty({ description: '项目通道（多项目部署时必填）', required: false })
  @IsOptional()
  @IsString()
  scope?: string

  @ApiProperty({ description: '事项类型，如 turbine 风机 / box 箱变' })
  @IsString()
  @Length(1, 32, { message: '事项类型不正确' })
  typeCode: string

  @ApiProperty({ description: '事项编号，如 T20' })
  @IsString()
  @Length(1, 32, { message: '编号需为1-32个字符' })
  code: string

  @ApiProperty({ description: '名称补充', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 120, { message: '名称最多120个字' })
  name?: string

  @ApiProperty({ description: '位置描述', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 160, { message: '位置最多160个字' })
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

  @ApiProperty({ description: '初始状态', enum: WF_UNIT_STATUS, required: false })
  @IsOptional()
  @IsIn(WF_UNIT_STATUS, { message: '事项状态不正确' })
  status?: WfUnitStatus

  @ApiProperty({ description: '计划/实际开工日期 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '开工日期格式不正确' })
  startDate?: string

  @ApiProperty({ description: '完工日期 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '完工日期格式不正确' })
  endDate?: string

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '备注最多500个字' })
  remark?: string
}

export class UpdateUnitDto {
  @ApiProperty({ description: '事项编号', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 32, { message: '编号需为1-32个字符' })
  code?: string

  @ApiProperty({ description: '名称补充', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 120, { message: '名称最多120个字' })
  name?: string

  @ApiProperty({ description: '位置描述', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 160, { message: '位置最多160个字' })
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

  @ApiProperty({ description: '状态', enum: WF_UNIT_STATUS, required: false })
  @IsOptional()
  @IsIn(WF_UNIT_STATUS, { message: '事项状态不正确' })
  status?: WfUnitStatus

  @ApiProperty({ description: '开工日期 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '开工日期格式不正确' })
  startDate?: string

  @ApiProperty({ description: '完工日期 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '完工日期格式不正确' })
  endDate?: string

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '备注最多500个字' })
  remark?: string
}

export class UnitQueryDto {
  @ApiProperty({ description: '所属项目ID（与 scope 二选一）', required: false })
  @IsOptional()
  @IsInt({ message: '项目ID格式不正确' })
  projectId?: number

  @ApiProperty({ description: '项目通道（多项目部署时必填）', required: false })
  @IsOptional()
  @IsString()
  scope?: string

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

  @ApiProperty({ description: '状态筛选', enum: WF_UNIT_STATUS, required: false })
  @IsOptional()
  @IsIn(WF_UNIT_STATUS, { message: '事项状态不正确' })
  status?: WfUnitStatus

  @ApiProperty({ description: '类型筛选，如 turbine', required: false })
  @IsOptional()
  @IsString()
  typeCode?: string

  @ApiProperty({ description: '编号/名称关键字', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 60, { message: '关键字最多60个字' })
  keyword?: string
}

export class UpdateStepDto {
  @ApiProperty({ description: '工序状态', enum: ['pending', 'doing', 'done', 'skipped'] })
  @IsIn(['pending', 'doing', 'done', 'skipped'], { message: '工序状态不正确' })
  status: 'pending' | 'doing' | 'done' | 'skipped'

  @ApiProperty({ description: '工序备注', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 255, { message: '备注最多255个字' })
  remark?: string
}
