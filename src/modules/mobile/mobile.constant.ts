import { definePermission, Perm } from '~/modules/auth/decorators/permission.decorator'

/** 与 deploy/sql/wind_field_mobile.sql 的 wf_construction_type 种子保持一致 */
export const MOBILE_CONSTRUCTION_TYPES = [
  'foundation',
  'road',
  'lifting',
  'collector',
  'substation',
  'transport',
  'other',
] as const

export type MobileConstructionType = (typeof MOBILE_CONSTRUCTION_TYPES)[number]

/** 审核状态 -> 移动端展示文案（与移动端 ledger.ts 的 reviewGroups 一致） */
export const REVIEW_STATUS_NAMES = {
  pending: '待审核',
  approved: '已审核',
  rejected: '退回修改',
} as const

/** 单张照片上限，与移动端 MAX_BYTES 保持一致 */
export const MOBILE_MAX_PHOTO_BYTES = 20 * 1024 * 1024

/** 移动端接口权限：管理员默认全通过，工作人员需在角色中显式授权 */
export const permissions = definePermission('mobile', {
  LEDGER: 'ledger',
  REVIEW: 'review',
} as const)

export { Perm }
