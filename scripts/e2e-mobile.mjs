import { randomUUID } from 'node:crypto'
/**
 * 移动端 ↔ nest-admin V2 全链路联调脚本
 *
 * 数据模型：项目 → 事项/风机 → 施工记录 → 附件（见 deploy/sql/wind_field_v2.sql）
 *
 * 覆盖：验证码 → 登录 → 本人信息 → 字典 → 通道 → 项目 → 看板 →
 *       新建事项(套工序模板) → 编号唯一 → 上传附件(MinIO/幂等/秒传) →
 *       提交记录(幂等) → 工序推进(进度重算) → 事项记录 → 本人记录 → 待审核 →
 *       审核(退回需原因/退回/通过) → 记录详情 → 台账(落快照) → 快照列表 →
 *       审计流水 → 项目汇总 → 附件下载 → 附件保护 → 越权拦截
 *
 * 用法：
 *   node scripts/e2e-mobile.mjs
 *   MOBILE_E2E_BASE=http://127.0.0.1:7001/api node scripts/e2e-mobile.mjs
 *   MOBILE_E2E_USER=xxx MOBILE_E2E_PASS=yyy node scripts/e2e-mobile.mjs
 *
 * 说明：验证码明文存放在 Redis（captcha:img:<id>），脚本直接读取以便自动化。
 */
import fs from 'node:fs'
import path from 'node:path'
import IORedis from 'ioredis'

const ROOT = path.resolve(import.meta.dirname, '..')

function loadEnv(file) {
  if (!fs.existsSync(file))
    return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#'))
      continue
    const i = line.indexOf('=')
    if (i < 0)
      continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnv(path.join(ROOT, '.env'))
loadEnv(path.join(ROOT, '.env.development'))

const BASE = (process.env.MOBILE_E2E_BASE || 'http://127.0.0.1:7001/api').replace(/\/+$/, '')
const USERNAME = process.env.MOBILE_E2E_USER || 'admin'
const PASSWORD = process.env.MOBILE_E2E_PASS || 'a123456'

const uuid = () => randomUUID()
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

let token = ''
let pass = 0
let fail = 0

function step(no, title) {
  console.log(`\n${'─'.repeat(74)}\n${no}. ${title}\n${'─'.repeat(74)}`)
}

function ok(label, extra) {
  pass++
  console.log(`  ✅ ${label}${extra ? `  ${extra}` : ''}`)
}

function bad(label, extra) {
  fail++
  console.log(`  ❌ ${label}${extra ? `  ${extra}` : ''}`)
}

function check(cond, label, extra) {
  cond ? ok(label, extra) : bad(label, extra)
  return cond
}

async function call(pathname, init = {}) {
  const headers = { ...(init.headers || {}) }
  if (token)
    headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers })
  const type = res.headers.get('content-type') || ''
  if (type.includes('application/json')) {
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body, data: body?.data }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return { status: res.status, buffer: buf, type }
}

function json(pathname, method, payload) {
  return call(pathname, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function upload(meta, buffer, name = 'demo.png', mime = 'image/png') {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), name)
  return call('/mobile/attachments', {
    method: 'POST',
    headers: { 'X-File-Meta': encodeURIComponent(JSON.stringify(meta)) },
    body: form,
  })
}

// 1×1 PNG；尾部拼一个随机串，保证每次运行内容不同，首次上传不会命中上一次的秒传
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const RUN_BYTES = Buffer.concat([PNG, Buffer.from(`#run-${uuid()}`)])

