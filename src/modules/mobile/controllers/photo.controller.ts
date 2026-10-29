import type { FastifyReply, FastifyRequest } from 'fastify'
import { BadRequestException, Controller, Get, Param, Post, Req, Res } from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AuthUser } from '~/modules/auth/decorators/auth-user.decorator'

import { MobilePhotoService } from '../photo.service'

@ApiTags('Mobile - 施工照片')
@Controller('mobile/photos')
export class MobilePhotoController {
  constructor(private photoService: MobilePhotoService) {}

  @Post()
  @ApiOperation({ summary: '上传施工照片（X-File-Meta 携带元数据，幂等）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async upload(@Req() req: FastifyRequest, @AuthUser() user: IAuthUser) {
    if (!req.isMultipart())
      throw new BadRequestException('Request is not multipart')

    const file = await req.file()
    return this.photoService.upload(
      user.uid,
      file,
      req.headers['x-file-meta'] as string | undefined,
      req.ip,
    )
  }

  @Get(':id')
  @ApiOperation({ summary: '读取施工照片（本人或管理员，台账浏览共用）' })
  async stream(
    @Param('id') id: string,
    @AuthUser() user: IAuthUser,
    @Res() reply: FastifyReply,
  ) {
    return this.photoService.stream(id, user, reply)
  }
}
