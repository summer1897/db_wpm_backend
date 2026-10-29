import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator'

export class AuditQueryDto {
  @ApiProperty({ description: '对象类型', enum: ['project', 'unit', 'unit_step', 'entry', 'attachment'], required: false })
  @IsOptional()
  @IsIn(['project', 'unit', 'unit_step', 'entry', 'attachment'], { message: '对象类型不正确' })
  entity?: 'project' | 'unit' | 'unit_step' | 'entry' | 'attachment'

  @ApiProperty({ description: '对象ID', required: false })
  @IsOptional()
  @IsString()
  entityId?: string

  @ApiProperty({ description: '动作关键字', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 32, { message: '动作最多32个字符' })
  action?: string

  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @IsInt({ message: '页码格式不正确' })
  @Min(1, { message: '页码最小为1' })
  page?: number

  @ApiProperty({ description: '每页条数，最大100', required: false, default: 20 })
  @IsOptional()
  @IsInt({ message: '每页条数格式不正确' })
  @Min(1, { message: '每页条数最小为1' })
  @Max(100, { message: '每页条数最大为100' })
  pageSize?: number
}

export class LedgerQueryDto {
  @ApiProperty({ description: '项目通道（多项目部署时必填）', required: false })
  @IsOptional()
  @IsString()
  scope?: string

  @ApiProperty({ description: '审核状态筛选', enum: ['pending', 'approved', 'rejected'], required: false })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'], { message: '审核状态不正确' })
  reviewStatus?: 'pending' | 'approved' | 'rejected'

  @ApiProperty({ description: '事项类型筛选', required: false })
  @IsOptional()
  @IsString()
  typeCode?: string

  @ApiProperty({ description: '登记日期起 YYYY-MM-DD', required: false })
  @IsOptional()
  @IsString()
  dateFrom?: string

  @ApiProperty({ description: '登记日期止 YYYY-MM-DD', required: false })
  @IsOptional()
  @IsString()
  dateTo?: string
}
