import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'

import { Ip } from '~/common/decorators/http.decorator'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { MobileAttachmentService } from '../attachment.service'
import { AttachmentQueryDto, AttachToUnitDto } from '../dto/attachment.dto'
import { MobileProjectService } from '../project.service'

@ApiTags('Mobile - 附件（照片/文档）')
@Controller('mobile/attachments')
export class MobileAttachmentController {
  constructor(
    private attachmentService: MobileAttachmentService,
    private projectService: MobileProjectService,
  ) {}

  @Post()
  @ApiOperation({ summary: '上传附件（X-File-Meta 携带元数据，幂等 + 同内容秒传）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async upload(@Req() req: FastifyRequest, @AuthUser() user: IAuthUser, @Ip() ip: string) {
    if (!req.isMultipart())
      throw new BadRequestException('Request is not multipart')

    const file = await req.file()
    return this.attachmentService.upload(user, file, req.headers['x-file-meta'] as string, ip)
  }

  @Get()
  @ApiOperation({ summary: '附件列表（按事项或记录筛选）' })
  async list(
    @Query() query: AttachmentQueryDto,
    @AuthUser() user: IAuthUser,
    @Query('projectId') projectId?: string,
  ) {
    const id = projectId ? Number(projectId) : (await this.projectService.resolve()).id
    return this.attachmentService.list(id, query, user)
  }

  @Get(':id')
  @ApiOperation({ summary: '读取附件（项目成员可读，台账浏览共用）' })
  async stream(
    @Param('id') id: string,
    @AuthUser() user: IAuthUser,
    @Res() reply: FastifyReply,
  ) {
    return this.attachmentService.stream(id, user, reply)
  }

  @Put(':id/unit')
  @ApiOperation({ summary: '把先传的附件挂到具体事项' })
  async attachToUnit(
    @Param('id') id: string,
    @Body() dto: AttachToUnitDto,
    @AuthUser() user: IAuthUser,
  ) {
    return this.attachmentService.attachToUnit(id, dto.unitId, user)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除附件（已归档到已提交记录的不可删）' })
  async remove(@Param('id') id: string, @AuthUser() user: IAuthUser) {
    return this.attachmentService.remove(id, user)
  }
}
