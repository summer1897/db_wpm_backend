import { randomUUID } from 'node:crypto'
/**
 * 临时验证脚本：后台分配项目 → APP 端可见性。
 * 覆盖：
 *   1. 管理员在「项目管理」接口新建项目，自动成为负责人
 *   2. 管理员把普通账号加为项目成员（记录员）
 *   3. 被加入的账号 GET /mobile/projects 只看到该项目
 *   4. 被加入的账号能在该项目下新增风机；对未分配项目新增风机被拒绝
 *   5. 没被分配任何项目的账号 GET /mobile/projects 返回空数组
 */
import fs from 'node:fs'
import path from 'node:path'
import IORedis from 'ioredis'

const ROOT = path.resolve(import.meta.dirname, '..')
for (const file of ['.env', '.env.development']) {
  const target = path.join(ROOT, file)
  if (!fs.existsSync(target))
    continue
  for (const raw of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#'))
      continue
    const i = line.indexOf('=')
    if (i < 0)
      continue
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}

const BASE = (process.env.MOBILE_BASE || 'http://127.0.0.1:7011/api').replace(/\/+$/, '')
const CODE = `PC-TEST-${Date.now().toString().slice(-6)}`

let pass = 0
let fail = 0
function check(ok, label, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${label}${detail ? `（${detail}）` : ''}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? `（${detail}）` : ''}`)
  }
}

const redis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB || 0),
})

async function login(username, password) {
  const captcha = await fetch(`${BASE}/auth/captcha/img?width=100&height=50`).then(r => r.json())
  const code = await redis.get(`captcha:img:${captcha.data.id}`)
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, captchaId: captcha.data.id, verifyCode: code }),
  }).then(r => r.json())
  if (!response.data?.token)
    throw new Error(`登录失败 ${username}: ${JSON.stringify(response).slice(0, 160)}`)
  return response.data.token
}

async function call(token, url, method = 'GET', body) {
  const response = await fetch(BASE + url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  }
  catch {
    parsed = { raw: text }
  }
  return { status: response.status, body: parsed, data: parsed?.data }
}

const admin = await login('admin', 'a123456')
console.log('\n[1] 管理员查看可选成员')
const users = await call(admin, '/mobile/admin/users')
check(Array.isArray(users.data) && users.data.length > 0, 'GET /mobile/admin/users 返回候选账号', `${users.data?.length} 个`)
const target = users.data?.find(u => u.username === 'developer') || users.data?.find(u => u.id !== 1)
check(Boolean(target), '找到可用于验证的普通账号', target && `${target.username}(id=${target.id})`)

console.log('\n[2] 管理员新建项目')
const created = await call(admin, '/mobile/projects', 'POST', {
  code: CODE,
  name: 'PC 分配验证项目',
  location: '贵州省毕节市',
  capacityMw: 30,
  startDate: '2026-11-01',
})
check(created.body?.code === 200 && created.data?.id, 'POST /mobile/projects 创建成功', `id=${created.data?.id} code=${created.body?.code}`)
const projectId = created.data?.id
check(created.data?.role === 'owner', '创建人自动成为负责人')
check(Boolean(created.data?.scope), '服务端生成移动端接入通道 scope')

const list = await call(admin, '/mobile/projects/all?page=1&pageSize=100')
const mine = list.data?.items?.find(item => item.id === projectId)
check(Boolean(mine), '列表能查到新项目')
check(mine?.memberCount === 1, '成员数统计为 1（创建人）', String(mine?.memberCount))

console.log('\n[3] 管理员把普通账号加入项目')
const added = await call(admin, `/mobile/projects/${projectId}/members`, 'POST', {
  userId: target.id,
  role: 'recorder',
})
check(added.body?.code === 200 && added.data?.userId === target.id, 'POST 成员成功', `code=${added.body?.code}`)
const members = await call(admin, `/mobile/projects/${projectId}/members`)
check(members.data?.length === 2, '成员列表包含负责人与新成员', `${members.data?.length} 人`)

console.log('\n[4] 被分配账号登录：只看到自己的项目')
const worker = await login(target.username, 'a123456')
const workerProjects = await call(worker, '/mobile/projects')
const ids = (workerProjects.data || []).map(item => item.id)
check(ids.includes(projectId), '能看到被分配的项目')
check(ids.length === 1, '只返回被分配的项目，不再兜底返回全部', `共 ${ids.length} 个：${ids.join(',')}`)
const workerRole = workerProjects.data?.find(item => item.id === projectId)?.role
check(workerRole === 'recorder', '角色为记录员', String(workerRole))

console.log('\n[5] 被分配账号可以新增风机，未分配项目被拒')
const unit = await call(worker, '/mobile/units', 'POST', {
  id: randomUUID(),
  projectId,
  typeCode: 'turbine',
  code: `T-${Date.now().toString().slice(-4)}`,
})
check(unit.body?.code === 200 && unit.data?.id, '在被分配项目下新增风机成功', `code=${unit.body?.code} ${unit.body?.message || ''}`)

const other = await call(admin, '/mobile/projects', 'POST', { code: `${CODE}-X`, name: '未分配验证项目' })
const denied = await call(worker, '/mobile/units', 'POST', {
  id: randomUUID(),
  projectId: other.data.id,
  typeCode: 'turbine',
  code: 'T-DENY',
})
check(denied.body?.code === 1515, '在未分配项目下新增风机被拒绝（1515 无权访问）', `code=${denied.body?.code}`)

console.log('\n[6] 未被分配任何项目的账号：项目列表为空')
const stranger = users.data?.find(u => u.username === 'user')
if (stranger) {
  const strangerToken = await login(stranger.username, 'a123456')
  const strangerProjects = await call(strangerToken, '/mobile/projects')
  check(Array.isArray(strangerProjects.data) && strangerProjects.data.length === 0, '未分配账号看不到任何项目', `共 ${strangerProjects.data?.length ?? 'n/a'} 个`)
}
else {
  console.log('  - 跳过：没有找到未被分配的测试账号')
}

redis.disconnect()
console.log(`\n结果：通过 ${pass}，失败 ${fail}（项目 ${CODE} / id=${projectId}）`)
process.exitCode = fail ? 1 : 0
