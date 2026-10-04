#!/usr/bin/env node
/**
 * ensure-r2.mjs — 在部署前「幂等」地确保 R2 存储桶存在。
 *
 * 为什么需要它：
 *   wrangler.toml 里的 [[r2_buckets]] 只负责「绑定」，不负责「创建」。
 *   桶不存在时 `wrangler deploy` 会直接失败（R2 bucket not found）。
 *   这个脚本在 deploy 之前把桶补上，于是整个流程就变成零手动。
 *
 * 认证方式：
 *   完全复用 wrangler 自己的凭据来源。在 Workers Builds 的构建容器里，
 *   Cloudflare 会注入账号凭据（这也正是 `wrangler deploy` 无需登录即可部署的原因），
 *   所以本脚本不需要、也不应该硬编码任何密钥。
 *
 * 幂等性：
 *   桶已存在 -> 识别 "already exists" 并视为成功退出 0，不会让构建失败。
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 从 wrangler.toml 读取 bucket_name，保证与绑定声明单一来源 */
function readBucketName() {
  if (process.env.R2_BUCKET_NAME) return process.env.R2_BUCKET_NAME;
  try {
    const toml = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');
    const m = toml.match(/\[\[r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/);
    if (m && m[1]) return m[1];
  } catch {
    /* 读不到就退回默认值 */
  }
  return 'nexus-nav-data';
}

/** 依次尝试 本地 node_modules/.bin -> 全局 wrangler -> npx，避免路径差异导致 ENOENT */
function runWrangler(args) {
  const local = resolve(root, 'node_modules', '.bin', 'wrangler');
  const attempts = [
    { cmd: local, argv: args },
    { cmd: 'wrangler', argv: args },
    { cmd: 'npx', argv: ['--yes', 'wrangler', ...args] },
  ];
  for (const { cmd, argv } of attempts) {
    const r = spawnSync(cmd, argv, {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (r.error && r.error.code === 'ENOENT') continue;
    return r;
  }
  return { status: 127, stdout: '', stderr: 'wrangler 不可用（未安装且 npx 调用失败）' };
}

const bucket = readBucketName();
console.log(`[ensure-r2] 目标存储桶: ${bucket}`);

const res = runWrangler(['r2', 'bucket', 'create', bucket]);
const output = `${res.stdout || ''}${res.stderr || ''}`;

if (res.status === 0) {
  console.log(`[ensure-r2] ✅ 已创建存储桶 ${bucket}`);
  process.exit(0);
}

// 已存在：wrangler 返回 code 10004 / "already exists"，属于预期情况
if (/already exists|already owned|10004/i.test(output)) {
  console.log(`[ensure-r2] ✅ 存储桶 ${bucket} 已存在，跳过创建`);
  process.exit(0);
}

console.error('[ensure-r2] ❌ 创建存储桶失败，输出如下：');
console.error(output.trim() || '(无输出)');
console.error(
  '\n[ensure-r2] 处理建议：\n' +
    '  1) 若提示权限不足：控制台 Workers 项目 → Settings > Build > API token，\n' +
    '     确认令牌包含 Workers R2 Storage (edit)，或改用自己的令牌。\n' +
    '  2) 若提示 R2 未开通：控制台 R2 页面点一次开通（免费额度即可）。\n' +
    '  3) 应急兜底：控制台 R2 → Create bucket → 名称填 ' + bucket + '，然后 Retry build。'
);
process.exit(res.status ?? 1);
