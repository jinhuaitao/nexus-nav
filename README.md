# Nexus 智能导航 · 通过 Cloudflare 控制台 + GitHub 自动部署

全程网页操作，无需命令行。**首次部署时 Cloudflare 会自动创建并绑定 R2 存储桶**，不需要你提前去 R2 页面手动建桶。

---

## 一、先看清架构（这决定了「为什么不能用 Pages」）

| 项目 | 说明 |
| --- | --- |
| 运行形态 | **Cloudflare Worker**（不是 Pages）。入口是根目录的 `_worker.js`，它本身就是标准 ES Module Worker 写法 `export default { fetch }`，**无需改一行代码** |
| 数据存储 | **R2 存储桶**，通过 `wrangler.toml` 的 `[[r2_buckets]]` 绑定到代码里的 `env.NAV_R2` |
| 绑定动作 | 由 `wrangler.toml` **声明式完成**，控制台不需要手动点绑定 |
| 建桶动作 | 由 `scripts/ensure-r2.mjs` 在 `wrangler deploy` **之前幂等执行**（不存在就建，已存在就跳过） |
| 控制台职责 | 只负责「连接仓库 + 触发构建 + 注入账号凭据」 |

> ⚠️ **关键坑：Cloudflare Pages 做不到自动建桶。**
> Pages 也支持在 `wrangler.toml` 里写 `r2_buckets`，但：
> 1. Pages 的构建环境**只注入 `CF_PAGES_*` 变量，不注入 API Token**，构建命令根本没有权限建桶；
> 2. Pages 不会自动 provision 资源，桶不存在时部署直接失败（`R2 bucket not found`）。
>
> 所以想要「自动创建 + 自动绑定」，必须走 **Workers** 这条链路。本仓库已改造完毕。

---

## 二、🚀 部署步骤

### 第一步：把代码推到 GitHub

确保仓库根目录包含：

```
_worker.js            # Worker 入口（原样保留）
wrangler.toml         # 声明 name / main / R2 绑定
package.json          # 定义 deploy 脚本：先建桶，再部署
scripts/ensure-r2.mjs # 幂等建桶脚本
```

### 第二步：在控制台连接仓库

1. 登录 Cloudflare 控制台 → 左侧 **Workers & Pages**
2. 点 **Create application**（创建应用程序）
3. 选 **Workers** 选项卡（**不要选 Pages**）
4. 点 **Import a repository / Connect to Git**
5. 授权并选择你的 `nexus-nav` 仓库

### 第三步：确认构建配置

| 配置项 | 填什么 |
| --- | --- |
| Worker 名称 | 必须与 `wrangler.toml` 里的 `name` **完全一致**（`nexus-nav`），否则构建会报 name mismatch |
| **Build command**（构建命令） | 留空，或填 `exit 0` |
| **Deploy command**（部署命令） | `npm run deploy` ← **务必手动确认这一项**（控制台默认可能是 `npx wrangler deploy`，那样会跳过建桶） |
| API token | 保持默认。Cloudflare 自动生成的令牌已包含 **Workers R2 Storage (edit)** 权限 |

> 如果你更希望把建桶放在构建阶段，也可以：Build command 填 `node scripts/ensure-r2.mjs`，Deploy command 保持默认 `npx wrangler deploy`。

### 第四步：Save and Deploy

构建日志里应该能看到：

```
[ensure-r2] 目标存储桶: nexus-nav-data
[ensure-r2] ✅ 已创建存储桶 nexus-nav-data
...
Uploaded nexus-nav
Deployed nexus-nav
```

部署完成后访问 `https://nexus-nav.<你的子域>.workers.dev`，第一次打开会提示设置管理员账号密码。

---

## 三、原理：为什么这样就能自动建桶

