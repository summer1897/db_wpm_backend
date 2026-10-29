import { ApiProperty } from '@nestjs/swagger'
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator'

import { WF_MEMBER_ROLE, WfMemberRole } from '../mobile.constant'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class CreateProjectDto {
  @ApiProperty({ description: '项目编号，如 WN-2026' })
  @IsString()
  @Length(1, 32, { message: '项目编号需为1-32个字符' })
  code: string

  @ApiProperty({ description: '项目名称' })
  @IsString()
  @Length(1, 120, { message: '项目名称需为1-120个字' })
  name: string

  @ApiProperty({ description: '项目所在地', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 160, { message: '项目所在地最多160个字' })
  location?: string

  @ApiProperty({ description: '装机容量(MW)', required: false })
  @IsOptional()
  @IsNumber({}, { message: '装机容量格式不正确' })
  @Min(0, { message: '装机容量不能为负数' })
  capacityMw?: number

  @ApiProperty({ description: '计划开工 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '开工日期格式不正确' })
  startDate?: string

  @ApiProperty({ description: '计划完工 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '完工日期格式不正确' })
  endDate?: string

  @ApiProperty({ description: '接入方式', enum: ['desktop', 'manual', 'trial'], required: false })
  @IsOptional()
  @IsIn(['desktop', 'manual', 'trial'], { message: '接入方式不正确' })
  integration?: 'desktop' | 'manual' | 'trial'

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '备注最多500个字' })
  remark?: string
}

export class UpdateProjectDto {
  @ApiProperty({ description: '项目名称', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 120, { message: '项目名称需为1-120个字' })
  name?: string

  @ApiProperty({ description: '项目所在地', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 160, { message: '项目所在地最多160个字' })
  location?: string

  @ApiProperty({ description: '装机容量(MW)', required: false })
  @IsOptional()
  @IsNumber({}, { message: '装机容量格式不正确' })
  @Min(0, { message: '装机容量不能为负数' })
  capacityMw?: number

  @ApiProperty({ description: '计划开工 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '开工日期格式不正确' })
  startDate?: string

  @ApiProperty({ description: '计划完工 YYYY-MM-DD', required: false })
  @IsOptional()
  @Matches(DATE_RE, { message: '完工日期格式不正确' })
  endDate?: string

  @ApiProperty({ description: '项目状态', enum: ['active', 'paused', 'done'], required: false })
  @IsOptional()
  @IsIn(['active', 'paused', 'done'], { message: '项目状态不正确' })
  status?: 'active' | 'paused' | 'done'

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: '备注最多500个字' })
  remark?: string
}

export class ProjectMemberDto {
  @ApiProperty({ description: '成员用户ID' })
  @IsInt({ message: '用户ID格式不正确' })
  @Min(1, { message: '用户ID最小为1' })
  userId: number

  @ApiProperty({ description: '项目角色', enum: WF_MEMBER_ROLE })
  @IsIn(WF_MEMBER_ROLE, { message: '项目角色不正确' })
  role: WfMemberRole
}

export class ProjectQueryDto {
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

  @ApiProperty({ description: '状态筛选', enum: ['active', 'paused', 'done'], required: false })
  @IsOptional()
  @IsIn(['active', 'paused', 'done'], { message: '项目状态不正确' })
  status?: 'active' | 'paused' | 'done'

  @ApiProperty({ description: '编号/名称关键字', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 60, { message: '关键字最多60个字' })
  keyword?: string
}
