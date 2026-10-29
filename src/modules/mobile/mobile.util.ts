import { NOT_DELETED } from './mobile.constant'

/** UUID v4 校验（客户端生成的记录/附件/事项主键） */
export const UUID_RE = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i

/** 时间转 ISO 字符串，空值返回空串，避免前端 Date.parse 失败 */
export function iso(value?: Date | string | null) {
  const time = value ? new Date(value as any).getTime() : Number.NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

/** DATE 列按北京时间归日，避免 UTC 午夜偏移 */
export function day(value?: Date | string | null) {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value.slice(0, 10)
  return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

/** 北京时间的 yyyyMMdd，用于生成记录编号 */
export function compactDay(value: Date = new Date()) {
  return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')
}

/** 软删除条件：未删除记录统一为哨兵时间 */
export const notDeleted = () => NOT_DELETED

/** 判断是否为未删除（TypeORM 返回 Date 对象） */
export function isAlive(value: Date | string | null | undefined) {
  return day(value) === NOT_DELETED.slice(0, 10)
}

/** MySQL 视图 / 原生查询返回的 DECIMAL、BIGINT 统一转数字 */
export function num(value: any): number | null {
  if (value === null || value === undefined || value === '')
    return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 分页参数归一化，pageSize 上限 100 与 nest-admin 其它接口保持一致 */
export function pagerOf(page?: number, pageSize?: number) {
  const current = Math.max(1, Number(page) || 1)
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10))
  return { page: current, pageSize: size, skip: (current - 1) * size }
}

/** 事项进度：已完成工序 / 应做工序 */
export function progressOf(done: number, total: number) {
  if (!total)
    return 0
  return Math.min(100, Math.round((done / total) * 100))
}
