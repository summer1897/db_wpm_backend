import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { EntryQueryDto } from '../dto/entry.dto'
import { CreateUnitDto, UnitQueryDto, UpdateStepDto, UpdateUnitDto } from '../dto/unit.dto'
import { MobileEntryService } from '../entry.service'
import { MobileProjectService } from '../project.service'
import { MobileUnitService } from '../unit.service'

@ApiTags('Mobile - 事项/风机')
@Controller('mobile/units')
export class MobileUnitController {
  constructor(
    private unitService: MobileUnitService,
    private projectService: MobileProjectService,
    private entryService: MobileEntryService,
  ) {}

  @Get()
  @ApiOperation({ summary: '事项列表（风机/箱变…，带工序与记录统计）' })
  async list(@Query() query: UnitQueryDto, @AuthUser() user: IAuthUser) {
    const projectId = query.projectId
      ? query.projectId
      : (await this.projectService.resolve(query.scope)).id
    return this.unitService.list(projectId, query, user)
  }

  @Post()
  @ApiOperation({ summary: '新建事项（自动套用该类型的标准工序模板）' })
  async create(@Body() dto: CreateUnitDto, @AuthUser() user: IAuthUser) {
    return this.unitService.create(dto, user)
  }

  @Get(':id')
  @ApiOperation({ summary: '事项详情（基本信息 + 工序进度 + 最近记录）' })
  async detail(@Param('id') id: string, @AuthUser() user: IAuthUser) {
    return this.unitService.detail(id, user)
  }

  @Put(':id')
  @ApiOperation({ summary: '修改事项' })
  async update(@Param('id') id: string, @Body() dto: UpdateUnitDto, @AuthUser() user: IAuthUser) {
    return this.unitService.update(id, dto, user)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除事项（软删除，记录与附件保留追溯）' })
  async remove(@Param('id') id: string, @AuthUser() user: IAuthUser) {
    return this.unitService.remove(id, user)
  }

  @Get(':id/steps')
  @ApiOperation({ summary: '事项工序清单' })
  async steps(@Param('id') id: string, @AuthUser() user: IAuthUser) {
    return this.unitService.steps(id, user)
  }

  @Put(':id/steps/:stepCode')
  @ApiOperation({ summary: '推进工序（完成/进行中/跳过，自动重算事项进度）' })
  async setStep(
    @Param('id') id: string,
    @Param('stepCode') stepCode: string,
    @Body() dto: UpdateStepDto,
    @AuthUser() user: IAuthUser,
  ) {
    return this.unitService.setStep(id, stepCode, dto, user)
  }

  @Get(':id/entries')
  @ApiOperation({ summary: '该事项下的施工记录' })
  async entries(
    @Param('id') id: string,
    @Query() query: EntryQueryDto,
    @AuthUser() user: IAuthUser,
  ) {
    return this.entryService.listByUnit(id, query, user)
  }
}
