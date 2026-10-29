import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { Ip } from '~/common/decorators/http.decorator'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { EntryQueryDto, ReviewEntryDto, SubmitEntryDto } from '../dto/entry.dto'
import { MobileEntryService } from '../entry.service'

@ApiTags('Mobile - 施工记录')
@Controller('mobile/entries')
export class MobileEntryController {
  constructor(private entryService: MobileEntryService) {}

  @Post()
  @ApiOperation({ summary: '提交施工记录（幂等，重复提交返回原回执）' })
  async submit(@Body() dto: SubmitEntryDto, @AuthUser() user: IAuthUser, @Ip() ip: string) {
    return this.entryService.submit(user, dto, ip)
  }

  @Get('mine')
  @ApiOperation({ summary: '本人记录（移动端增量同步，带服务器时间）' })
  async mine(@AuthUser('uid') uid: number, @Query() query: EntryQueryDto) {
    return this.entryService.listMine(uid, query)
  }

  @Get('pending')
  @ApiOperation({ summary: '待审核记录（项目负责人或管理员）' })
  async pending(
    @AuthUser() user: IAuthUser,
    @Query() query: EntryQueryDto,
    @Query('scope') scope?: string,
  ) {
    return this.entryService.pending(user, { ...query, scope })
  }

  @Get()
  @ApiOperation({ summary: '按事项查询记录（unitId 必填）' })
  async listByUnit(@Query() query: EntryQueryDto, @AuthUser() user: IAuthUser) {
    if (!query.unitId)
      throw new BadRequestException('请指定事项ID（unitId）')
    return this.entryService.listByUnit(query.unitId, query, user)
  }

  @Get(':id')
  @ApiOperation({ summary: '记录详情（含附件与审核流水）' })
  async detail(@Param('id') id: string, @AuthUser() user: IAuthUser) {
    return this.entryService.detail(id, user)
  }

  @Put(':id/review')
  @ApiOperation({ summary: '审核记录：approve 通过 / reject 退回修改（项目负责人或管理员）' })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewEntryDto,
    @AuthUser() user: IAuthUser,
  ) {
    return this.entryService.review(user, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除记录（仅限本人未提交的记录）' })
  async remove(@Param('id') id: string, @AuthUser() user: IAuthUser) {
    return this.entryService.remove(id, user)
  }
}
