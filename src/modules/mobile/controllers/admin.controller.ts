import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { MobileAuditService } from '../audit.service'
import { AuditQueryDto, LedgerQueryDto } from '../dto/audit.dto'
import { MobileLedgerService } from '../ledger.service'
import { Perm, permissions } from '../mobile.constant'
import { MobileProjectService } from '../project.service'

@ApiTags('Mobile - 台账与审计')
@Controller('mobile/admin')
export class MobileAdminController {
  constructor(
    private ledgerService: MobileLedgerService,
    private auditService: MobileAuditService,
    private projectService: MobileProjectService,
  ) {}

  @Get('ledger')
  @ApiOperation({ summary: '工作台账（项目 → 事项 → 记录 → 附件，每次拉取归档一份快照）' })
  async ledger(@AuthUser() user: IAuthUser, @Query() query: LedgerQueryDto) {
    return this.ledgerService.snapshot(user.uid, query, user)
  }

  @Get('snapshots')
  @ApiOperation({ summary: '历史台账快照列表' })
  async snapshots(
    @AuthUser() user: IAuthUser,
    @Query('projectId') projectId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const id = projectId ? Number(projectId) : (await this.projectService.resolve()).id
    return this.ledgerService.snapshots(id, Number(page) || 1, Number(pageSize) || 10, user)
  }

  @Get('snapshots/:id')
  @ApiOperation({ summary: '快照明细' })
  async snapshotDetail(@Param('id', ParseIntPipe) id: number, @AuthUser() user: IAuthUser) {
    return this.ledgerService.snapshotDetail(id, user)
  }

  @Get('audit')
  @ApiOperation({ summary: '操作审计流水（谁在什么时候改了什么）' })
  async audit(
    @AuthUser() user: IAuthUser,
    @Query() query: AuditQueryDto,
    @Query('projectId') projectId?: string,
  ) {
    const id = projectId ? Number(projectId) : (await this.projectService.resolve()).id
    return this.auditService.list(id, query, user)
  }

  @Get('users')
  @Perm(permissions.PROJECT)
  @ApiOperation({ summary: '可选成员（启用账号，标记是否已加入项目，PC 端分配用）' })
  async users(
    @Query('keyword') keyword?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectService.listAssignable({
      keyword,
      projectId: projectId ? Number(projectId) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('overview')
  @Perm(permissions.LEDGER)
  @ApiOperation({ summary: '全部项目汇总（跨项目看板，管理员或已授权角色）' })
  async overview() {
    return this.ledgerService.projectSummaries()
  }
}
