import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { ReviewRecordDto } from '../dto/record.dto'
import { MobileLedgerService } from '../ledger.service'
import { Perm, permissions } from '../mobile.constant'
import { MobileRecordService } from '../record.service'

@ApiTags('Mobile - 台账与审核（管理员）')
@Perm(permissions.LEDGER)
@Controller('mobile/admin')
export class MobileAdminController {
  constructor(
    private ledgerService: MobileLedgerService,
    private recordService: MobileRecordService,
  ) {}

  @Get('ledger')
  @ApiOperation({ summary: '项目工作台账（每次拉取归档一份快照）' })
  async ledger(@AuthUser('uid') uid: number, @Query('scope') scope?: string) {
    return this.ledgerService.snapshot(uid, scope)
  }

  @Put('records/:id/review')
  @Perm(permissions.REVIEW)
  @ApiOperation({ summary: '审核施工记录：approve 通过 / reject 退回修改' })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewRecordDto,
    @AuthUser('uid') uid: number,
  ) {
    return this.recordService.review(uid, id, dto)
  }
}
