import { definePermission, Perm } from '~/modules/auth/decorators/permission.decorator'

/** 附件体积上限：移动端照片 20M，文档 50M */
export const MOBILE_MAX_PHOTO_BYTES = 20 * 1024 * 1024
export const MOBILE_MAX_DOC_BYTES = 50 * 1024 * 1024

/** 事项（风机）状态 */
export const WF_UNIT_STATUS = ['planning', 'building', 'paused', 'done', 'canceled'] as const
export type WfUnitStatus = (typeof WF_UNIT_STATUS)[number]

/** 记录上传状态机 */
export const WF_RECORD_STATUS = ['draft', 'queued', 'uploading', 'failed', 'submitted'] as const
export type WfRecordStatus = (typeof WF_RECORD_STATUS)[number]

/** 审核三态 */
export const WF_REVIEW_STATUS = ['pending', 'approved', 'rejected'] as const
export type WfReviewStatus = (typeof WF_REVIEW_STATUS)[number]

/** 工序状态 */
export const WF_STEP_STATUS = ['pending', 'doing', 'done', 'skipped'] as const
export type WfStepStatus = (typeof WF_STEP_STATUS)[number]

/** 附件类型 */
export const WF_ATTACHMENT_KIND = ['photo', 'doc', 'audio'] as const
export type WfAttachmentKind = (typeof WF_ATTACHMENT_KIND)[number]

/** 项目成员角色 */
export const WF_MEMBER_ROLE = ['owner', 'manager', 'recorder', 'viewer'] as const
export type WfMemberRole = (typeof WF_MEMBER_ROLE)[number]

/** 审核状态 -> 展示文案 */
export const REVIEW_STATUS_NAMES: Record<WfReviewStatus, string> = {
  pending: '待审核',
  approved: '已审核',
  rejected: '退回修改',
}

export const UNIT_STATUS_NAMES: Record<WfUnitStatus, string> = {
  planning: '待施工',
  building: '施工中',
  paused: '已暂停',
  done: '已完成',
  canceled: '已取消',
}

export const STEP_STATUS_NAMES: Record<WfStepStatus, string> = {
  pending: '待施工',
  doing: '进行中',
  done: '已完成',
  skipped: '已跳过',
}

/** 软删除哨兵：未删除统一为该值，保证 (project_id, code, deleted_at) 唯一键有效 */
export const NOT_DELETED = '1970-01-01 00:00:00'

/** MySQL DECIMAL 以字符串返回，统一转 number 供前端直接使用 */
export const decimalTransformer = {
  to: (value?: number | null) => (value === undefined ? null : value),
  from: (value?: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
}

/** 移动端接口权限：管理员默认全通过，工作人员需在角色中显式授权 */
export const permissions = definePermission('mobile', {
  LEDGER: 'ledger',
  REVIEW: 'review',
  PROJECT: 'project',
} as const)

export { Perm }
