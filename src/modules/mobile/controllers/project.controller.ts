import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import {
  CreateProjectDto,
  ProjectMemberDto,
  ProjectQueryDto,
  UpdateProjectDto,
} from '../dto/project.dto'
import { Perm, permissions } from '../mobile.constant'
import { MobileProjectService } from '../project.service'

@ApiTags('Mobile - 项目')
@Controller('mobile/projects')
export class MobileProjectController {
  constructor(private projectService: MobileProjectService) {}

  @Get()
  @ApiOperation({ summary: '我参与的项目（管理员返回全部）' })
  async mine(@AuthUser() user: IAuthUser) {
    return this.projectService.listMine(user)
  }

  @Get('all')
  @Perm(permissions.PROJECT)
  @ApiOperation({ summary: '项目列表（分页，管理端用）' })
  async all(@Query() query: ProjectQueryDto) {
    return this.projectService.listAll(query)
  }

  @Post()
  @Perm(permissions.PROJECT)
  @ApiOperation({ summary: '新建项目（自动生成移动端接入通道）' })
  async create(@Body() dto: CreateProjectDto, @AuthUser() user: IAuthUser) {
    return this.projectService.create(dto, user)
  }

  @Get(':id')
  @ApiOperation({ summary: '项目详情' })
  async detail(@Param('id', ParseIntPipe) id: number, @AuthUser() user: IAuthUser) {
    const project = await this.projectService.findById(id)
    await this.projectService.assertAccess(id, user)
    return this.projectService.toClient(project, await this.projectService.roleOf(id, user))
  }

  @Put(':id')
  @ApiOperation({ summary: '修改项目（负责人或管理员）' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @AuthUser() user: IAuthUser,
  ) {
    return this.projectService.update(id, dto, user)
  }

  @Get(':id/members')
  @ApiOperation({ summary: '项目成员与角色' })
  async members(@Param('id', ParseIntPipe) id: number, @AuthUser() user: IAuthUser) {
    return this.projectService.listMembers(id, user)
  }

  @Post(':id/members')
  @ApiOperation({ summary: '设置成员角色（负责人或管理员）' })
  async upsertMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProjectMemberDto,
    @AuthUser() user: IAuthUser,
  ) {
    return this.projectService.upsertMember(id, dto, user)
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: '移出成员（负责人不可移出）' })
  async removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @AuthUser() user: IAuthUser,
  ) {
    return this.projectService.removeMember(id, userId, user)
  }
}