async function main() {
  console.log(`联调目标：${BASE}`)
  console.log(`联调账号：${USERNAME}`)

  // ── 1. 验证码 ────────────────────────────────────────────────────────────
  step(1, '获取图形验证码')
  const cap = await call('/auth/captcha/img?width=100&height=50')
  const capData = cap.data || {}
  if (!check(
    !!capData.id && String(capData.img || '').startsWith('data:image/svg+xml;base64,'),
    'GET /auth/captcha/img 返回 id 与 svg data URI',
    `id=${capData.id}`,
  )) {
    return finish()
  }

  const redis = new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    lazyConnect: false,
  })
  const capCode = await redis.get(`captcha:img:${capData.id}`)
  redis.disconnect()
  if (!check(!!capCode, 'Redis 中存在验证码明文', `code=${capCode}`))
    return finish()

  // ── 2. 登录 ──────────────────────────────────────────────────────────────
  step(2, '账号密码 + 验证码登录')
  const login = await json('/auth/login', 'POST', {
    username: USERNAME,
    password: PASSWORD,
    captchaId: capData.id,
    verifyCode: capCode,
  })
  token = login.data?.token || ''
  if (!check(!!token, 'POST /auth/login 拿到 token', `http=${login.status} code=${login.body?.code}`))
    return finish()

  // ── 3. 本人信息 ──────────────────────────────────────────────────────────
  step(3, '读取当前登录人信息')
  const profile = await call('/account/profile')
  const me = profile.data || {}
  check(!!me.username, 'GET /account/profile 返回用户', `username=${me.username} uid=${me.uid}`)

  // ── 4. 字典 ──────────────────────────────────────────────────────────────
  step(4, '拉取字典（事项类型 / 施工内容类型 / 工序模板）')
  const dict = await call('/mobile/dict')
  const dictData = dict.data || {}
  const unitTypes = dictData.unitTypes || []
  const entryTypes = dictData.entryTypes || []
  const steps = dictData.steps || []
  check(unitTypes.length >= 5, '事项类型字典非空', `unitTypes=${unitTypes.length} 例=${unitTypes[0]?.code}`)
  check(entryTypes.length >= 5, '施工内容类型字典非空', `entryTypes=${entryTypes.length} 例=${entryTypes[0]?.code}`)
  const turbineSteps = steps.filter(item => item.typeCode === 'turbine')
  check(turbineSteps.length === 10, '风机工序模板 = 10 道', `steps=${turbineSteps.length}`)

  // ── 5. 通道与项目 ────────────────────────────────────────────────────────
  step(5, '项目通道 / 我参与的项目')
  const channel = await call('/mobile/channel')
  const channelData = channel.data || {}
  check(typeof channelData.scope === 'string' && channelData.scope.length === 64, 'GET /mobile/channel 返回 64 位 scope', `scope=${String(channelData.scope).slice(0, 12)}… name=${channelData.name}`)

  const projects = await call('/mobile/projects')
  const projectList = projects.data || []
  check(Array.isArray(projectList) && projectList.length >= 1, 'GET /mobile/projects 返回项目与我的角色', `projects=${projectList.length} role=${projectList[0]?.role}`)
  const project = projectList[0] || {}
  check(project.scope === channelData.scope, '项目通道与通道接口一致')

  // ── 6. 看板 ──────────────────────────────────────────────────────────────
  step(6, '首页看板')
  const dash = await call('/mobile/dashboard')
  const dashData = dash.data || {}
  check(!!dashData.project && Array.isArray(dashData.unitStatus), 'GET /mobile/dashboard 返回项目与事项状态分布', `unitTotal=${dashData.unitTotal} pendingReview=${dashData.pendingReview}`)

  // ── 7. 新建事项（风机） ──────────────────────────────────────────────────
  step(7, '新建事项：T20 风机（自动套用 10 道工序模板）')
  const unitId = uuid()
  const unitCode = `T${Math.floor(Math.random() * 900 + 100)}`
  const createUnit = await json('/mobile/units', 'POST', {
    id: unitId,
    scope: channelData.scope,
    typeCode: 'turbine',
    code: unitCode,
    name: '威宁风电场 3 号机位',
    location: '贵州省毕节市威宁县 · 3 号机位',
    longitude: 104.28,
    latitude: 26.87,
    remark: '联调脚本创建',
  })
  const unitData = createUnit.data || {}
  if (!check(createUnit.body?.code === 200 && unitData.id === unitId, 'POST /mobile/units 创建事项成功', `http=${createUnit.status} code=${unitData.code} stepsCreated=${unitData.stepsCreated}`)) {
    return finish()
  }
  check(unitData.stepsCreated === 10, '创建时按模板生成 10 道工序实例', `stepsCreated=${unitData.stepsCreated}`)

  // ── 8. 编号唯一 ──────────────────────────────────────────────────────────
  step(8, '同一项目下编号重复校验')
  const dup = await json('/mobile/units', 'POST', {
    id: uuid(),
    scope: channelData.scope,
    typeCode: 'turbine',
    code: unitCode,
  })
  check(String(dup.body?.code) === '1512', '重复编号被拒绝（1512）', `code=${dup.body?.code}`)

  // ── 9. 事项详情 ──────────────────────────────────────────────────────────
  step(9, '事项详情（工序清单 + 统计）')
  const detail = await call(`/mobile/units/${unitId}`)
  const detailData = detail.data || {}
  check(detailData.unit?.id === unitId && detailData.steps?.length === 10, 'GET /mobile/units/:id 返回事项与 10 道工序', `status=${detailData.unit?.statusName} progress=${detailData.unit?.progress}`)
  check(detailData.unit?.status === 'planning', '新建事项初始状态为「待施工」')

  // ── 10. 上传附件 ─────────────────────────────────────────────────────────
  step(10, '上传附件到事项（MinIO）')
  const attachId = uuid()
  const meta = {
    id: attachId,
    unitId,
    kind: 'photo',
    name: 'rebar.png',
    takenAt: new Date().toISOString(),
    longitude: 104.28,
    latitude: 26.87,
  }
  const up = await upload(meta, RUN_BYTES)
  const upData = up.data || {}
  if (!check(up.body?.code === 200 && upData.id === attachId, 'POST /mobile/attachments 上传成功', `http=${up.status} sha256=${String(upData.sha256).slice(0, 10)}…`)) {
    console.log('     ↑ 若返回 1506，请确认 MinIO 已启动（127.0.0.1:9000）')
  }
  check(upData.reused === false, '首次上传未命中秒传')

  // ── 11. 上传幂等 & 秒传 ──────────────────────────────────────────────────
  step(11, '重复上传（幂等）与同内容秒传')
  const up2 = await upload(meta, RUN_BYTES)
  check(up2.data?.id === attachId && up2.data?.reused === true, '同一附件ID重复上传返回原回执', `reused=${up2.data?.reused}`)

  const attachId2 = uuid()
  const up3 = await upload({ ...meta, id: attachId2 }, RUN_BYTES)
  check(up3.data?.id === attachId2 && up3.data?.reused === true, '不同ID相同内容命中秒传，不重复占用存储', `reused=${up3.data?.reused} size=${up3.data?.size}`)

  // ── 12. 提交记录 ─────────────────────────────────────────────────────────
  step(12, '提交施工记录（挂工序 + 绑定附件）')
  const entryId = uuid()
  const entryPayload = {
    id: entryId,
    unitId,
    typeCode: 'foundation',
    stepCode: 'foundation_rebar',
    title: `${unitCode} 风机基础钢筋绑扎完成`,
    content: '钢筋间距符合设计，保护层 50mm，模板加固到位，计划次日浇筑。',
    workDate: today,
    occurredAt: new Date().toISOString(),
    location: '3 号机位',
    weather: '晴',
    temperature: 18,
    attachmentIds: [attachId],
  }
  const sub = await json('/mobile/entries', 'POST', entryPayload)
  const subData = sub.data || {}
  if (!check(sub.body?.code === 200 && subData.id === entryId, 'POST /mobile/entries 提交成功', `http=${sub.status} code=${subData.code} review=${subData.reviewStatus}`)) {
    return finish()
  }

  // ── 13. 提交幂等 ─────────────────────────────────────────────────────────
  step(13, '重复提交同一条记录（幂等）')
  const sub2 = await json('/mobile/entries', 'POST', entryPayload)
  check(sub2.data?.id === entryId && sub2.data?.code === subData.code, '重复提交返回原回执，不新增记录', `code=${sub2.data?.code}`)

  // ── 14. 工序推进 ─────────────────────────────────────────────────────────
  step(14, '推进工序（完成后重算事项进度）')
  const setStep = await json(`/mobile/units/${unitId}/steps/foundation_rebar`, 'PUT', {
    status: 'done',
    remark: '钢筋绑扎验收通过',
  })
  const stepList = setStep.data || []
  const stepDone = stepList.find(item => item.stepCode === 'foundation_rebar')
  check(stepDone?.status === 'done' && !!stepDone.doneAt, '工序标记完成并留完成时间', `doneAt=${String(stepDone?.doneAt).slice(0, 19)}`)

  const detail2 = await call(`/mobile/units/${unitId}`)
  const unitAfter = detail2.data?.unit || {}
  check(unitAfter.status === 'building' && unitAfter.progress === 10, '事项自动转「施工中」，进度 10%（1/10）', `status=${unitAfter.statusName} progress=${unitAfter.progress}%`)

  // ── 15. 事项记录 / 本人记录 ──────────────────────────────────────────────
  step(15, '事项记录与本人记录')
  const unitEntries = await call(`/mobile/units/${unitId}/entries`)
  check(unitEntries.data?.total === 1 && unitEntries.data?.items?.[0]?.id === entryId, 'GET /mobile/units/:id/entries 命中记录', `total=${unitEntries.data?.total} attachments=${unitEntries.data?.items?.[0]?.attachments?.length}`)

  const mine = await call('/mobile/entries/mine')
  const mineFound = (mine.data?.entries || []).find(item => item.id === entryId)
  check(!!mineFound && mineFound.attachments?.length === 1, 'GET /mobile/entries/mine 命中并携带附件', `entries=${mine.data?.entries?.length} serverTime=${String(mine.data?.serverTime).slice(0, 19)}`)

  // ── 16. 待审核 ───────────────────────────────────────────────────────────
  step(16, '待审核列表')
  const pending = await call('/mobile/entries/pending')
  const pendingFound = (pending.data?.items || []).find(item => item.id === entryId)
  check(!!pendingFound, 'GET /mobile/entries/pending 命中待审核记录', `total=${pending.data?.total} 首条=${pending.data?.items?.[0]?.unitCode}`)

  // ── 17. 审核 ─────────────────────────────────────────────────────────────
  step(17, '审核：退回必须填原因 → 退回 → 通过')
  const rejectBad = await json(`/mobile/entries/${entryId}/review`, 'PUT', { action: 'reject' })
  check(String(rejectBad.body?.code) === '1510', '退回未填原因被拒绝（1510）', `code=${rejectBad.body?.code}`)

  const reject = await json(`/mobile/entries/${entryId}/review`, 'PUT', {
    action: 'reject',
    remark: '未拍到基础编号铭牌，请补拍后重提。',
  })
  check(reject.data?.reviewStatus === '退回修改', '退回成功，状态为「退回修改」', `status=${reject.data?.reviewStatus} remark=${reject.data?.reviewRemark}`)

  const approve = await json(`/mobile/entries/${entryId}/review`, 'PUT', {
    action: 'approve',
    remark: '资料齐全，同意。',
  })
  check(approve.data?.reviewStatus === '已审核', '通过成功，状态为「已审核」', `status=${approve.data?.reviewStatus}`)

  // ── 18. 记录详情 ─────────────────────────────────────────────────────────
  step(18, '记录详情（附件 + 审核流水）')
  const entryDetail = await call(`/mobile/entries/${entryId}`)
  const ed = entryDetail.data || {}
  check(ed.attachments?.length === 1, '详情返回 1 个附件', `attachments=${ed.attachments?.length}`)
  check(ed.reviewLogs?.length === 3, '审核流水 3 条（提交/退回/通过）', `logs=${ed.reviewLogs?.map(item => item.action).join(',')}`)
  check(ed.entry?.unitCode === unitCode, '详情带出所属事项编号', `unitCode=${ed.entry?.unitCode}`)

  // ── 19. 台账 ─────────────────────────────────────────────────────────────
  step(19, '工作台账（项目 → 事项 → 记录 → 附件，落快照）')
  const ledger = await call('/mobile/admin/ledger')
  const ld = ledger.data || {}
  check(!!ld.summary && Array.isArray(ld.units) && Array.isArray(ld.entries), 'GET /mobile/admin/ledger 返回 summary/units/entries', `units=${ld.units?.length} entries=${ld.entries?.length}`)
  check(ld.summary?.totalAttachments >= 1, '台账统计附件数', `attachments=${ld.summary?.totalAttachments}`)
  check(ld.summary?.entriesApproved >= 1, '台账统计已审核数', `approved=${ld.summary?.entriesApproved}`)
  const ledgerEntry = (ld.entries || []).find(item => item.id === entryId)
  check(ledgerEntry?.recorderName === me.nickname || ledgerEntry?.recorderName === me.username, '台账带出记录人姓名', `recorder=${ledgerEntry?.recorderName}`)

  // ── 20. 快照与审计 ───────────────────────────────────────────────────────
  step(20, '历史快照与操作审计')
  const snaps = await call('/mobile/admin/snapshots')
  check((snaps.data?.items || []).length >= 1, 'GET /mobile/admin/snapshots 返回快照', `total=${snaps.data?.total}`)

  const audit = await call('/mobile/admin/audit?pageSize=50')
  const auditActions = (audit.data?.items || []).map(item => item.action)
  check(auditActions.includes('create') && auditActions.includes('review:approve'), '审计流水包含事项创建与审核动作', `total=${audit.data?.total} 例=${auditActions.slice(0, 4).join('/')}`)

  const overview = await call('/mobile/admin/overview')
  check(Array.isArray(overview.data) && overview.data.length >= 1, 'GET /mobile/admin/overview 返回项目汇总', `projects=${overview.data?.length}`)

  // ── 21. 附件下载 ─────────────────────────────────────────────────────────
  step(21, '附件下载与保护')
  const file = await call(`/mobile/attachments/${attachId}`)
  check(file.status === 200 && file.buffer?.length > 0, 'GET /mobile/attachments/:id 返回文件流', `http=${file.status} ${file.buffer?.length ?? 0}B type=${file.type}`)

  const lockDelete = await call(`/mobile/attachments/${attachId}`, { method: 'DELETE' })
  check(String(lockDelete.body?.code) === '1519', '已归档到已提交记录的附件不可删除（1519）', `code=${lockDelete.body?.code}`)

  const looseDelete = await call(`/mobile/attachments/${attachId2}`, { method: 'DELETE' })
  check(looseDelete.body?.code === 200, '未绑定记录的附件可删除', `code=${looseDelete.body?.code}`)

  // ── 22. 越权与参数校验 ───────────────────────────────────────────────────
  step(22, '越权与参数校验')
  const saved = token
  token = ''
  const anon = await call('/mobile/units')
  check(anon.status === 401 || anon.body?.code === 401, '未登录访问 /mobile/units 被拦截', `http=${anon.status}`)
  token = saved

  const noFile = await call('/mobile/attachments/00000000-0000-4000-8000-000000000000')
  check(String(noFile.body?.code) === '1516', '不存在的附件返回 1516', `code=${noFile.body?.code}`)

  const badUnit = await call(`/mobile/units/${uuid()}`)
  check(String(badUnit.body?.code) === '1511', '不存在的事项返回 1511', `code=${badUnit.body?.code}`)

  const badType = await json('/mobile/units', 'POST', {
    id: uuid(),
    scope: channelData.scope,
    typeCode: 'not-exist',
    code: 'X-1',
  })
  check(String(badType.body?.code) === '1517', '非法事项类型返回 1517', `code=${badType.body?.code}`)

  // ── 23. 删除事项（软删除） ───────────────────────────────────────────────
  step(23, '删除事项（软删除，记录保留追溯）')
  const removed = await call(`/mobile/units/${unitId}`, { method: 'DELETE' })
  check(removed.data?.deleted === true, 'DELETE /mobile/units/:id 返回删除成功')
  const listAfter = await call('/mobile/units?pageSize=100')
  check(!(listAfter.data?.items || []).some(item => item.id === unitId), '删除后列表不再出现该事项', `total=${listAfter.data?.total}`)

  finish()
}

function finish() {
  console.log(`\n${'═'.repeat(74)}`)
  console.log(`联调结果：通过 ${pass} 项，失败 ${fail} 项`)
  console.log('═'.repeat(74))
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\n联调脚本异常：', error)
  process.exit(2)
})
