import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { MobileDictService } from '../dict.service'

@ApiTags('Mobile - 字典')
@Controller('mobile/dict')
export class MobileDictController {
  constructor(private dictService: MobileDictService) {}

  @Get()
  @ApiOperation({ summary: '全量字典（事项类型 + 施工内容类型 + 工序模板 + 枚举）' })
  async bootstrap() {
    return this.dictService.bootstrap()
  }

  @Get('unit-types')
  @ApiOperation({ summary: '事项类型：风机/箱变/集电线路…' })
  async unitTypes() {
    return this.dictService.unitTypes()
  }

  @Get('entry-types')
  @ApiOperation({ summary: '施工内容类型：基础/运输/组装/吊装/电装/调试' })
  async entryTypes() {
    return this.dictService.entryTypes()
  }

  @Get('steps')
  @ApiOperation({ summary: '标准工序模板（可按事项类型过滤）' })
  async steps(@Query('typeCode') typeCode?: string) {
    return this.dictService.steps(typeCode)
  }
}
