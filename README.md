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
_worker.js            # Worker 入口（前端页面 + API，单文件）
wrangler.toml         # 声明 name / main / R2 绑定
package.json          # 定义 deploy 脚本：先建桶，再部署
scripts/ensure-r2.mjs # 幂等建桶脚本
.gitignore            # 忽略 node_modules / .wrangler / .dev.vars
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
| **Build command**（构建命令） | `npm install`（安装 wrangler 等依赖） |
| **Deploy command**（部署命令） | `npm run deploy` ← **务必手动确认这一项**（控制台默认可能是 `npx wrangler deploy`，那样会跳过建桶） |
| API token | 保持默认。Cloudflare 自动生成的令牌已包含 **Workers R2 Storage (edit)** 权限 |

> 如果你更希望把建桶放在构建阶段，也可以：Build command 填 `npm install && node scripts/ensure-r2.mjs`，Deploy command 保持默认 `npx wrangler deploy`。

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
A: 点击搜索框并停留超过 3 秒自动进入禅模式，隐藏所有图标；点击背景空白处退出，也可按 `Shift+Z` 手动切换。

**Q: 搜索框能筛选我的导航吗？**
A: 能。输入关键词会**即时筛选**分组与卡片（匹配分组名、标题、描述、网址）；按回车则跳转到搜索引擎查找。筛选期间会暂停拖拽排序，按 `Esc` 或点「清空搜索」恢复。

**Q: 怎么用自定义搜索引擎？**
A: 打开「系统设置 → 自定义搜索引擎」，填写地址前缀（如 `https://www.example.com/search?q=`），再到顶部搜索栏选择「自定义」即可。未填写时不会打开空白页，会给出提示。

**Q: 有哪些快捷键？**
A: `/` 聚焦搜索框；`Esc` 清空搜索 / 关闭弹窗 / 退出禅模式 / 退出编辑模式；`Shift+Z` 切换禅模式；`Shift+N` 打开快速便签（需登录）。

**Q: 数据存在哪？会丢吗？**
A: 导航与设置存在 R2 的 `nav_data` / `nav_settings`，管理员凭据存在 `admin_hash`，登录会话存在 `session_*`（30 天过期）。建议定期用「系统设置 → 备份」导出 JSON。

---

## 七、安全说明（v22.2 已加固）

以下问题在 v22.2 中已修复，此处保留说明便于回溯：

1. **会话令牌**：旧版 token 是 `base64(用户名 + 密码哈希)`，等于把口令哈希当令牌用，且 `btoa()` 遇到中文用户名会直接抛错。现在改为**服务端生成的 64 位随机 token**，存 R2 的 `session_*` 对象，30 天过期，登出即吊销。
2. **口令存储**：改为「随机盐 + SHA-256」，兼容旧数据（旧记录无 `salt` 时按原算法比对，登录后自动以新格式重存）。
3. **SSRF**：`/api/meta` 现只放行 `http/https`，并拦截 `localhost`、`.local/.internal`、内网与保留地址段（10/8、127/8、169.254/16、172.16/12、192.168/16、100.64/10、IPv6 本地地址）。
4. **私密内容外泄**：未登录读取 `/api/data` 时，除过滤 `isPrivate` 分组/链接外，**不再下发 `settings.memo`（便签）**。
5. **反向标签劫持**：所有 `window.open` 外链已加 `noopener,noreferrer`。
6. **响应头**：HTML 响应补充 `X-Content-Type-Options: nosniff` 与 `Referrer-Policy: no-referrer`。

> 仍需注意：**导出备份（系统设置 → 备份）会把私有链接以明文写进 JSON**，请勿公开分享备份文件。
> 若需要多用户/更高强度，建议把口令哈希换成 `PBKDF2` 或 `bcrypt`，并给 `/api/login` 增加失败限流。

---

## 八、功能清单（v22.3 补齐）

| 功能 | 使用方式 |
| --- | --- |
| 即时筛选 | 搜索框输入即筛选（分组名 / 标题 / 描述 / 网址）；回车走外部搜索 |
| 自定义搜索引擎 | 「系统设置 → 自定义搜索引擎」填地址前缀，顶部搜索栏切到「自定义」 |
| 链接分组归属 | 新建 / 编辑链接弹窗内可直接切换所属分组 |
| 书签导入 | 「系统设置 → 导入 Chrome/Edge 书签」，**按文件夹自动分组** |
| 未登录设置 | 主题 / 背景 / 布局 / 引擎等偏好本地生效，无需登录 |
| 禅模式 | 搜索框停留 3 秒进入，或 `Shift+Z` 手动切换 |
| 拖拽排序 | 编辑模式下分组与卡片均可拖动，顺序自动保存到 R2 |
| 快速便签 | 菜单「快速便签」或 `Shift+N`，内容自动保存（仅登录可见） |
| 备份 / 恢复 | 导出 / 导入 JSON；支持导入书签 HTML |