1. Workers Builds 在构建容器里注入了账号凭据，`wrangler` 会自动读取——这也正是 `wrangler deploy` 无需登录即可部署的原因；
2. `scripts/ensure-r2.mjs` 因此可以直接执行 `wrangler r2 bucket create`；
3. 桶建好后，`wrangler deploy` 读取 `wrangler.toml` 的 `[[r2_buckets]]`，把桶绑定为 `env.NAV_R2`；
4. 第二次及以后部署，脚本识别到 `already exists (code 10004)` 后按成功退出，**不会让构建失败**。

脚本的行为已在本地用桩程序验证过三种分支：

| 场景 | 行为 |
| --- | --- |
| 桶不存在 | 创建成功 → 退出 0，继续部署 |
| 桶已存在 | 打印「已存在，跳过」→ 退出 0，继续部署 |
| 权限不足 / 认证失败 | 打印排查指引 → 退出 1，**阻断部署**（避免带着坏绑定上线） |

---

## 四、另一种「零手动」方案：Deploy to Cloudflare 按钮

```markdown
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/你的用户名/nexus-nav)
```

官方文档明确说明：该按钮会读取仓库的 Wrangler 配置文件，**自动 provision 并绑定 R2 等资源**，无需任何额外设置。

限制（决定了它更适合「分享给别人部署」而不是「部署自己的仓库」）：

- 仅支持 **Workers** 应用，不支持 Pages；
- 仓库必须**公开**；
- 它会把仓库**克隆一份到你自己的 GitHub 账号**下再部署。

所以：你自己的仓库用上面第二节的 Workers Builds 流程即可；想让别人一键部署你的项目，就把按钮放进 README。

---

## 五、手动兜底（30 秒，仅在自动流程失败时用）

如果构建日志出现 `R2 bucket not found` 或建桶报错：

1. 控制台 → **R2** → **Create bucket** → 名称**必须**是 `nexus-nav-data`；
2. 回到 Worker → **Deployments** → **Retry build**。

若报「R2 未开通」：去 R2 页面点一次开通即可，免费额度（10 GB 存储 / 每月 100 万次写入）足够个人使用，不需要绑卡。

> 想换桶名？改 `wrangler.toml` 的 `bucket_name` 即可，脚本会自动跟随读取（它会解析 `wrangler.toml`，保证单一数据源）。

---

## 六、🤔 常见问题

**Q: 背景图怎么不显示？**
A: 确保「系统设置」里选了正确的壁纸类型；自定义 URL 要填直链（.jpg / .png，视频用 .mp4）。

**Q: 我想调整分组顺序怎么办？**
A: 登录后进入**编辑模式**，拖动分组标题左侧的 `⠿` 手柄即可；卡片也可以在分组内、跨分组拖动排序，顺序会自动保存到 R2。

**Q: 构建报 `The name in your Wrangler configuration file must match the name of your Worker`？**
A: 控制台里的 Worker 名称和 `wrangler.toml` 的 `name` 不一致，改成一样后 Retry build。

**Q: 搜索沉浸模式（Auto Zen）怎么触发？**
A: 点击搜索框并停留超过 3 秒自动进入禅模式，隐藏所有图标；点击背景空白处退出。

**Q: 数据存在哪？会丢吗？**
A: 全部存在 R2 的 `nav_data` / `nav_settings` / `admin_hash` 三个对象里。建议定期用「系统设置 → 备份」导出 JSON。

---

## 七、安全提示（建议后续加固）

当前代码有几处可以改进的地方，不影响部署，但值得知道：

1. **令牌强度**：登录后返回的 token 是 `base64(用户名 + 密码哈希)`，等价于把密码当令牌用。建议改为服务端生成随机 token 并存储。
2. **SSRF**：`/api/meta` 会请求用户提交的任意 URL，建议加协议 + 域名白名单。
3. **私有分组**：未登录访问时后端会过滤 `isPrivate` 的项，但「公开分组里的私有链接」在导出备份时会明文出现在 JSON 里，注意别把备份文件公开分享。
