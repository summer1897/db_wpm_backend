#!/usr/bin/env node
/**
 * 账号密码重置 / 自检工具
 *
 * nest-admin 的密码存储规则：password = md5(明文密码 + psalt)
 *   - psalt 是 32 位随机串，每个用户独立
 *   - 校验逻辑见 src/modules/auth/auth.service.ts: md5(`${password}${user.psalt}`)
 *   - 登录查询带 status=1，因此 status != 1 的账号一律表现为“用户名密码有误”
 *
 * 用法（在 nest-admin 根目录执行，会读取 .env / .env.<NODE_ENV>）：
 *   node scripts/reset-password.mjs --list                      # 列出账号 + 密文自检
 *   node scripts/reset-password.mjs admin a123456               # 重置指定账号
 *   node scripts/reset-password.mjs admin a123456 --keep-sessions
 *   node scripts/reset-password.mjs --all a123456               # 重置全部账号
 *   node scripts/reset-password.mjs --check admin a123456       # 只验证，不写库
 *
 * 可用 --host/--port/--user/--db 覆盖环境变量里的数据库连接信息。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const candidates = ['.env', `.env.${nodeEnv}`, `.env.${nodeEnv}.local`]
  for (const file of candidates) {
    const full = path.join(rootDir, file)
    if (fs.existsSync(full))
      dotenv.config({ path: full, override: true, quiet: true })
  }
}

function parseArgs(argv) {
  const flags = new Set()
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--') && ['host', 'port', 'user', 'db', 'password', 'salt'].includes(key)) {
        options[key] = next
        i++
      }
      else {
        flags.add(key)
      }
    }
    else {
      positional.push(arg)
    }
  }
  return { flags, positional, options }
}

const md5 = str => crypto.createHash('md5').update(str, 'utf8').digest('hex')

// 与 src/utils/tool.util.ts 的 randomValue 等价的取值习惯：32 位大小写字母数字
function randomSalt(size = 32) {
  const dict = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
  let out = ''
  for (let i = 0; i < size; i++)
    out += dict[crypto.randomInt(0, dict.length)]
  return out
}

async function main() {
  loadEnv()
  const { flags, positional, options } = parseArgs(process.argv.slice(2))

  const conn = await mysql.createConnection({
    host: options.host || process.env.DB_HOST || '127.0.0.1',
    port: Number(options.port || process.env.DB_PORT || 3306),
    user: options.user || process.env.DB_USERNAME,
    password: options.password || process.env.DB_PASSWORD,
    database: options.db || process.env.DB_DATABASE,
    charset: 'utf8mb4',
  })

  const summary = []
  try {
    const [rows] = await conn.query(
      'SELECT id, username, status, psalt, password, nickname FROM sys_user ORDER BY id',
    )

    if (!rows.length) {
      console.error('sys_user 表为空：当前库没有初始化数据，请先导入 deploy/sql/nest_admin.sql 或执行迁移。')
      process.exitCode = 1
      return
    }

    console.log(`数据库：${options.db || process.env.DB_DATABASE} @ ${options.host || process.env.DB_HOST || '127.0.0.1'}`)
    console.log(`共 ${rows.length} 个账号\n`)
    console.log('ID   用户名        状态   密文(前 8 位)   psalt(前 8 位)')
    for (const row of rows) {
      console.log(
        `${String(row.id).padEnd(4)} ${String(row.username).padEnd(13)} ${(row.status === 1 ? '启用' : '停用').padEnd(6)} ${String(row.password).slice(0, 8).padEnd(16)} ${String(row.psalt || '').slice(0, 8)}`,
      )
    }

    // 校验模式：只比对，不写库
    if (flags.has('check')) {
      const [username, plain] = positional
      if (!username || !plain) {
        console.error('\n用法：node scripts/reset-password.mjs --check <用户名> <明文密码>')
        process.exitCode = 1
        return
      }
      const row = rows.find(item => item.username === username)
      if (!row) {
        console.error(`\n账号 ${username} 不存在。`)
        process.exitCode = 1
        return
      }
      const expect = md5(`${plain}${row.psalt}`)
      console.log(`\n校验 ${username}：`)
      console.log(`  期望密文 ${expect}`)
      console.log(`  库内密文 ${row.password}`)
      console.log(`  结论：${expect === row.password ? '一致，密码就是该明文' : '不一致，库内密码不是该明文'}`)
      if (row.status !== 1)
        console.log('  注意：该账号 status != 1，登录查询会直接找不到用户，同样报“用户名密码有误”。')
      return
    }

    if (flags.has('list'))
      return

    // 重置模式
    const targets = flags.has('all')
      ? rows
      : [rows.find(item => item.username === positional[0])].filter(Boolean)

    const plain = flags.has('all') ? positional[0] : positional[1]
    if (!targets.length || !plain) {
      console.error('\n用法：node scripts/reset-password.mjs <用户名> <新密码> | --all <新密码>')
      console.error('      node scripts/reset-password.mjs --list')
      console.error('      node scripts/reset-password.mjs --check <用户名> <明文密码>')
      process.exitCode = 1
      return
    }
    if (plain.length < 6) {
      console.error('\n密码至少 6 位（LoginDto 有 MinLength(6) 校验）。')
      process.exitCode = 1
      return
    }

    const keepSalt = flags.has('keep-salt')
    for (const row of targets) {
      const salt = keepSalt && row.psalt ? row.psalt : (options.salt || randomSalt(32))
      const hash = md5(`${plain}${salt}`)
      await conn.execute(
        'UPDATE sys_user SET password = ?, psalt = ?, status = 1, updated_at = NOW() WHERE id = ?',
        [hash, salt, row.id],
      )
      if (!flags.has('keep-sessions')) {
        await conn.execute('DELETE FROM user_access_tokens WHERE user_id = ?', [row.id]).catch(() => {})
      }
      summary.push({ id: row.id, username: row.username, hash, salt })
    }

    console.log('\n重置完成：')
    for (const item of summary) {
      console.log(`  ${item.username}（id=${item.id}） -> 新密码已写入，密文 ${item.hash.slice(0, 12)}…，psalt ${item.salt.slice(0, 8)}…`)
      console.log(`     Redis 清理：DEL auth:token:${item.id} auth:passwordVersion:${item.id} auth:permission:${item.id}`)
    }
    console.log('\n提示：密码版本号 auth:passwordVersion:<uid> 不清除也不影响新登录，只是旧令牌要等过期；如需立即强制下线，执行上面的 DEL。')
  }
  finally {
    await conn.end()
  }
}

main().catch((error) => {
  console.error('\n执行失败：', error.message)
  if (/ECONNREFUSED/.test(error.code || ''))
    console.error('数据库连不上，请确认 DB_HOST/DB_PORT 与容器端口映射。')
  if (/ER_ACCESS_DENIED/.test(error.code || ''))
    console.error('数据库账号或密码不对，请检查 .env 里的 DB_USERNAME/DB_PASSWORD。')
  process.exitCode = 1
})
