import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { MobileLedgerService } from '../ledger.service'
import { MobileProjectService } from '../project.service'

/**
 * 项目通道与首页看板：
 * 移动端本机地址只决定「连到哪台服务器」，项目归属以服务端下发的通道为准，
 * 登录后一次对齐即可，现场人员无需关心多项目概念。
 */
@ApiTags('Mobile - 通道与看板')
@Controller('mobile')
export class MobileChannelController {
  constructor(
    private projectService: MobileProjectService,
    private ledgerService: MobileLedgerService,
  ) {}

  @Get('channel')
  @ApiOperation({ summary: '获取当前项目通道（登录用户可用，多项目部署时报 1505）' })
  async channel(@Query('scope') scope?: string) {
    return this.projectService.channel(scope)
  }

  @Get('dashboard')
  @ApiOperation({ summary: '首页看板：项目进度、事项状态分布、待审核数与最近记录' })
  async dashboard(@AuthUser() user: IAuthUser, @Query('scope') scope?: string) {
    return this.ledgerService.dashboard(scope, user)
  }
}
