import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { Ip } from '~/common/decorators/http.decorator'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { SubmitRecordDto } from '../dto/record.dto'
import { MobileRecordService } from '../record.service'

@ApiTags('Mobile - 施工记录')
@Controller('mobile/reports')
export class MobileRecordController {
  constructor(private recordService: MobileRecordService) {}

  @Post()
  @ApiOperation({ summary: '提交施工记录（幂等，重复提交返回原回执）' })
  async submit(
    @Body() dto: SubmitRecordDto,
    @AuthUser('uid') uid: number,
    @Ip() ip: string,
  ) {
    return this.recordService.submit(uid, dto, ip)
  }

  @Get()
  @ApiOperation({ summary: '获取本人已提交记录（移动端同步用）' })
  async listMine(@AuthUser('uid') uid: number, @Query('scope') scope?: string) {
    return this.recordService.listMine(uid, scope)
  }
}
