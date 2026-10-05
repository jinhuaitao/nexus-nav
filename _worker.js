/**
 * Cloudflare Worker Navigation Site v22.9 (Login UI Edition)
 *
 * Changelog (v22.9 Login UI Edition):
 * - [UI]  登录弹窗重做，与全站设计语言对齐：徽标沿用顶部栏那枚 fa-atom + indigo→purple 渐变
 *         与玻璃质感（原来只有一个孤零零的标题），标题按「初始化 / 登录」两种语境给出不同文案与副标题。
 * - [UI]  输入框改为「左侧图标 + 左对齐 + 聚焦时图标点亮」，不再是无标签的居中占位符；
 *         顶部补一层柔光，让弹窗上半部分不至于死板。
 * - [FEAT] 密码框新增可见性切换（眼睛）与大写锁定（Caps Lock）提示 —— 后者是输错密码的高频原因。
 * - [FEAT] 新增关闭按钮（仅非初始化模式显示，初始化流程必须走完），Esc 仍可关闭。
 * - [UI]  错误提示统一成带图标的提示气泡（红=组件异常 / 琥珀=服务端判定），替代原来的裸文字红字；
 *         「人机验证自检」入口改为整行按钮，提交按钮加载态保留文案（正在验证…）+ spinner。
 * - [FIX] 关闭 / 打开弹窗时复位 pwdVisible 与 capsOn，避免状态残留。
 * - [FIX] Turnstile「配了验证却提示未通过」：页面里的 TURNSTILE_CFG 是服务端渲染时写死的，
 *         保存密钥后不刷新页面就会「服务端已启用、页面仍以为没启用」→ 验证框不渲染 → 无 token → 403 死循环。
 *         新增公开端点 GET /api/turnstile/config，登录弹窗每次打开实时拉取配置并动态补加载 api.js；
 *         保存 / 清空密钥后立即生效。403 响应补可读 message 与错误码，登录弹窗常驻展示。
 *
 * Changelog (v22.8 Click Fix Edition):
 * - [FIX]  「点击登录按钮没有反应」：v22.7 把登录弹窗改成 x-if 按需渲染后引入的回归。
 *          弹窗原本靠 @click.away 关闭，而 .away 会挂一个 document 级监听；
 *          x-show 会把 el._x_isShown 管成 false，Alpine 的判定式「_x_isShown !== false」
 *          因此在弹窗还没真正显示时短路，不会误关；但 x-if 插入的新节点 _x_isShown 是
 *          undefined，判定式成立 —— 于是「打开弹窗的那一次点击」冒泡到 document 时，
 *          被刚注册的 .away 监听当场捕获，弹窗开了又立刻被关掉，看起来就是点了没反应。
 *          修法：全部弹窗改成「遮罩层 @click.self」，不再注册任何全局监听。
 *          （@click.self 只认点到遮罩本身，行为与 .away 等价 —— 遮罩本来就是全屏的。）
 * - [FIX]  x-transition 在 x-if 下是死代码：Alpine 只在 x-show 的路径里驱动过渡
 *          （_x_toggleAndCascadeWithTransitions 是唯一的 .in() 调用点）。
 *          两个按需渲染的弹窗改用纯 CSS 进场动画 .modal-pop（节点插入即播放）。
 * - [NOTE] 这类时序 bug **jsdom 测不出来**：浏览器在每个事件监听器返回后都会做一次
 *          微任务检查点，jsdom 不做。实测同一份代码 jsdom 全绿、真实 Chrome 里弹窗开不起来，
 *          因此补了一套真实浏览器回归测试（见 README 第十一节）。
 *
 * Changelog (v22.7 Autofill Off Edition):
 * - [FIX]  「每次刷新账号被填进搜索框」的**根因**：登录弹窗原本用 x-show 隐藏，
 *          也就是那个密码输入框（type="password"）一直常驻在 DOM 里。Chrome 的密码管理器
 *          一旦在页面上扫到密码框，就会去找一个「用户名输入框」去填 —— 而隐藏字段会被它跳过，
 *          于是它挑中了页面上第一个可见文本框：顶部搜索框。
 *          现在登录弹窗改成 <template x-if="modals.login"> 按需渲染：不打开时整块 DOM 都不存在，
 *          浏览器根本无从下手。配套新增 closeLogin()，关闭时同步摘掉 Turnstile 组件并复位 widgetId。
 *          系统设置面板同理（里面有一个填 Turnstile Secret Key 的密码输入框），
 *          一并改成 x-if。改完之后，页面在「用户没有主动打开凭据弹窗」时，DOM 里
 *          不存在任何 type="password"，浏览器彻底失去自动填充的触发点。
 *          （此前的 autocomplete="off" / data-lpignore 等静态属性只能治标，改不掉「密码框常驻」这个病根。）
 * - [FIX]  登录框两个字段明确标注 autocomplete="username" / "current-password"，
 *          打开弹窗时浏览器能准确地把账号密码填到该填的地方。
 * - [FIX]  顶部搜索框不再被自动填充：补齐 autocomplete / autocorrect / autocapitalize / spellcheck，
 *          以及密码管理器忽略标记（data-form-type / data-lpignore / data-1p-ignore）。
 *          **刻意不加 name 属性** —— 浏览器的「表单历史」是按 (form, name) 记录的，
 *          没有 name 就不会攒出那个「上次搜过什么」的下拉列表。
 * - [FIX]  运行时兜底：个别浏览器 / 密码管理器会在页面稳定之后才灌值，绕过所有静态属性。
 *          init() 里在 200ms / 800ms / 2000ms 以及 load、pageshow 五个时间点做一次校验 ——
 *          只要搜索框在「用户还没碰过它」之前出现了非空内容，就判定为自动填充并连 Alpine 状态一起复位。
 * - [FEAT] 搜索框补 aria-label，并把移动端键盘的回车键改成「搜索」（inputmode / enterkeyhint）。
 * - [SYNC] 版本号仍由 APP_VERSION 单一来源派生。
 *
 * Changelog (v22.6 Stable Drag Edition):
 * - [FIX]  「拖动时位置会乱」根因一：forceFallback 模式下 Sortable 会 cloneNode 出一个
 *          「跟随光标」的克隆体：ghostClass 加在【原元素】上，fallbackClass + dragClass 一起加在【克隆体】上。
 *          原来的 .sortable-drag { opacity: 0 !important } 把克隆体整个隐藏了（!important 还压过了
 *          Sortable 内联的 opacity:0.8），于是拖动时既看不到跟手的卡片、原位置又只剩 10% 透明度，
 *          视觉上就是「全乱」。现在克隆体保持不透明，原位置的占位槽用虚框高亮。
 * - [FIX]  「拖动时位置会乱」根因二：Alpine x-for 的重排算法隐含前提是
 *          「真实 DOM 顺序 == 它内部记录的 _x_prevKeys」。Sortable 已经先在 DOM 上搬好了卡片，
 *          x-for 会从这个不一致的状态出发去算交换序列，从而把顺序算错
 *          （回归测试里随机拖 11 次有 6 次被改错）。
 *          现在组内拖动结束后主动把 _x_prevKeys 同步成新顺序，让 x-for 零操作、DOM 保持正确；
 *          跨组拖动则交给 x-for 原生的「移除 + 新增」路径（它会重建卡片并修正作用域链）。
 * - [FIX]  新增 verifyGridOrder / verifyGroupOrder 兜底：每次拖放后在 $nextTick 真实比对
 *          DOM 顺序与数据顺序，一旦不一致就提升该网格的渲染版本号强制整块重建，
 *          保证顺序 100% 正确（正常路径下不会触发，实测 0 次）。
 * - [FIX]  移除死代码 :key="groupRenderKey"。Alpine 的 x-bind:key 在非 x-for 元素上只是把表达式
 *          存进 _x_keyExpression，既不产生响应式依赖也不参与渲染，等于完全没生效。
 * - [FIX]  编辑模式下屏蔽 .nav-card:hover/:active 的 transform，避免与克隆体的定位 transform 抢样式。
 * - [FIX]  onEnd 的数据重建更健壮：过滤掉「+ 新增卡片」占位符等无 data-id 的节点；
 *          目标分组重排后把未出现在 DOM 里的项按原顺序兜底追加，避免极端情况丢数据。
 * - [SYNC] 版本号改为单一常量 APP_VERSION，Worker 头部 / 页脚 / 导出备份 / Service Worker 缓存名
 *          全部由它派生，彻底消除多处手写导致的漂移。
 *
 * Changelog (v22.5 Turnstile Edition):
 * - [FEAT] 人机验证（Cloudflare Turnstile）：Site Key / Secret Key 可在「系统设置」内配置，
 *          存 R2 的 sys_settings；未配置时自动回退环境变量 TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY。
 * - [FEAT] 容错设计：只对「非请求方原因」（密钥无效、验证服务不可达）降级放行并给出醒目告警；
 *          用户自己没通过验证仍照常拦截（含缺失 token、token 过期/重复）。严格 / 宽松两档可选。
 * - [FEAT] 应急开关：控制台写 R2 对象 sys_turnstile_off 即可关闭验证，避免配错后把管理员锁在门外。
 * - [FEAT] 自检端点 GET /api/turnstile/diagnose（无需登录、按 IP 限流），返回
 *          not-configured / emergency-off / secret-invalid / secret-ok / unreachable 五种结论与修复建议，绝不回显密钥明文。
 * - [FEAT] 登录页组件用显式渲染 + 错误码中文提示；密钥仅以掩码回显；设置页拦截「两把密钥填反」。
 * - [SEC] 设置接口需登录；成对校验（只配一半直接 400）；密钥字段语义为「不传=不改，显式空串=清空」。
 * - [SEC] 验证失败也计入登录限流，避免用「不带 token 的请求」反复触发探针。
 * - [SYNC] 版本号在 Worker 头部 / 页脚 / package.json 三处对齐。
 *
 * Changelog (v22.4 Polish Edition):
 * - [FEAT] PWA Service Worker：新增 /sw.js，仅对白名单 CDN 做「网络优先 + 缓存兜底」，
 *          同源 HTML / API 一律不拦截、绝不缓存，避免读到过期内容或他人数据。
 * - [SEC] 登录失败限流：同一 IP 10 分钟内失败 8 次即临时锁定（429），登录成功后清零。
 * - [SEC] 口令哈希改为恒定时间比较，避免通过响应耗时推测。
 * - [SEC] 所有 API 响应加 Cache-Control: no-store；HTML 加 no-cache，避免私密数据被缓存或读到旧页面。
 * - [HARD] /api/data 写入增加 4MB 体积上限与 JSON 校验；/api/meta 抓取失败改回 502。
 * - [FEAT] 图标抓取优先取 <link rel="icon">，其次 og:image；相对路径自动补全为绝对地址。
 * - [FEAT] 用应用内确认弹窗替换原生 confirm()，风格统一；设置页新增「恢复默认」。
 * - [FIX]  Toast 计时器未清理，连续提示时前一条会提前关掉后一条。
 * - [FIX]  图标兜底不再无限递归（先置 onerror=null），兜底图改用标题首字母。
 * - [FIX]  登录过期提示区分「已登出」与「登录已过期」；备份文件带日期与元信息，导入时校验结构。
 * - [FIX]  保存链接/分组补充校验与错误提示（空网址、非法网址、空分组名）。
 * - [SYNC] 版本号在 Worker 头部 / 页脚 / package.json 三处对齐。
 *
 * Changelog (v22.3 Feature Completion Edition):
 * - [FEAT] 搜索框即时本地筛选：按分组名 / 标题 / 描述 / 网址过滤，原 getter 直接返回全部导致筛选形同虚设。
 * - [FEAT] 补齐「自定义搜索引擎」：新增引擎选项 + 设置项 + 占位符提示，原 customSearchUrl 是永不生效的死代码。
 * - [FEAT] 新建/编辑链接新增「所属分组」下拉，原实现无法在弹窗内改分组。
 * - [FEAT] 未登录也可保存设置（localStorage），修复点引擎/调背景就弹「请先登录」的问题。
 * - [FEAT] 书签导入按文件夹分组，原来把所有书签塞进一个 "Imported" 分组。
 * - [FEAT] 空状态区分「无数据」与「搜索无结果」，并给搜索态加「清空搜索」按钮。
 * - [FIX]  模板字符串内正则未双重转义，\\. 被吞成 . 导致 isVideoBg 正则非法（含 .mp4?token= 也识别为视频）。
 * - [FIX]  筛选态禁用拖拽排序，避免在过滤后的子集上拖动产生错乱顺序。
 * - [FIX]  Sortable 实例在 DOM 重建后未销毁导致累积，现自动回收已脱离 DOM 的实例。
 * - [FIX]  剪贴板复制增加非安全上下文兜底；右键菜单定位增加下边界收敛。
 * - [FIX]  Esc 清空搜索；主题切换同步更新 <meta theme-color>；天气显示补充描述 tooltip。
 * - [SYNC] 版本号在 Worker 头部 / 页脚 / package.json 三处对齐。
 *
 * Changelog (v22.2 安全加固):
 * - [SEC] 会话令牌改为服务端随机 token（R2 存储 + 30 天过期），不再把口令哈希当令牌用；
 *         顺带修掉 btoa() 遇到中文用户名会抛 InvalidCharacterError 的问题。
 * - [SEC] 口令哈希加盐（兼容旧数据：无 salt 时回退到原算法）。
 * - [SEC] /api/meta 增加 SSRF 防护：仅放行 http/https，拦截 localhost / 内网 / 保留地址。
 * - [SEC] 未登录读取 /api/data 时不再下发 settings.memo（便签属私密内容）。
 * - [FIX] /api/meta 现在真正回传 og:image（原实现采集了 image 却只返回空 icon）。
 * - [FIX] 顶部栏背景色 --card-rgb 之前未定义，导致 headerOpacity 调节无效。
 * - [FIX] 图标透明度 --icon-opacity 之前只写不读，滑块无效果。
 * - [FIX] sanitizeData 遇到缺失 items 的旧数据会抛错，现自动补齐。
 * - [FIX] 外链统一加 noopener/noreferrer，避免反向标签劫持。
 *
 * 历史（v22.1 Restore Fix Edition）:
 * - [FIX] "Reload Prompt": Fixed browser warning when restoring backup data.
 * - [FIX] "Drag Twice" Bug: Solved by removing Sortable animation delay and forcing Deep Clone updates.
 * - [FIX] "Snap Back": Uses immediate DOM-to-Data mapping on drop.
 * - [Core] Zero-latency drag start (desktop) + safety delay (mobile).
 * - [System] Aggressive Auto-Sanitizer checks for ID conflicts on every operation.
 */

// 🟢 版本号单一来源：页脚、导出备份、Service Worker 缓存名都由它派生
const APP_VERSION = "22.9";

// 🟢 配置区域
const SITE_ICON = "https://jhtvm.eu.org/rest/2Riuc1k.png"; 

// 🟢 Service Worker（PWA）：仅对白名单 CDN 做「网络优先 + 缓存兜底」，
// 同源资源（HTML / API / manifest）一律不拦截、绝不缓存，避免读到过期或他人数据。
const SW_VERSION = "v" + APP_VERSION;
const SW_SOURCE = `
const CACHE = "nexus-static-${SW_VERSION}";
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdn.tailwindcss.com"];
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) return;
  if (CDN_HOSTS.indexOf(url.hostname) === -1) return;
  e.respondWith(
    fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req))
  );
});
`;

const HTML_TEMPLATE = (context) => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>智能导航</title>
    <meta name="theme-color" content="#0f172a">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/png" href="${SITE_ICON}">
    <link rel="apple-touch-icon" href="${SITE_ICON}">
    
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.13.3/dist/cdn.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    
    <style>
        [x-cloak] { display: none !important; }
        * { -webkit-tap-highlight-color: transparent; }
        
        :root {
            --bg-grad-start: #0f172a; --bg-grad-end: #020617;
            --text-primary: #f8fafc; --text-secondary: #94a3b8; --text-accent: #818cf8;
            --glass-bg: rgba(15, 23, 42, 0.65); --glass-border: rgba(255, 255, 255, 0.08);
            --card-bg: rgba(30, 41, 59, var(--card-opacity, 0.5));
            --card-hover: rgba(51, 65, 85, var(--hover-opacity, 0.7));
            --modal-bg: rgba(15, 23, 42, 0.85);
            --card-rgb: 15, 23, 42;
            --icon-size: 32px;
        }

        .light-theme {
            --bg-grad-start: #f8fafc; --bg-grad-end: #e2e8f0;
            --text-primary: #1e293b; --text-secondary: #64748b; --text-accent: #4f46e5;
            --glass-bg: rgba(255, 255, 255, 0.75); --glass-border: rgba(255, 255, 255, 0.6);
            --card-bg: rgba(255, 255, 255, var(--card-opacity, 0.7));
            --card-hover: rgba(255, 255, 255, var(--hover-opacity, 0.95));
            --modal-bg: rgba(255, 255, 255, 0.9);
            --card-rgb: 255, 255, 255;
        }

        body { 
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            color: var(--text-primary);
            background: linear-gradient(135deg, var(--bg-grad-start), var(--bg-grad-end));
            background-attachment: fixed; overflow-y: scroll; overscroll-behavior-y: none;
        }

        .header-glass { backdrop-filter: blur(25px); border-bottom: 1px solid var(--glass-border); }
        .logo-box { background: linear-gradient(-45deg, #ff00cc, #333399, #6600ff, #00ccff, #00ff99, #ff00cc); background-size: 400% 400%; animation: rainbow-flow 10s ease infinite; box-shadow: inset 0 1px 1px rgba(255,255,255,0.4), 0 4px 15px rgba(99, 102, 241, 0.4); position: relative; overflow: hidden; }
        @keyframes rainbow-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .logo-box::after { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: linear-gradient(45deg, transparent, rgba(255,255,255,0.3), transparent); transform: rotate(45deg); }
        .glass-panel { background: var(--modal-bg); backdrop-filter: blur(40px); border: 1px solid var(--glass-border); box-shadow: 0 20px 40px rgba(0,0,0,0.2); }

        .nav-card { background: var(--card-bg); border: 1px solid var(--glass-border); transition: transform 0.1s, background 0.2s; position: relative; overflow: hidden; transform: translateZ(0); }
        .nav-card:hover { transform: translateY(-2px); background: var(--card-hover); border-color: var(--text-accent); z-index: 10; }
        .nav-card:active { transform: scale(0.98); }
        
        /* 🟢 DRAG STYLES（拖动排序）
           关键：Sortable 在 forceFallback 模式下会 cloneNode 出一个「跟随光标」的克隆体，
           ghostClass 加在【原元素】上，fallbackClass + dragClass 则一起加在【克隆体】上。
           克隆体才是用户真正看到、跟着鼠标走的那张卡片 —— 任何把它变透明的规则，
           都会导致「原位置被淡化 + 跟手的卡片消失」，也就是「拖动时位置全乱」。
           另外克隆体的位置由 Sortable 用内联 matrix() 控制，这里不要覆盖它的 transform。 */
        .editing .nav-card { cursor: grab; }
        .editing .nav-card:active { cursor: grabbing; }
        /* 拖动期间屏蔽 hover / active 位移，避免与克隆体定位互相抢样式 */
        .editing .nav-card:hover,
        .editing .nav-card:active { transform: none; }

        /* 跟随光标的克隆体（同时带 .sortable-fallback 与 .sortable-drag） */
        .sortable-fallback {
            opacity: 1 !important;                 /* 覆盖 Sortable 内联的 0.8，且防止被其它规则误伤 */
            background: var(--card-hover);
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            z-index: 99999;
            border: 1px solid var(--text-accent);
            border-radius: 12px;
            cursor: grabbing !important;
            pointer-events: none;
        }
        /* 原位置留下的占位空槽（挂在原元素上），保持可见以提示落点 */
        .sortable-ghost {
            opacity: 0.3 !important;
            background: var(--text-accent) !important;
            border: 1px dashed var(--text-accent) !important;
            border-radius: 12px;
        }
        /* 分组拖动的占位 */
        .sortable-ghost-group { opacity: 0.35 !important; }
        /* 兜底：个别 Sortable 版本会把 dragClass 挂在原元素上，无论如何都不能让它透明 */
        .sortable-drag { opacity: 1 !important; }

        .search-input { background: rgba(15, 23, 42, 0.3); border: 1px solid var(--glass-border); color: var(--text-primary); transition: all 0.3s; backdrop-filter: blur(10px); }
        .search-input:focus { background: var(--card-bg); border-color: var(--text-accent); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25); }
        .pill-tag { font-size: 11px; font-weight: 600; padding: 4px 14px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 99px; transition: all 0.2s; cursor: pointer; color: var(--text-secondary); }
        .pill-tag.active { background: var(--text-accent); color: white; border-color: transparent; }
        .context-menu { background: var(--modal-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: 6px; position: fixed; z-index: 9999; min-width: 160px; backdrop-filter: blur(30px); animation: menuPop 0.1s ease-out; }
        @keyframes menuPop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        /* 🟢 供 x-if 弹窗使用的进场动画。
           x-transition 在 x-if 下是**死代码** —— Alpine 只在 x-show 的路径里驱动过渡
           （_x_toggleAndCascadeWithTransitions 是唯一的 .in() 调用点）。
           所以按需渲染的弹窗改用纯 CSS 动画：节点插入即自动播放，不需要 JS 参与。 */
        .modal-pop { animation: menuPop 0.15s ease-out; }

        /* 🟢 登录弹窗专用样式（v22.9）
           目标：与全站的「玻璃面板 + 强调色」语言完全一致 ——
           徽标沿用顶部栏的 indigo→purple 渐变与 fa-atom，输入框改为左侧图标 + 左对齐，
           所有错误提示统一成带图标的提示气泡，避免出现「裸文字红字」这种不一致的元素。 */
        .auth-card { box-shadow: 0 24px 60px rgba(0, 0, 0, 0.38); }
        .light-theme .auth-card { box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16); }
        /* 顶部一层柔光，让弹窗上半部分不至于死板 */
        .auth-glow { position: absolute; top: -80px; left: 50%; transform: translateX(-50%); width: 280px; height: 190px; background: radial-gradient(closest-side, rgba(129, 140, 248, 0.3), transparent); pointer-events: none; }
        .light-theme .auth-glow { background: radial-gradient(closest-side, rgba(79, 70, 229, 0.16), transparent); }
        .auth-badge { background: linear-gradient(135deg, #6366f1, #8b5cf6 55%, #a855f7); box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.35); }
        .auth-close { color: var(--text-secondary); }
        .auth-close:hover { background: rgba(148, 163, 184, 0.18); color: var(--text-primary); }
        .auth-field { position: relative; }
        .auth-field-icon { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-secondary); opacity: 0.6; pointer-events: none; transition: color 0.25s, opacity 0.25s; }
        .auth-field:focus-within .auth-field-icon { color: var(--text-accent); opacity: 1; }
        .auth-input { padding-left: 43px; }
        .auth-input-pwd { padding-right: 45px; }
        .auth-eye { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); opacity: 0.6; transition: all 0.2s; }
        .auth-eye:hover { opacity: 1; background: rgba(148, 163, 184, 0.18); }
        .auth-hint { display: flex; align-items: flex-start; gap: 7px; font-size: 11px; line-height: 1.65; padding: 9px 11px; border-radius: 11px; text-align: left; }
        .auth-hint i { margin-top: 2px; flex-shrink: 0; }
        .auth-hint span { flex: 1; min-width: 0; word-break: break-word; }
        .auth-hint-error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.22); color: #f87171; }
        .light-theme .auth-hint-error { color: #dc2626; }
        .auth-hint-warn { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.22); color: #fbbf24; }
        .light-theme .auth-hint-warn { color: #b45309; }
        /* 提交按钮：hover 时一道微光扫过，和卡片顶部光带呼应 */
        .auth-submit { position: relative; overflow: hidden; }
        .auth-submit::after { content: ''; position: absolute; top: 0; left: -140%; width: 55%; height: 100%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.3), transparent); transition: left 0.55s ease; pointer-events: none; }
        .auth-submit:hover::after { left: 140%; }
        .menu-item { padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-primary); }
        .menu-item:hover { background: var(--text-accent); color: white; }
        .menu-item.danger:hover { background: #ef4444; }
        .bg-layer { position: fixed; inset: 0; z-index: -10; background-size: cover; background-position: center; transition: opacity 0.5s; }
        video.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -10; transition: opacity 0.5s; }
        .zen-hidden { opacity: 0; pointer-events: none; transform: translateY(20px); transition: all 0.5s ease; }
        .link-icon { width: var(--icon-size); height: var(--icon-size); transition: transform 0.3s, opacity 0.3s; object-fit: contain; opacity: var(--icon-opacity, 1); }
        .nav-card:hover .link-icon { transform: scale(1.15) rotate(3deg); }
        .group-content { transition: max-height 0.3s ease-out, opacity 0.2s; overflow: hidden; }
        .memo-area { resize: none; outline: none; border: none; background: transparent; font-family: inherit; line-height: 1.6; }
        ::-webkit-scrollbar { width: 0px; }
    </style>
    <script>window.CF_COORDS = ${JSON.stringify(context.coords)};window.TURNSTILE_CFG = ${JSON.stringify(context.turnstile || { enabled: false, siteKey: '', mode: 'strict' })};window.onTurnstileApiLoad = function () { window.__tsApiReady = true; };</script>
    ${(context.turnstile && context.turnstile.enabled) ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileApiLoad" async defer></script>' : ''}
</head>
<body x-data="app()" :class="{ 'light-theme': theme === 'light', 'editing': editMode }" @click="closeMenu()" @keydown.window="handleKeydown($event)" @contextmenu.prevent>

    <template x-if="isVideoBg"><video autoplay loop muted playsinline class="bg-video" :src="settings.customBg" :style="\`filter: blur(\${settings.blur}px) brightness(\${theme === 'light' ? 1.05 : 0.6}); opacity: \${theme === 'light' && !settings.showBgInLight ? 0 : 1}\`"></video></template>
    <template x-if="!isVideoBg"><div class="bg-layer" :style="\`background-image: url('\${bgUrl}'); filter: blur(\${settings.blur}px) brightness(\${theme === 'light' ? 1.05 : 0.6}); opacity: \${theme === 'light' && !settings.showBgInLight ? 0 : 1}\`"></div></template>

    <div x-show="zenMode" @click="zenMode = false" x-transition.opacity class="fixed inset-0 z-[5] cursor-zoom-out"></div>
    <div x-show="editMode" x-transition class="fixed top-0 left-0 w-full h-1 bg-indigo-500 z-[60] shadow-[0_0_15px_rgba(99,102,241,0.8)]"></div>

    <nav class="sticky top-0 z-50 header-glass px-4 py-3 mb-8 transition-all duration-500" :style="\`background-color: rgba(var(--card-rgb), \${(settings.headerOpacity ?? 75) / 100})\`" :class="{ 'opacity-0 -translate-y-full': zenMode }">
        <div class="mx-auto flex justify-between items-center" :class="settings.layoutWidth === 'wide' ? 'max-w-[98%]' : 'max-w-7xl'">
            <div class="flex items-center gap-4">
                <div class="logo-box w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ring-1 ring-white/10"><i class="fa-solid fa-atom text-xl"></i></div>
                <div class="hidden sm:block">
                    <div class="font-bold text-lg tracking-tight leading-none mb-1 text-transparent bg-clip-text bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)]">欢迎光临</div>
                    <div class="text-sm font-medium tracking-wide flex items-center gap-3 opacity-90" style="color: var(--text-secondary)">
                        <span x-text="timeStr"></span>
                        <span x-show="weather.temp" :title="weather.desc" class="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-lg ml-1 border border-white/10 shadow-sm transition-colors hover:bg-white/15 cursor-default group">
                            <img :src="weather.icon" class="w-5 h-5 object-contain" x-show="weather.icon"><span x-text="weather.temp + '°'" class="font-bold"></span>
                        </span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div x-show="status.saving" class="flex items-center gap-2 text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20"><i class="fa-solid fa-rotate fa-spin text-xs"></i><span class="text-[10px] font-bold">同步中</span></div>
                <div x-show="status.pending && !status.saving" class="flex items-center gap-2 text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20"><i class="fa-solid fa-cloud-arrow-up text-xs animate-pulse"></i><span class="text-[10px] font-bold">待保存</span></div>
                <button @click="toggleTheme()" class="btn-icon w-10 h-10 rounded-xl flex items-center justify-center shadow-sm hover:bg-white/5 transition"><i class="fa-solid transition-transform duration-500" :class="theme === 'dark' ? 'fa-moon' : 'fa-sun -rotate-90'"></i></button>
                <button @click="toggleZen()" class="btn-icon w-10 h-10 rounded-xl flex items-center justify-center shadow-sm hover:bg-white/5 transition"><i class="fa-solid fa-leaf"></i></button>
                <template x-if="!isLoggedIn"><button @click="openLogin()" class="btn-icon w-10 h-10 rounded-xl flex items-center justify-center shadow-sm hover:bg-white/5 transition"><i class="fa-solid fa-user-astronaut"></i></button></template>
                <template x-if="isLoggedIn">
                    <div class="relative" x-data="{ open: false }">
                        <button @click.stop="open = !open" class="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:scale-105 transition active:scale-95 ring-1 ring-white/20"><i class="fa-solid fa-bars"></i></button>
                        <div x-show="open" @click.outside="open = false" x-transition.origin.top.right class="context-menu" style="top: 50px; right: 0; position: absolute;">
                            <div @click="toggleEditMode(); open=false" class="menu-item" :class="{'bg-indigo-500/10 text-indigo-400': editMode}"><i class="fa-solid w-5 opacity-70" :class="editMode ? 'fa-check' : 'fa-pen-to-square'"></i><span x-text="editMode ? '完成编辑' : '布局编辑'"></span></div>
                            <div class="h-px bg-white/10 my-1"></div>
                            <div @click="modals.memo = true" class="menu-item"><i class="fa-solid fa-note-sticky w-5 opacity-70"></i> 快速便签</div>
                            <div @click="openGroupModal()" class="menu-item"><i class="fa-solid fa-folder-plus w-5 opacity-70"></i> 新建分组</div>
                            <div @click="openSettings()" class="menu-item"><i class="fa-solid fa-sliders w-5 opacity-70"></i> 系统设置</div>
                            <div class="h-px bg-white/10 my-1"></div>
                            <div @click="logout()" class="menu-item danger text-red-400"><i class="fa-solid fa-power-off w-5"></i> 安全退出</div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </nav>

    <main class="mx-auto px-4 sm:px-6 pb-24 transition-all duration-500" :class="[settings.layoutWidth === 'wide' ? 'max-w-[98%]' : 'max-w-7xl', zenMode ? 'mt-[30vh]' : '']">
        <div x-show="tsWarning && !zenMode" x-cloak class="max-w-3xl mx-auto mb-6 px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5">
            <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i>
            <span class="flex-1 text-[12px] leading-relaxed text-amber-500 break-words" x-text="tsWarning"></span>
            <button @click="dismissTsWarning()" class="text-amber-500/60 hover:text-amber-500 transition shrink-0"><i class="fa-solid fa-times text-xs"></i></button>
        </div>
        <div class="max-w-2xl mx-auto mb-12 relative z-10 animate-fade-in-up">
            <div class="flex justify-center flex-wrap gap-2 mb-4 transition-opacity duration-300" :class="{ 'opacity-0': zenMode }">
                <template x-for="eng in engines">
                    <button @click="setEngine(eng.val)" class="pill-tag" :class="{ 'active': settings.engine === eng.val }"><i :class="eng.icon" class="mr-1"></i> <span x-text="eng.name"></span></button>
                </template>
            </div>
            <div class="relative group transform transition-all duration-300 focus-within:scale-105">
                <!-- 刻意不加 name 属性：浏览器的「表单历史」是按 (form, name) 记录的，没有 name 就不会攒历史下拉。
                     其余属性是各家浏览器 / 密码管理器的关闭开关：
                     autocomplete=off 通用；data-form-type/data-lpignore/data-1p-ignore 分别对应
                     Dashlane / LastPass / 1Password，防止它们往这个输入框里注入自动填充图标。 -->
                <input x-ref="searchInput" type="text"
                       autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                       inputmode="search" enterkeyhint="search" aria-label="站内搜索"
                       data-form-type="other" data-lpignore="true" data-1p-ignore
                       x-model="search" @keydown.enter="doSearch()" @focus="startZenTimer()" @blur="clearZenTimer()" @input="onSearchInput()" :placeholder="getSearchPlaceholder()" class="search-input w-full h-14 pl-14 pr-14 rounded-2xl text-lg outline-none shadow-2xl backdrop-blur-md relative z-10">
                <div class="absolute left-0 top-0 h-14 w-14 flex items-center justify-center opacity-40 pointer-events-none z-20"><i class="fa-solid fa-magnifying-glass text-lg"></i></div>
                <div x-show="search" @click="search = ''; $refs.searchInput.focus()" class="absolute right-0 top-0 h-14 w-14 flex items-center justify-center opacity-40 cursor-pointer hover:opacity-100 transition z-20"><i class="fa-solid fa-times"></i></div>
            </div>
        </div>

        <div id="groups-container" class="space-y-8 transition-all duration-500" :class="{ 'zen-hidden': zenMode }">
            <template x-for="group in filteredGroups" :key="group.id + '#' + (gridRev['__groups__'] || 0)">
                <div class="group-container transition-all duration-300" :data-id="group.id" x-data="{ collapsed: false }">
                    <div class="flex items-center justify-between mb-3 px-1 group/header select-none">
                        <div class="flex items-center gap-3 cursor-pointer opacity-80 hover:opacity-100 transition" @click="collapsed = !collapsed">
                            <i class="fa-solid fa-chevron-down text-xs transition-transform duration-300" :class="collapsed ? '-rotate-90' : ''" style="color: var(--text-secondary)"></i>
                            <h2 class="text-lg font-bold tracking-tight flex items-center gap-2" style="color: var(--text-primary)"><span x-text="group.name"></span><i x-show="group.isPrivate" class="fa-solid fa-lock text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full"></i></h2>
                            <template x-if="editMode && !search"><div class="cursor-move handle-group p-1.5 bg-white/10 rounded text-xs transition text-indigo-400" @click.stop><i class="fa-solid fa-grip-vertical"></i></div></template>
                        </div>
                        <template x-if="editMode"><button @click="editGroup(group)" class="w-6 h-6 rounded flex items-center justify-center bg-white/5 hover:bg-white/10 transition" style="color: var(--text-secondary)"><i class="fa-solid fa-pen text-xs"></i></button></template>
                    </div>

                    <div class="group-content" :style="collapsed ? 'max-height: 0px; opacity: 0' : 'max-height: 3000px; opacity: 1'">
                        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sortable-items min-h-[10px]" 
                             :data-group-id="group.id"
                             x-init="initSortable($el)">
                            
                            <template x-for="link in group.items" :key="linkKey(group.id, link.id)">
                                <div class="nav-card rounded-xl p-3.5 flex items-center gap-3 cursor-pointer select-none h-full group relative" :data-id="link.id" @click="!editMode && openLink(link.url)" @contextmenu.prevent.stop="showContextMenu($event, link, group.id)">
                                    <img :src="link.iconUrl || getFavicon(link.url)" class="link-icon rounded-lg bg-gray-500/5 p-0.5" loading="lazy" @error="fallbackIcon($event, link)">
                                    <div class="min-w-0 flex-1 relative">
                                        <div class="font-semibold text-[13px] truncate leading-tight mb-0.5 flex items-center gap-1.5" style="color: var(--text-primary)"><span x-text="link.title"></span><i x-show="link.isPrivate" class="fa-solid fa-lock text-[8px] text-amber-500"></i></div>
                                        <div class="text-[10px] truncate opacity-60 font-medium" style="color: var(--text-secondary)" x-text="link.desc || getDomain(link.url)"></div>
                                    </div>
                                    <div x-show="editMode" class="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400 opacity-50"><i class="fa-solid fa-grip-lines"></i></div>
                                </div>
                            </template>
                            <template x-if="editMode && !search"><div @click="openLinkModal(group.id)" class="rounded-xl border border-dashed border-gray-500/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 cursor-pointer flex flex-col items-center justify-center gap-1 opacity-50 hover:opacity-100 transition duration-300 min-h-[70px] group" style="color: var(--text-secondary)"><i class="fa-solid fa-plus text-xs group-hover:text-indigo-400"></i></div></template>
                        </div>
                    </div>
                </div>
            </template>
        </div>
        <div x-show="filteredGroups.length === 0 && !zenMode" class="text-center py-20 opacity-40">
            <div x-cloak><i class="fa-brands fa-space-awesome text-6xl mb-6 animate-pulse"></i><p class="text-sm tracking-wide" x-text="searchHint"></p><button x-show="isLoggedIn && !search" @click="openGroupModal()" class="mt-6 px-6 py-2 rounded-full bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition text-sm font-bold">开始构建</button><button x-show="search" @click="search=''; updateSortableState(); $refs.searchInput.focus()" class="mt-6 px-6 py-2 rounded-full bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition text-sm font-bold">清空搜索</button></div>
        </div>
    </main>
    
    <footer class="text-center pb-8 relative z-0 transition-opacity duration-500" :class="{ 'opacity-0 pointer-events-none': zenMode }"><a href="https://github.com/jinhuaitao/NAV" target="_blank" class="text-xs font-mono opacity-30 hover:opacity-100 transition-opacity" style="color: var(--text-secondary)">Nexus v${APP_VERSION}</a></footer>

    <div x-show="menu.show" :style="\`top: \${menu.y}px; left: \${menu.x}px\`" class="context-menu" @click.outside="closeMenu()" x-cloak>
        <div class="menu-item" @click="menuEdit()"><i class="fa-solid fa-pen w-4 opacity-60"></i> 编辑</div>
        <div class="menu-item" @click="menuCopy()"><i class="fa-solid fa-link w-4 opacity-60"></i> 复制链接</div>
        <div class="h-px bg-white/10 my-1"></div>
        <div class="menu-item danger" @click="deleteLink(menu.targetLink?.id, menu.targetGroupId)"><i class="fa-solid fa-trash w-4 opacity-60"></i> 移除</div>
    </div>

    <div x-show="modals.memo" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" x-cloak x-transition.opacity @click.self="modals.memo = false">
        <div class="glass-panel p-6 rounded-2xl w-full max-w-lg h-[60vh] flex flex-col" style="background: var(--modal-bg)">
            <div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold flex items-center gap-2" style="color: var(--text-primary)"><i class="fa-solid fa-note-sticky text-yellow-400"></i> 快速便签</h3><div class="text-xs opacity-50" x-text="status.saving ? '保存中...' : '自动保存'"></div></div>
            <textarea x-model="settings.memo" @input.debounce.1000ms="saveSettings()" class="memo-area w-full flex-1 text-base p-4 rounded-xl bg-gray-500/5 text-white/90" placeholder="写下你的想法..."></textarea>
            <div class="mt-4 flex justify-end"><button @click="modals.memo = false" class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20">关闭</button></div>
        </div>
    </div>

    <!-- 🟢 按需渲染（x-if 而不是 x-show）：登录弹窗绝不能常驻 DOM。
         它里面有一个密码输入框（type 由 :type="pwdVisible ? 'text' : 'password'" 绑定，默认仍是 password）。
         浏览器（尤其 Chrome 的密码管理器）一旦在页面上扫到密码框，
         就会去找「用户名输入框」准备自动填充 —— 而隐藏的字段会被它跳过，
         于是它挑中了页面上第一个可见的文本框：顶部搜索框。
         这就是「每次刷新账号被填进搜索框」的根因。关掉弹窗时整个 DOM 都不存在，浏览器无从下手。

         ⚠️ 关闭方式是「遮罩层 @click.self」，**不能用 @click.away**：
         .away 会挂一个 document 级监听；而 x-if 插入的新节点 _x_isShown 是 undefined
         （x-show 会把它管成 false），判定式「_x_isShown !== false」因此成立 ——
         于是「打开弹窗的那一次点击」冒泡到 document 时，会被刚注册的 .away 监听当场捕获，
         弹窗开了又立刻被关掉，表现就是「点击登录按钮没有反应」。
         @click.self 只认「点到遮罩本身」，不注册任何全局监听，从根上避开这个时序陷阱。 -->
    <template x-if="modals.login">
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-pop" @click.self="!needsSetup && closeLogin()">
            <div class="glass-panel auth-card rounded-3xl w-full max-w-[360px] relative overflow-hidden" style="background: var(--modal-bg)">
                <div class="auth-glow"></div>
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                <button type="button" x-show="!needsSetup" @click="closeLogin()" aria-label="关闭" title="关闭 (Esc)" class="auth-close absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition z-10"><i class="fa-solid fa-xmark text-sm"></i></button>

                <div class="relative px-7 pt-7 pb-7">
                    <!-- 品牌区：沿用顶部栏那枚徽标的语言（fa-atom + indigo→purple 渐变），
                         让弹窗一眼看上去就属于这个站点，而不是一个孤立的表单。 -->
                    <div class="flex flex-col items-center text-center mb-6">
                        <div class="auth-badge w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 ring-1 ring-white/20 mb-3.5"><i class="fa-solid fa-atom text-2xl"></i></div>
                        <h2 class="text-lg font-bold tracking-tight" style="color: var(--text-primary)" x-text="needsSetup ? '初始化管理员' : '欢迎回来'"></h2>
                        <p class="text-[11px] leading-relaxed mt-1.5 max-w-[250px]" style="color: var(--text-secondary)" x-text="needsSetup ? '创建第一个管理员账号，用于管理导航、便签与设置' : '登录后可编辑导航、使用便签并云端同步'"></p>
                    </div>

                    <form @submit.prevent="handleAuth" class="space-y-3">
                        <div class="auth-field">
                            <i class="fa-solid fa-user auth-field-icon"></i>
                            <input type="text" x-model="authForm.username" autocomplete="username" aria-label="用户名" placeholder="用户名" class="search-input auth-input w-full py-3.5 rounded-xl text-sm" required>
                        </div>
                        <div class="auth-field">
                            <i class="fa-solid fa-lock auth-field-icon"></i>
                            <input :type="pwdVisible ? 'text' : 'password'" x-model="authForm.password" autocomplete="current-password" aria-label="密码" placeholder="密码" class="search-input auth-input auth-input-pwd w-full py-3.5 rounded-xl text-sm" required @keyup="checkCaps($event)" @keydown="checkCaps($event)">
                            <button type="button" @click="pwdVisible = !pwdVisible" aria-label="显示或隐藏密码" tabindex="-1" class="auth-eye"><i class="fa-solid text-xs" :class="pwdVisible ? 'fa-eye-slash' : 'fa-eye'"></i></button>
                        </div>

                        <p x-show="capsOn" class="auth-hint auth-hint-warn"><i class="fa-solid fa-triangle-exclamation"></i><span>大写锁定（Caps Lock）已开启</span></p>

                        <div x-show="tsCfg.enabled" class="pt-0.5">
                            <div x-ref="tsBox" class="flex justify-center min-h-[65px]"></div>
                        </div>

                        <div x-show="tsError" class="auth-hint auth-hint-error"><i class="fa-solid fa-circle-exclamation"></i><span x-text="tsError"></span></div>
                        <div x-show="tsServerMsg" class="auth-hint auth-hint-warn"><i class="fa-solid fa-circle-info"></i><span x-text="tsServerMsg"></span></div>
                        <button type="button" x-show="tsError || tsServerMsg" @click="openDiagnose()" class="block w-full text-[11px] underline decoration-dotted underline-offset-2 opacity-60 hover:opacity-100 transition" style="color: var(--text-secondary)">运行人机验证自检（无需登录）</button>

                        <button type="submit" class="auth-submit w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/25 transition transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2" :disabled="status.submitting">
                            <i x-show="status.submitting" class="fa-solid fa-circle-notch fa-spin"></i>
                            <span x-text="status.submitting ? (needsSetup ? '正在初始化…' : '正在验证…') : (needsSetup ? '创建并进入' : '登录控制台')"></span>
                        </button>
                    </form>

                    <p class="text-[10px] leading-relaxed text-center mt-4" style="color: var(--text-secondary)" x-text="needsSetup ? '这是首次设置，凭据会保存到你自己的 Cloudflare R2，请妥善保管。' : '凭据仅保存在你自己的 Cloudflare 部署中，不会上传到第三方。'"></p>
                </div>
            </div>
        </div>
    </template>

    <div x-show="modals.link" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" x-cloak x-transition.opacity @click.self="modals.link = false">
        <div class="glass-panel p-6 rounded-2xl w-full max-w-md relative" style="background: var(--modal-bg)">
            <h3 class="text-lg font-bold mb-6" style="color: var(--text-primary)" x-text="linkForm.id ? '编辑信标' : '新建信标'"></h3>
            <div class="space-y-4">
                <div class="relative"><input type="text" x-model="linkForm.url" @blur="fetchMetadata()" placeholder="https://" class="search-input w-full p-3 pl-10 rounded-xl" :class="{'border-indigo-500': status.fetchingMeta}"><i class="fa-solid fa-globe absolute left-3.5 top-3.5 opacity-40"></i><div x-show="status.fetchingMeta" class="absolute right-3 top-3.5 text-indigo-400 animate-spin"><i class="fa-solid fa-circle-notch"></i></div></div>
                <input type="text" x-model="linkForm.title" placeholder="标题 (自动获取)" class="search-input w-full p-3 rounded-xl">
                <input type="text" x-model="linkForm.desc" placeholder="描述 (可选)" class="search-input w-full p-3 rounded-xl">
                <div class="relative"><select x-model="linkForm.groupId" class="search-input w-full p-3 pl-10 rounded-xl appearance-none cursor-pointer" style="background-color: var(--modal-bg)"><template x-for="g in groups" :key="g.id"><option :value="g.id" x-text="g.name"></option></template></select><i class="fa-solid fa-folder absolute left-3.5 top-3.5 opacity-40 pointer-events-none"></i><i class="fa-solid fa-chevron-down absolute right-3.5 top-3.5 opacity-40 pointer-events-none text-xs"></i></div>
                <div class="flex gap-3"><div class="flex-1 relative"><input type="text" x-model="linkForm.iconUrl" placeholder="图标 URL" class="search-input w-full p-3 pl-9 rounded-xl text-sm"><img :src="linkForm.iconUrl || 'about:blank'" class="absolute left-2.5 top-2.5 w-5 h-5 rounded object-contain opacity-50" onerror="this.style.display='none'" onload="this.style.display='block'"></div><div class="flex items-center justify-center px-4 rounded-xl cursor-pointer border transition select-none" :class="linkForm.isPrivate ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' : 'border-gray-500/20 bg-gray-500/5 text-gray-400'" @click="linkForm.isPrivate = !linkForm.isPrivate" title="隐私模式"><i class="fa-solid" :class="linkForm.isPrivate ? 'fa-lock' : 'fa-lock-open'"></i></div></div>
            </div>
            <div class="mt-8 flex gap-3"><button @click="modals.link = false" class="flex-1 py-3 rounded-xl bg-gray-500/10 hover:bg-gray-500/20 transition font-medium" style="color: var(--text-secondary)">取消</button><button @click="saveLink()" class="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20">保存</button></div>
        </div>
    </div>

    <div x-show="modals.group" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" x-cloak x-transition.opacity @click.self="modals.group = false">
        <div class="glass-panel p-6 rounded-2xl w-full max-w-sm" style="background: var(--modal-bg)">
            <h3 class="text-lg font-bold mb-6" style="color: var(--text-primary)" x-text="groupForm.id ? '重构区域' : '开拓新区域'"></h3>
            <div class="space-y-4 mb-6">
                <input type="text" x-model="groupForm.name" placeholder="区域名称" class="search-input w-full p-3.5 rounded-xl font-bold text-center" @keydown.enter="saveGroup()">
                <div @click="groupForm.isPrivate = !groupForm.isPrivate" class="p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition select-none" :class="groupForm.isPrivate ? 'border-amber-500/50 bg-amber-500/10' : 'border-gray-500/20 bg-gray-500/5'"><div class="w-5 h-5 rounded-full border flex items-center justify-center" :class="groupForm.isPrivate ? 'bg-amber-500 border-amber-500 text-black' : 'border-gray-500 text-transparent'"><i class="fa-solid fa-check text-[10px]"></i></div><span class="text-sm font-medium" :class="groupForm.isPrivate ? 'text-amber-500' : 'text-gray-500'">设为私有 (隐形模式)</span></div>
            </div>
            <div class="flex gap-3"><button @click="deleteGroup()" x-show="groupForm.id" class="px-4 py-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition"><i class="fa-solid fa-trash"></i></button><div class="flex-1"></div><button @click="modals.group = false" class="px-5 py-3 rounded-xl bg-gray-500/10 hover:bg-gray-500/20 transition" style="color: var(--text-secondary)">取消</button><button @click="saveGroup()" class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg">确认</button></div>
        </div>
    </div>

    <!-- 🟢 同样按需渲染：设置面板里有一个密码输入框（Turnstile Secret Key）。
         只要它常驻 DOM，浏览器就会在每次刷新时扫到密码框、进而去找「用户名输入框」，
         最后还是把账号灌进顶部搜索框。这里没有 $refs、没有外部组件要挂载，整块 x-if 零副作用。 -->
    <template x-if="modals.settings">
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-pop" @click.self="modals.settings = false">
        <div class="glass-panel p-6 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" style="background: var(--modal-bg)">
            <h3 class="text-lg font-bold mb-6" style="color: var(--text-primary)">系统设置</h3>
            <div class="space-y-6">
                <div class="p-4 rounded-xl bg-gray-500/5 border border-gray-500/10">
                    <label class="text-xs font-bold uppercase tracking-wider mb-3 block opacity-50" style="color: var(--text-secondary)">背景源</label>
                    <div class="flex gap-2 mb-3">
                        <button @click="settings.bgType = 'bing'" class="flex-1 py-2 rounded-lg text-xs font-medium transition border" :class="settings.bgType === 'bing' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-500/20 hover:bg-gray-500/10'" style="color: var(--text-secondary)">Bing Image</button>
                        <button @click="settings.bgType = 'custom'" class="flex-1 py-2 rounded-lg text-xs font-medium transition border" :class="settings.bgType === 'custom' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-500/20 hover:bg-gray-500/10'" style="color: var(--text-secondary)">Custom URL</button>
                    </div>
                    <input x-show="settings.bgType === 'custom'" type="text" x-model="settings.customBg" autocomplete="off" spellcheck="false" placeholder="Image or Video (.mp4) URL" class="search-input w-full p-2.5 rounded-lg text-xs">
                </div>
                <div class="p-4 rounded-xl bg-gray-500/5 border border-gray-500/10">
                    <label class="text-xs font-bold uppercase tracking-wider mb-3 block opacity-50" style="color: var(--text-secondary)">视觉 & 布局</label>
                    <div class="flex gap-2 mb-4">
                        <button @click="settings.layoutWidth = 'center'" class="flex-1 py-2 rounded-lg text-xs font-medium transition border" :class="settings.layoutWidth !== 'wide' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-500/20 hover:bg-gray-500/10'" style="color: var(--text-secondary)">标准居中</button>
                        <button @click="settings.layoutWidth = 'wide'" class="flex-1 py-2 rounded-lg text-xs font-medium transition border" :class="settings.layoutWidth === 'wide' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-500/20 hover:bg-gray-500/10'" style="color: var(--text-secondary)">宽屏模式</button>
                    </div>
                    <div class="space-y-5">
                        <div><div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>顶部栏透明度</span> <span x-text="(settings.headerOpacity ?? 75) + '%'"></span></div><input type="range" x-model="settings.headerOpacity" min="0" max="100" step="5" class="w-full h-1.5 bg-gray-500/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"></div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>图标大小</span> <span x-text="settings.iconSize + 'px'"></span></div><input type="range" x-model="settings.iconSize" min="20" max="64" class="w-full h-1.5 bg-gray-500/20 rounded-lg appearance-none cursor-pointer accent-indigo-500" @input="updateCSSVars()"></div>
                            <div><div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>背景模糊</span> <span x-text="settings.blur + 'px'"></span></div><input type="range" x-model="settings.blur" max="20" class="w-full h-1.5 bg-gray-500/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>图标透明度</span> <span x-text="settings.iconOpacity + '%'"></span></div><input type="range" x-model="settings.iconOpacity" min="10" max="100" step="5" class="w-full h-1.5 bg-gray-500/20 rounded-lg appearance-none cursor-pointer accent-indigo-500" @input="updateCSSVars()"></div>
                            <div><div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>卡片浓度</span> <span x-text="settings.cardOpacity + '%'"></span></div><input type="range" x-model="settings.cardOpacity" min="0" max="100" step="5" class="w-full h-1.5 bg-gray-500/20 rounded-lg appearance-none cursor-pointer accent-indigo-500" @input="updateCSSVars()"></div>
                        </div>
                        <div class="flex items-center justify-between"><span class="text-xs" style="color: var(--text-secondary)">浅色模式保留壁纸</span><div class="relative inline-block w-9 h-5 align-middle select-none transition duration-200 ease-in"><input type="checkbox" id="bg-toggle" x-model="settings.showBgInLight" class="absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300" :class="settings.showBgInLight ? 'right-0 border-indigo-500' : 'right-4 border-gray-300'"/><label for="bg-toggle" class="block overflow-hidden h-5 rounded-full cursor-pointer transition-colors" :class="settings.showBgInLight ? 'bg-indigo-500' : 'bg-gray-300'"></label></div></div>
                    </div>
                </div>
                <div class="p-4 rounded-xl bg-gray-500/5 border border-gray-500/10">
                    <label class="text-xs font-bold uppercase tracking-wider mb-3 block opacity-50" style="color: var(--text-secondary)">自定义搜索引擎</label>
                    <input type="text" x-model="settings.customSearchUrl" autocomplete="off" spellcheck="false" placeholder="https://www.example.com/search?q=" class="search-input w-full p-2.5 rounded-lg text-xs mb-2">
                    <p class="text-[10px] leading-relaxed" style="color: var(--text-secondary)">填写搜索地址前缀，关键词会自动拼接在末尾。在顶部搜索栏选择「自定义」引擎后生效。</p>
                </div>
                <div class="p-4 rounded-xl bg-gray-500/5 border border-gray-500/10">
                    <div class="flex items-center justify-between mb-3">
                        <label class="text-xs font-bold uppercase tracking-wider opacity-50" style="color: var(--text-secondary)">人机验证 (Turnstile)</label>
                        <span class="text-[10px] px-2 py-0.5 rounded-full border" :class="ts.badgeClass" x-text="ts.badgeText"></span>
                    </div>
                    <div class="space-y-3">
                        <div>
                            <div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>Site Key</span><span x-show="ts.siteKeySet" class="font-mono" x-text="ts.siteKeyMasked"></span></div>
                            <input type="text" x-model="ts.form.siteKey" autocomplete="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore :placeholder="ts.siteKeySet ? '已配置（留空则不修改）' : '0x4AAA...'" class="search-input w-full p-2.5 rounded-lg text-xs font-mono">
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1.5" style="color: var(--text-secondary)"><span>Secret Key</span><span x-show="ts.secretKeySet" class="font-mono" x-text="ts.secretKeyMasked"></span></div>
                            <!-- autocomplete="new-password" 明确告诉浏览器「这是一个新密钥，不是登录口令」：
                                 既不会被保存的账号自动填充，也不会触发「是否保存密码」的提示条。
                                 配合三个密码管理器的忽略标记，避免它们往这里塞自动填充图标。 -->
                            <input type="password" x-model="ts.form.secretKey" autocomplete="new-password" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore :placeholder="ts.secretKeySet ? '已配置（留空则不修改）' : '0x4AAA...'" class="search-input w-full p-2.5 rounded-lg text-xs font-mono">
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-xs" style="color: var(--text-secondary)">容错模式</span>
                            <div class="flex gap-2">
                                <button @click="ts.form.mode = 'strict'" class="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition" :class="ts.form.mode === 'strict' ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-500/20'" style="color: var(--text-secondary)">严格</button>
                                <button @click="ts.form.mode = 'lenient'" class="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition" :class="ts.form.mode === 'lenient' ? 'bg-amber-600 border-amber-600 text-white' : 'border-gray-500/20'" style="color: var(--text-secondary)">宽松</button>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button @click="saveTurnstile()" class="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">保存验证配置</button>
                            <button @click="diagnoseTurnstile()" class="px-3 py-2.5 rounded-lg bg-gray-500/10 hover:bg-gray-500/20 text-xs font-bold transition" style="color: var(--text-secondary)">自检</button>
                            <button @click="clearTurnstile()" x-show="ts.siteKeySet || ts.secretKeySet" class="px-3 py-2.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold transition">清空</button>
                        </div>
                        <p x-show="ts.result" class="text-[11px] leading-relaxed p-2.5 rounded-lg bg-black/20 break-words" :class="ts.resultOk ? 'text-emerald-400' : 'text-amber-400'" x-text="ts.result"></p>
                        <p class="text-[10px] leading-relaxed" style="color: var(--text-secondary)">密钥保存在 R2 的 <code>sys_settings</code>（<b>未加密</b>）；如更看重静态加密，可改用环境变量 <code>TURNSTILE_SITE_KEY</code> / <code>TURNSTILE_SECRET_KEY</code>。<b>保存后立即生效</b>（登录弹窗每次打开都会实时拉取配置，无需刷新页面）。若配错导致登不进去，可在控制台给 R2 加对象 <code>sys_turnstile_off = 1</code> 应急关闭。</p>
                    </div>
                </div>
                <div class="flex flex-col gap-3">
                     <label class="w-full py-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 text-xs font-bold text-center cursor-pointer transition border border-orange-500/20"><i class="fa-brands fa-chrome mr-1"></i> 导入 Chrome/Edge 书签<input type="file" class="hidden" accept=".html" @change="importBookmarks($event)"></label>
                    <div class="flex gap-3"><button @click="exportData()" class="flex-1 py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-xs font-bold transition border border-blue-500/20"><i class="fa-solid fa-download mr-1"></i> 备份</button><label class="flex-1 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-bold text-center cursor-pointer transition border border-emerald-500/20"><i class="fa-solid fa-upload mr-1"></i> 恢复<input type="file" class="hidden" accept=".json" @change="importData($event)"></label></div>
                </div>
            </div>
            <div class="flex gap-3 mt-6"><button @click="resetSettings()" class="px-5 py-3.5 rounded-xl bg-gray-500/10 hover:bg-gray-500/20 text-sm font-bold transition" style="color: var(--text-secondary)">恢复默认</button><button @click="saveSettings(); modals.settings=false" class="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 transition">保存更改</button></div>
        </div>
    </div>
    </template>

    <div x-show="confirmBox.show" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" x-cloak x-transition.opacity @click.self="confirmBox.show = false">
        <div class="glass-panel p-6 rounded-2xl w-full max-w-sm" style="background: var(--modal-bg)">
            <div class="flex items-start gap-3 mb-5">
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" :class="confirmBox.danger ? 'bg-red-500/15 text-red-500' : 'bg-indigo-500/15 text-indigo-400'"><i class="fa-solid" :class="confirmBox.danger ? 'fa-triangle-exclamation' : 'fa-circle-question'"></i></div>
                <div class="min-w-0"><h3 class="text-base font-bold mb-1" style="color: var(--text-primary)" x-text="confirmBox.title"></h3><p class="text-sm leading-relaxed break-words" style="color: var(--text-secondary)" x-text="confirmBox.message"></p></div>
            </div>
            <div class="flex gap-3"><button @click="confirmBox.show = false" class="flex-1 py-2.5 rounded-xl bg-gray-500/10 hover:bg-gray-500/20 transition text-sm font-medium" style="color: var(--text-secondary)">取消</button><button @click="doConfirm()" class="flex-1 py-2.5 rounded-xl text-white text-sm font-bold shadow-lg transition" :class="confirmBox.danger ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'" x-text="confirmBox.okText"></button></div>
        </div>
    </div>

    <div x-show="toast.show" x-transition.move.bottom class="fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full glass-panel z-[100] flex items-center gap-3 shadow-2xl border border-indigo-500/30" x-cloak>
        <i :class="toast.type === 'error' ? 'fa-solid fa-circle-exclamation text-red-500' : 'fa-solid fa-circle-check text-green-500'"></i>
        <span x-text="toast.msg" class="text-sm font-semibold" style="color: var(--text-primary)"></span>
    </div>

    <script>
        function app() {
            return {
                groups: [], search: '', timeStr: '', weather: { temp: null, code: null, icon: null, desc: '' },
                theme: localStorage.getItem('theme') || 'dark', isLoggedIn: false, needsSetup: false, zenMode: false, 
                editMode: false,
                token: localStorage.getItem('nexus_token'),
                status: { loading: true, saving: false, submitting: false, pending: false, fetchingMeta: false },
                modals: { login: false, link: false, group: false, settings: false, memo: false },
                menu: { show: false, x: 0, y: 0, targetLink: null, targetGroupId: null },
                toast: { show: false, msg: '', type: 'success' },
                toastTimer: null,
                confirmBox: { show: false, title: '', message: '', okText: '确认', danger: true, onOk: null },
                tsCfg: (window.TURNSTILE_CFG || { enabled: false, siteKey: '', mode: 'strict' }),
                turnstileToken: '', tsError: '', tsServerMsg: '', tsWidgetId: null, tsPollTimer: null,
                tsWarning: (function () { try { return sessionStorage.getItem('nexus_ts_warning') || ''; } catch (e) { return ''; } })(),
                ts: { form: { siteKey: '', secretKey: '', mode: 'strict' }, siteKeySet: false, secretKeySet: false, siteKeyMasked: '', secretKeyMasked: '', source: 'none', enabled: false, emergencyOff: false, result: '', resultOk: true, badgeText: '未配置', badgeClass: 'border-gray-500/30 text-gray-400' },
                settings: { bgType: 'bing', customBg: '', blur: 0, engine: 'google', customSearchUrl: '', showBgInLight: false, iconSize: 32, layoutWidth: 'center', iconOpacity: 100, cardOpacity: 40, headerOpacity: 75, memo: '' },
                engines: [
                    { name: 'Google', val: 'google', icon: 'fa-brands fa-google', url: 'https://www.google.com/search?q=' },
                    { name: 'Bing', val: 'bing', icon: 'fa-brands fa-microsoft', url: 'https://www.bing.com/search?q=' },
                    { name: 'Baidu', val: 'baidu', icon: 'fa-solid fa-paw', url: 'https://www.baidu.com/s?wd=' },
                    { name: 'Duck', val: 'duck', icon: 'fa-solid fa-duck', url: 'https://duckduckgo.com/?q=' },
                    { name: '自定义', val: 'custom', icon: 'fa-solid fa-wand-magic-sparkles', url: '' }
                ],
                authForm: { username: '', password: '' }, linkForm: { id: null, groupId: null, title: '', url: '', desc: '', iconUrl: '', isPrivate: false }, groupForm: { id: null, name: '', isPrivate: false },
                // 🟢 登录弹窗的交互状态：密码可见性 + 大写锁定提示
                pwdVisible: false, capsOn: false,
                
                zenTimer: null,
                sortableInstances: [], 
                groupSortableInstance: null, 
                saveDebounceTimer: null, 
                // 每个网格的「渲染版本号」。正常排序后不需要动它；
                // 仅当检测到 Alpine x-for 的重排结果与真实 DOM 不一致时自增，
                // 让该网格的 x-for key 全部失效并整块重建，保证顺序 100% 正确。
                gridRev: {}, 

                async init() {
                    // 未登录用户的设置保存在本地，先加载再被服务端设置覆盖（仅登录态）
                    try { const s = JSON.parse(localStorage.getItem('nexus_settings') || 'null'); if (s && typeof s === 'object') this.settings = { ...this.settings, ...s }; } catch(e) {}
                    setInterval(() => { const now = new Date(); this.timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }, 1000);
                    this.fetchWeather(); 
                    await Promise.all([this.checkStatus(), this.syncData('GET')]);
                    if(this.token) await this.verifyToken();
                    this.updateCSSVars(); 
                    
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible' && this.isLoggedIn && !this.status.pending && !this.status.saving) {
                            this.syncData('GET');
                        }
                    });

                    window.addEventListener('beforeunload', (e) => {
                        if(this.status.pending || this.status.saving) {
                            e.preventDefault(); e.returnValue = 'Data pending save. Are you sure?';
                        }
                    });

                    const params = new URLSearchParams(window.location.search);
                    if(params.get('action') === 'search') setTimeout(() => this.$refs.searchInput.focus(), 500);
                    if(params.get('action') === 'memo') setTimeout(() => { if(this.isLoggedIn) this.modals.memo = true; else this.showToast('请先登录使用便签', 'error'); }, 500);

                    // 🟢 兜底防自动填充（v22.7）
                    // 根因已经在弹窗那边解决掉了：登录框改成 <template x-if> 按需渲染，
                    // 页面常驻 DOM 里不再有 <input type="password">，浏览器（Chrome 密码管理器）
                    // 就失去了「找用户名框去填」的入口。
                    // 但个别浏览器 / 密码管理器会在页面稳定之后才灌值，绕过上面那一堆静态属性
                    // （autocomplete=off / data-lpignore / data-1p-ignore ...）的防护，所以这里再补一道
                    // 运行时保险：在用户真正动手操作搜索框之前，只要它出现非空内容，就一律判定为
                    // 自动填充并抹掉（连同 Alpine 状态一起复位，避免 x-model 把脏值带进筛选逻辑）。
                    // 注意：登录框里的账号密码不做同样处理 —— 那是用户主动打开弹窗时
                    // 浏览器替他填的，属于正常便利功能；弹窗关闭后 DOM 整体销毁，不会残留。
                    let searchTouched = false;
                    const searchEl = this.$refs.searchInput;
                    if (searchEl) {
                        const markTouched = () => { searchTouched = true; };
                        ['keydown', 'keypress', 'paste', 'compositionstart', 'pointerdown', 'touchstart'].forEach(ev =>
                            searchEl.addEventListener(ev, markTouched, { passive: true }));
                        const scrubSearch = () => {
                            if (searchTouched) return;
                            const el = this.$refs.searchInput;
                            if (!el) return;
                            if (el.value || this.search) { el.value = ''; this.search = ''; this.updateSortableState(); }
                        };
                        // 多个时间点轮询 + load / pageshow（bfcache 回退时也会重新触发）
                        [200, 800, 2000].forEach(t => setTimeout(scrubSearch, t));
                        window.addEventListener('load', scrubSearch);
                        window.addEventListener('pageshow', scrubSearch);
                    }

                    this.$nextTick(() => { this.initGroupSortable(); this.updateSortableState(); this.status.loading = false; });
                },

                // 🟢 AUTO-SANITIZER: Fixes legacy corrupt data automatically
                sanitizeData(groups) {
                    let changed = false;
                    const idSet = new Set();
                    if (!Array.isArray(groups)) return;
                    groups.forEach(g => {
                        if(!g.id) { g.id = 'g_'+Math.random().toString(36).substr(2,9); changed=true; }
                        if(!Array.isArray(g.items)) { g.items = []; changed = true; }
                        g.items.forEach(i => {
                            if(!i.id || idSet.has(i.id)) {
                                i.id = 'link_'+Math.random().toString(36).substr(2,9);
                                changed = true;
                            }
                            idSet.add(i.id);
                        });
                    });
                    if(changed) { console.log('Data sanitized (fixed IDs)'); this.saveAll(); }
                },

                handleKeydown(e) {
                    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                        if (e.key === 'Escape') {
                            if (document.activeElement === this.$refs.searchInput && this.search) { this.search = ''; this.updateSortableState(); }
                            document.activeElement.blur(); this.closeAllModals();
                        }
                        return;
                    }
                    if (e.key === '/') { e.preventDefault(); this.$refs.searchInput.focus(); }
                    if (e.key === 'Escape') { this.closeAllModals(); this.zenMode = false; if(this.search){ this.search = ''; this.updateSortableState(); } if(this.editMode) this.toggleEditMode(); }
                    if (e.key === 'Z' && e.shiftKey) { this.toggleZen(); }
                    if (e.key === 'N' && e.shiftKey && this.isLoggedIn) { this.modals.memo = true; }
                },
                closeAllModals() { this.closeLogin(); this.modals.link = false; this.modals.group = false; this.modals.settings = false; this.modals.memo = false; this.confirmBox.show = false; this.closeMenu(); },
                toggleZen() { this.zenMode = !this.zenMode; },
                
                toggleEditMode() {
                    this.editMode = !this.editMode;
                    this.$nextTick(() => { this.updateSortableState(); });
                    if(this.editMode) this.showToast('已进入编辑模式');
                    else this.showToast('已退出编辑模式');
                },

                updateSortableState() {
                    const isDisabled = !this.editMode || !!this.search;
                    if (this.groupSortableInstance) this.groupSortableInstance.option('disabled', isDisabled);
                    // 顺带清理已从 DOM 移除的实例，避免筛选/重建后实例无限累积
                    this.sortableInstances = this.sortableInstances.filter(inst => {
                        const el = inst && inst.el;
                        if (!el || !el.isConnected) { try { inst.destroy(); } catch(e) {} return false; }
                        inst.option('disabled', isDisabled);
                        return true;
                    });
                },

                startZenTimer() { if (this.zenMode || this.search) return; this.clearZenTimer(); this.zenTimer = setTimeout(() => { if (!this.zenMode && !this.search && document.activeElement === this.$refs.searchInput) { this.zenMode = true; } }, 3000); },
                clearZenTimer() { if (this.zenTimer) { clearTimeout(this.zenTimer); this.zenTimer = null; } },
                onSearchInput() { this.clearZenTimer(); this.updateSortableState(); },

                setEngine(val) { this.settings.engine = val; this.saveSettings(); },

                async fetchWeather() { 
                    if (window.CF_COORDS && window.CF_COORDS.lat) { this.getWeather(window.CF_COORDS.lat, window.CF_COORDS.lon); return; }
                    if (!navigator.geolocation) return; 
                    navigator.geolocation.getCurrentPosition(async (pos) => { this.getWeather(pos.coords.latitude, pos.coords.longitude); }); 
                },
                async getWeather(lat, lon) {
                    try { 
                        const res = await fetch(\`https://api.open-meteo.com/v1/forecast?latitude=\${lat}&longitude=\${lon}&current_weather=true\`); 
                        const data = await res.json(); 
                        if(data.current_weather) {
                            this.weather.temp = Math.round(data.current_weather.temperature);
                            this.weather.code = data.current_weather.weathercode;
                            const info = this.getWeatherIcon(this.weather.code);
                            this.weather.icon = info.url;
                            this.weather.desc = info.desc;
                        }
                    } catch(e) {}
                },
                getWeatherIcon(code) {
                    const base = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/";
                    let icon = "2600.png"; let desc = "晴";
                    if ([1, 2, 3].includes(code)) { icon = "26c5.png"; desc = "多云"; } 
                    else if ([45, 48].includes(code)) { icon = "1f32b.png"; desc = "雾"; } 
                    else if ([51, 53, 55, 61, 63, 65].includes(code)) { icon = "1f327.png"; desc = "小雨"; } 
                    else if ([71, 73, 75, 77, 85, 86].includes(code)) { icon = "2744.png"; desc = "雪"; } 
                    else if ([80, 81, 82].includes(code)) { icon = "1f326.png"; desc = "阵雨"; } 
                    else if ([95, 96, 99].includes(code)) { icon = "26c8.png"; desc = "雷雨"; } 
                    return { url: base + icon, desc: desc };
                },
                
                updateCSSVars() { 
                    document.documentElement.style.setProperty('--icon-size', this.settings.iconSize + 'px'); 
                    document.documentElement.style.setProperty('--icon-opacity', (this.settings.iconOpacity ?? 100) / 100);
                    const cardOp = (this.settings.cardOpacity ?? 40) / 100;
                    document.documentElement.style.setProperty('--card-opacity', cardOp);
                    document.documentElement.style.setProperty('--hover-opacity', Math.min(cardOp + 0.3, 1));
                },
                toggleTheme() { this.theme = this.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', this.theme); const m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', this.theme === 'light' ? '#f8fafc' : '#0f172a'); },

                // 🟢 搜索框即时本地筛选（分组名 / 标题 / 描述 / 网址），原实现直接返回全部导致筛选失效
                get filteredGroups() {
                    const q = (this.search || '').trim().toLowerCase();
                    if (!q) return this.groups;
                    const hit = (s) => String(s == null ? '' : s).toLowerCase().includes(q);
                    return this.groups.map(g => {
                        const groupHit = hit(g.name);
                        const items = (g.items || []).filter(i => groupHit || hit(i.title) || hit(i.desc) || hit(i.url));
                        return { ...g, items };
                    }).filter(g => g.items.length > 0);
                },
                get searchHint() { return (this.search || '').trim() ? '没有匹配的结果，按回车可去搜索引擎查找' : '你的数字宇宙空空如也'; },
                get bgUrl() { if (this.settings.bgType === 'custom' && this.settings.customBg && !this.isVideoBg) return this.settings.customBg; return 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN'; },
                get isVideoBg() { return this.settings.bgType === 'custom' && !!this.settings.customBg && /\\.(mp4|webm|ogg|mov)(\\?.*)?$/i.test(this.settings.customBg); },
                getSearchPlaceholder() {
                    const e = this.engines.find(x => x.val === this.settings.engine) || this.engines[0];
                    if (e.val === 'custom') return this.settings.customSearchUrl ? '使用自定义引擎搜索...' : '请先在「系统设置」填写自定义搜索地址';
                    return 'Search with ' + e.name + '...';
                },

                initGroupSortable() { 
                    const el = document.getElementById('groups-container'); if(!el) return;
                    if(this.groupSortableInstance) { try { this.groupSortableInstance.destroy(); } catch(e) {} this.groupSortableInstance = null; }
                    this.groupSortableInstance = new Sortable(el, { 
                        animation: 150, handle: '.handle-group', draggable: '.group-container',
                        disabled: !this.editMode, ghostClass: 'sortable-ghost-group',
                        forceFallback: true, fallbackOnBody: true,
                        onEnd: (evt) => { 
                            if (!evt || !evt.to || !evt.item) return;
                            // 以拖放后的真实 DOM 顺序为准（<template> 等无 data-id 的节点会被过滤掉）
                            const domIds = Array.from(evt.to.children)
                                .map(c => c.dataset && c.dataset.id).filter(Boolean).map(String);
                            if (!domIds.length) return;
                            const pos = new Map(domIds.map((id, i) => [id, i]));
                            const BIG = Number.MAX_SAFE_INTEGER;
                            this.groups.sort((a, b) => {
                                const ia = pos.has(String(a.id)) ? pos.get(String(a.id)) : BIG;
                                const ib = pos.has(String(b.id)) ? pos.get(String(b.id)) : BIG;
                                return ia - ib;
                            });
                            this.saveAll(); 
                            this.verifyGroupOrder();
                        } 
                    }); 
                },

                initSortable(el) { 
                    if(el._sortable) return;
                    const inst = new Sortable(el, { 
                        group: 'shared-links', animation: 200, delay: 100, delayOnTouchOnly: true, 
                        disabled: !this.editMode, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
                        forceFallback: true, // 🟢 CORE FIX: Software Rendering (No Ghosting/Lag)
                        fallbackOnBody: true,
                        swapThreshold: 0.5,
                        onEnd: (evt) => { 
                            if (!evt || !evt.to || !evt.from || !evt.item) return; 
                            const fromGroupId = String(evt.from.dataset.groupId || '');
                            const toGroupId = String(evt.to.dataset.groupId || '');
                            const fromGroup = this.groups.find(g => String(g.id) === fromGroupId);
                            const toGroup = this.groups.find(g => String(g.id) === toGroupId);
                            if (!fromGroup || !toGroup) return;

                            // 1) 拖放后的真实 DOM 顺序（过滤掉「+ 新增卡片」占位符等无 data-id 的节点）
                            const domOrder = Array.from(evt.to.children)
                                .map(c => c.dataset && c.dataset.id).filter(Boolean).map(String);

                            // 2) 从来源分组摘掉被拖动的项
                            const movedItemId = String(evt.item.dataset.id || '');
                            const movedItem = fromGroup.items.find(i => String(i.id) === movedItemId);
                            if (!movedItem) return;
                            fromGroup.items = fromGroup.items.filter(i => String(i.id) !== movedItemId);

                            // 3) 放进目标分组（同组内拖动时 fromGroup === toGroup）
                            if (fromGroup !== toGroup) toGroup.items = toGroup.items.filter(i => String(i.id) !== movedItemId);
                            toGroup.items.push(movedItem);

                            // 4) 按 DOM 顺序重排目标分组；未出现在 DOM 里的项按原顺序兜底追加，避免丢数据
                            const pool = new Map(toGroup.items.map(i => [String(i.id), i]));
                            const ordered = [];
                            domOrder.forEach(id => { if (pool.has(id)) { ordered.push(pool.get(id)); pool.delete(id); } });
                            toGroup.items = ordered.concat(Array.from(pool.values()));

                            // 5) 组内拖动：告诉 Alpine「顺序已经是你看到的样子了」，让它零操作。
                            //    见 syncXForKeys 的注释说明为什么必须这样做。
                            //    跨组拖动则交给 Alpine 原生的「移除 + 新增」路径，它会重建卡片并修正作用域链。
                            if (fromGroup === toGroup) {
                                const finalIds = toGroup.items.map(i => String(i.id));
                                const sameAsDom = finalIds.length === domOrder.length && finalIds.every((id, i) => id === domOrder[i]);
                                if (sameAsDom) this.syncXForKeys(evt.to, toGroupId, finalIds);
                            }

                            this.saveAll();
                            // 6) 最后再校验一次：万一上面的同步没生效（例如 Alpine 改了内部字段名），
                            //    就强制整块重建该网格，保证顺序 100% 正确。
                            this.verifyGridOrder([fromGroupId, toGroupId]);
                        } 
                    });
                    el._sortable = inst;
                    this.sortableInstances.push(inst);
                },

                // x-for 的 key 表达式。把版本号也编进 key，是为了让 verifyGridOrder 能在必要时
                // 通过提升版本号让所有 key 失效，从而整块重建该网格。
                linkKey(groupId, id) { return String(id) + '@' + (this.gridRev[groupId] || 0); },

                // 🟢 排序稳定性的关键
                // Alpine 的 x-for 重排算法有一个隐含前提：真实 DOM 的顺序 == 它内部记录的 _x_prevKeys。
                // Sortable 已经在 DOM 上把卡片搬好了，如果我们放任不管，x-for 会从一个「不一致」的
                // 状态出发去计算交换序列，从而把顺序算错（回归测试里随机拖 11 次，有 6 次被改错，
                // 这正是「拖动时位置会乱」的第二个根因）。
                // 组内拖动时元素没有被搬去别的分组、作用域链也没变，所以最干净的做法是直接告诉
                // Alpine「你已经是最新顺序了」——它会零操作，DOM 就保持 Sortable 摆好的正确顺序。
                syncXForKeys(gridEl, groupId, orderedIds) {
                    if (!gridEl || !Array.isArray(orderedIds)) return false;
                    const tpl = Array.from(gridEl.children).find(c => c.tagName === 'TEMPLATE' && c.hasAttribute('x-for'));
                    if (!tpl || !Array.isArray(tpl._x_prevKeys)) return false;
                    tpl._x_prevKeys = orderedIds.map(id => this.linkKey(groupId, id));
                    return true;
                },

                // 兜底校验：上面两条路径已经把顺序做对了，但 Alpine 的内部字段毕竟不是公开契约。
                // 这里在 $nextTick 里把真实 DOM 顺序与数据顺序逐一比对，只要对不上就提升该分组的
                // 渲染版本号，让 x-for 的 key 全部失效并整块重建 —— 用一次重建换 100% 正确。
                // 正常路径下这个分支不会触发（回归测试断言了这一点）。
                verifyGridOrder(groupIds) {
                    this.$nextTick(() => {
                        const seen = new Set();
                        (groupIds || []).forEach(raw => {
                            const gid = String(raw || '');
                            if (!gid || seen.has(gid)) return;
                            seen.add(gid);
                            const group = this.groups.find(g => String(g.id) === gid);
                            if (!group) return;
                            let grid = null;
                            document.querySelectorAll('.sortable-items').forEach(el => {
                                if (!grid && el.dataset && String(el.dataset.groupId) === gid) grid = el;
                            });
                            if (!grid) return;
                            const domIds = Array.from(grid.children).map(c => c.dataset && c.dataset.id).filter(Boolean).map(String);
                            const dataIds = (group.items || []).map(i => String(i.id));
                            const ok = domIds.length === dataIds.length && domIds.every((id, i) => id === dataIds[i]);
                            if (!ok) { const next = { ...this.gridRev }; next[gid] = (next[gid] || 0) + 1; this.gridRev = next; }
                        });
                    });
                },

                // 分组顺序的同类兜底校验
                verifyGroupOrder() {
                    this.$nextTick(() => {
                        const el = document.getElementById('groups-container');
                        if (!el) return;
                        const domIds = Array.from(el.children)
                            .filter(c => c.classList && c.classList.contains('group-container'))
                            .map(c => c.dataset && c.dataset.id).filter(Boolean).map(String);
                        const dataIds = this.groups.map(g => String(g.id));
                        const ok = domIds.length === dataIds.length && domIds.every((id, i) => id === dataIds[i]);
                        if (!ok) { const next = { ...this.gridRev }; next['__groups__'] = (next['__groups__'] || 0) + 1; this.gridRev = next; }
                    });
                },

                showContextMenu(e, link, groupId) { if(!this.editMode) return; this.menu.targetLink = link; this.menu.targetGroupId = groupId; let x = e.clientX, y = e.clientY; if (window.innerWidth - x < 190) x -= 180; if (window.innerHeight - y < 160) y -= 150; this.menu.x = Math.max(4, x); this.menu.y = Math.max(4, y); this.menu.show = true; },
                closeMenu() { this.menu.show = false; },
                menuEdit() { this.linkForm = { ...this.menu.targetLink, groupId: this.menu.targetGroupId }; this.modals.link = true; this.closeMenu(); },
                menuCopy() { const url = this.menu.targetLink && this.menu.targetLink.url; if(!url) { this.closeMenu(); return; } const done = () => { this.showToast('链接已复制'); this.closeMenu(); }; if(navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(url).then(done).catch(() => { this.copyFallback(url); done(); }); } else { this.copyFallback(url); done(); } },
                copyFallback(text) { try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch(e) {} },
                async deleteLink(linkId, groupId) { this.askConfirm('删除后不可恢复，确定移除该链接？', async () => { const group = this.groups.find(g => String(g.id) === String(groupId)); if(group) { group.items = group.items.filter(i => String(i.id) !== String(linkId)); await this.saveAll(); this.modals.link = false; this.closeMenu(); this.showToast('已删除'); } }, { okText: '移除' }); },

                openLinkModal(groupId = null) { const defaultGroup = groupId || (this.groups.length > 0 ? this.groups[0].id : null); if(!defaultGroup && !groupId) return this.showToast('请先创建分组', 'error'); this.linkForm = { id: null, groupId: defaultGroup, title: '', url: '', desc: '', iconUrl: '', isPrivate: false }; this.modals.link = true; },
                async fetchMetadata() { if(!this.linkForm.url || this.linkForm.title || this.status.fetchingMeta) return; if (!this.linkForm.url.startsWith('http')) this.linkForm.url = 'https://' + this.linkForm.url; this.status.fetchingMeta = true; try { const res = await fetch('/api/meta?url=' + encodeURIComponent(this.linkForm.url)); if(res.ok) { const data = await res.json(); if(data.title) this.linkForm.title = data.title; if(data.description && !this.linkForm.desc) this.linkForm.desc = data.description.substring(0, 50); if(!this.linkForm.iconUrl) this.linkForm.iconUrl = data.icon || \`https://icons.duckduckgo.com/ip3/\${new URL(this.linkForm.url).hostname}.ico\`; } } catch(e) {} this.status.fetchingMeta = false; },
                
                // 🟢 FIXED: In-Place Edit
                saveLink() { 
                    if(!this.linkForm.url) return this.showToast('请填写网址', 'error');
                    if(!this.linkForm.url.startsWith('http')) this.linkForm.url = 'https://' + this.linkForm.url;
                    let fallbackTitle = this.linkForm.url;
                    try { fallbackTitle = new URL(this.linkForm.url).hostname; } catch(e) { this.showToast('网址格式不正确', 'error'); return; }
                    
                    const newItem = {
                        id: this.linkForm.id || Date.now().toString(),
                        title: this.linkForm.title || fallbackTitle,
                        url: this.linkForm.url,
                        desc: this.linkForm.desc,
                        iconUrl: this.linkForm.iconUrl,
                        isPrivate: this.linkForm.isPrivate
                    };

                    if (this.linkForm.id) {
                        let processed = false;
                        for (let g of this.groups) {
                            const idx = g.items.findIndex(i => String(i.id) === String(this.linkForm.id));
                            if (idx !== -1) {
                                if (String(g.id) === String(this.linkForm.groupId)) {
                                    g.items[idx] = newItem; 
                                    processed = true;
                                } else {
                                    g.items.splice(idx, 1);
                                }
                                break;
                            }
                        }
                        if (!processed) {
                            const targetGroup = this.groups.find(g => String(g.id) === String(this.linkForm.groupId));
                            if (targetGroup) targetGroup.items.push(newItem);
                        }
                    } else {
                        const targetGroup = this.groups.find(g => String(g.id) === String(this.linkForm.groupId));
                        if (targetGroup) targetGroup.items.push(newItem);
                    }

                    this.saveAll();
                    this.modals.link = false;
                },

                openGroupModal() { this.groupForm = { id: null, name: '', isPrivate: false }; this.modals.group = true; }, editGroup(g) { this.groupForm = { ...g }; this.modals.group = true; },
                saveGroup() { 
                    if(!this.groupForm.name) return this.showToast('请填写分组名称', 'error'); 
                    if(this.groupForm.id) { 
                        const g = this.groups.find(x => String(x.id) === String(this.groupForm.id)); 
                        if(g) { g.name = this.groupForm.name; g.isPrivate = this.groupForm.isPrivate; } 
                    } else { 
                        this.groups.push({ id: Date.now().toString(), name: this.groupForm.name, isPrivate: this.groupForm.isPrivate, items: [] }); 
                        this.$nextTick(() => { this.initGroupSortable(); this.updateSortableState(); }); 
                    } 
                    this.saveAll(); this.modals.group = false; 
                },
                deleteGroup() { this.askConfirm('该分组及其中的全部链接都会被删除，且不可恢复。', () => { this.groups = this.groups.filter(x => String(x.id) !== String(this.groupForm.id)); this.saveAll(); this.modals.group = false; this.showToast('分组已删除'); }, { okText: '删除分组' }); },

                async syncData(method, payload = null) { const headers = { 'Content-Type': 'application/json' }; if(this.token) headers['Authorization'] = this.token; if(method === 'POST') this.status.saving = true; try { const res = await fetch('/api/data', { method, headers, body: payload ? JSON.stringify(payload) : null }); if(res.status === 401) { this.logout('登录已过期，请重新登录'); return; } if(method === 'GET') { const data = await res.json(); const raw = Array.isArray(data.data) ? data.data : []; this.groups = (raw.length > 0 && raw[0] && !raw[0].items) ? [{ id: 'default', name: 'Home', isPrivate: false, items: raw }] : raw; if(data.settings && this.token) { this.settings = { ...this.settings, ...data.settings }; this.updateCSSVars(); } this.sanitizeData(this.groups); } else { this.status.pending = false; } } catch(e) { if(method === 'POST') this.status.pending = true; } finally { this.status.saving = false; } },
                
                saveAll() { 
                    if(this.isLoggedIn) { 
                        if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
                        this.status.pending = true; 
                        this.saveDebounceTimer = setTimeout(async () => {
                            await this.syncData('POST', { groups: this.groups, settings: this.settings }); 
                            this.status.pending = false;
                            this.saveDebounceTimer = null;
                        }, 500); 
                    } else {
                        // 未登录：设置（主题/背景/布局/引擎等）本地生效，不再报「请先登录」
                        try { localStorage.setItem('nexus_settings', JSON.stringify(this.settings)); } catch(e) {}
                    }
                }, 
                async saveSettings() { await this.saveAll(); },
                async checkStatus() { try { const res = await fetch('/api/status'); this.needsSetup = !(await res.json()).setup; if(this.needsSetup) { this.modals.login = true; await this.refreshTsCfg(); this.ensureTsScript(); this.$nextTick(() => this.renderTurnstile()); } } catch(e) {} },
                async handleAuth() {
                    this.status.submitting = true;
                    const endpoint = this.needsSetup ? '/api/setup' : '/api/login';
                    const payload = { ...this.authForm, cfToken: this.turnstileToken, cfError: this.tsError };
                    try {
                        const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
                        if(res.ok) {
                            const data = await res.json();
                            this.token = data.token; localStorage.setItem('nexus_token', this.token);
                            this.isLoggedIn = true; this.closeLogin(); this.needsSetup = false; this.authForm.password = '';
                            if (data.warning) { this.tsWarning = data.warning; try { sessionStorage.setItem('nexus_ts_warning', data.warning); } catch(e) {} this.showToast('人机验证已临时放行，请检查配置', 'error'); }
                            else this.showToast('欢迎回来');
                            this.syncData('GET');
                            setTimeout(() => { this.initGroupSortable(); this.updateSortableState(); }, 500);
                        } else if (res.status === 429) {
                            this.showToast('尝试次数过多，请稍后再试', 'error'); this.authForm.password = ''; this.resetTurnstile();
                        } else if (res.status === 403) {
                            const d = await res.json().catch(() => ({}));
                            if (d.error === 'turnstile_failed') {
                                const msg = d.message || '人机验证未通过，请重新完成验证';
                                this.showToast(msg, 'error');
                                // 把服务端的具体原因留在弹窗里：toast 2.5 秒就消失，看不到就无从排查。
                                // 服务端返回的 codes 能区分「没拿到 token」/「token 无效」/「token 过期」三种完全不同的成因。
                                this.tsServerMsg = '服务端判定：' + ((d.codes && d.codes.length) ? d.codes.join(', ') : 'unknown') + '。' + msg;
                            } else { this.showToast('系统已初始化，请直接登录', 'error'); this.needsSetup = false; }
                            this.authForm.password = '';
                            // 只清 token，保留组件自身的错误提示（resetTurnstile() 会把两者一起抹掉）
                            this.turnstileToken = '';
                            try { if (window.turnstile && this.tsWidgetId !== null) window.turnstile.reset(this.tsWidgetId); } catch (e) {}
                        } else {
                            this.showToast('用户名或密码错误', 'error'); this.authForm.password = ''; this.resetTurnstile();
                        }
                    } catch(e) { this.showToast('网络异常，请稍后重试', 'error'); }
                    this.status.submitting = false;
                },
                async verifyToken() { const res = await fetch('/api/check', { headers: { 'Authorization': this.token } }); if(!res.ok) this.logout('登录已过期，请重新登录'); else this.isLoggedIn = true; },
                logout(msg = '已登出') { try { if(this.token) fetch('/api/logout', { method: 'POST', headers: { 'Authorization': this.token } }); } catch(e) {} this.token = null; localStorage.removeItem('nexus_token'); this.isLoggedIn = false; this.editMode = false; this.groups = []; this.syncData('GET'); this.showToast(msg); },

                doSearch() {
                    const q = (this.search || '').trim();
                    if (!q) return;
                    if (q.includes('.') && !q.includes(' ')) { window.open(q.startsWith('http') ? q : 'https://' + q, '_blank', 'noopener,noreferrer'); return; }
                    const engine = this.engines.find(e => e.val === this.settings.engine) || this.engines[0];
                    let base = engine.url;
                    if (engine.val === 'custom' && this.settings.customSearchUrl) base = this.settings.customSearchUrl;
                    if (!base) { this.showToast('请先在「系统设置」填写自定义搜索地址', 'error'); return; }
                    window.open(base + encodeURIComponent(q), '_blank', 'noopener,noreferrer');
                },
                getFavicon(url) { try { return \`https://icons.duckduckgo.com/ip3/\${new URL(url).hostname}.ico\`; } catch { return ''; } }, getDomain(url) { try { return new URL(url).hostname; } catch { return ''; } }, openLink(url) { window.open(url, '_blank', 'noopener,noreferrer'); },
                fallbackIcon(e, link) { const img = e.target; img.onerror = null; const ch = (String((link && link.title) || '?').trim().charAt(0)) || '?'; img.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(ch) + '&background=random&color=fff&rounded=true&size=64'; },
                showToast(msg, type='success') { this.toast.msg = msg; this.toast.type = type; this.toast.show = true; if (this.toastTimer) clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { this.toast.show = false; }, 2500); },
                askConfirm(message, onOk, opts = {}) { this.confirmBox = { show: true, title: opts.title || '请确认', message, okText: opts.okText || '确认', danger: opts.danger !== false, onOk }; },
                doConfirm() { const fn = this.confirmBox.onOk; this.confirmBox.show = false; if (typeof fn === 'function') fn(); },

                // 🟢 登录弹窗：大写锁定提示（getModifierState 在个别浏览器/输入法下可能缺失，故 try 兜底）
                checkCaps(e) { try { this.capsOn = !!(e.getModifierState && e.getModifierState('CapsLock')); } catch (err) { this.capsOn = false; } },

                // 🟢 Turnstile：登录页组件渲染 / 重置
                async openLogin() {
                    this.modals.login = true; this.tsServerMsg = '';
                    this.pwdVisible = false; this.capsOn = false;
                    await this.refreshTsCfg();       // 先拉一次实时配置，见下方注释
                    this.ensureTsScript();
                    this.$nextTick(() => this.renderTurnstile());
                },
                // 🟢 实时刷新 Turnstile 配置（修复「配了验证却提示未通过」的根因）。
                // window.TURNSTILE_CFG 是服务端渲染 HTML 那一刻写死的。若用户在「系统设置 → 人机验证」
                // 保存密钥后没有刷新页面（例如保存后直接「安全退出」再登录），客户端仍以为「未启用」：
                //   1) x-show="tsCfg.enabled" 为假 → 验证框根本不显示；renderTurnstile() 也会提前 return；
                //   2) 提交时 turnstileToken 为空 → 服务端判定 403 turnstile_failed → 提示「人机验证未通过」。
                // 而服务端此刻已经是启用状态，所以用户无论重试多少次都过不去，只有强制刷新页面才行。
                // 因此在打开登录弹窗时实时拉取一次配置，让前后端状态对齐。
                async refreshTsCfg() {
                    try {
                        const res = await fetch('/api/turnstile/config');
                        if (!res.ok) return;
                        const d = await res.json();
                        this.tsCfg = { enabled: !!d.enabled, siteKey: d.siteKey || '', mode: d.mode === 'lenient' ? 'lenient' : 'strict' };
                    } catch (e) {}
                },
                // 页面首次渲染时若尚未启用，服务端不会注入 Turnstile 的 api.js。
                // 之后在设置里启用（或强制刷新后配置变化）时，需要在这里动态补一次脚本，
                // 否则 renderTurnstile() 的轮询会一直等不到 window.turnstile。
                ensureTsScript() {
                    if (!this.tsCfg.enabled || window.turnstile) return;
                    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) return; // 已存在（可能仍在加载），交给轮询
                    const s = document.createElement('script');
                    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
                    s.async = true; s.defer = true;
                    document.head.appendChild(s);
                },
                openDiagnose() { window.open('/api/turnstile/diagnose', '_blank', 'noopener,noreferrer'); },
                // 关闭登录弹窗。因为弹窗改成 x-if 按需渲染了，关闭时整块 DOM 会被销毁，
                // 所以必须顺手把 Turnstile 组件也摘掉并清空 widgetId —— 否则下次打开时
                // renderTurnstile() 会拿着一个已失效的 id 去 reset()，验证框会一直空白。
                closeLogin() {
                    this.modals.login = false;
                    try { if (window.turnstile && this.tsWidgetId !== null && window.turnstile.remove) window.turnstile.remove(this.tsWidgetId); } catch (e) {}
                    this.tsWidgetId = null;
                    if (this.tsPollTimer) { clearInterval(this.tsPollTimer); this.tsPollTimer = null; }
                    this.turnstileToken = ''; this.tsError = ''; this.tsServerMsg = '';
                    this.pwdVisible = false; this.capsOn = false;
                },
                tsHint(code) { const m = { '110100': 'Site Key 无效或格式错误', '400020': 'Site Key 无效或填反了（Site Key / Secret Key 不要互换）', '110110': 'Site Key 不存在或不属于当前账号', '110200': '当前域名未在 widget 的 Hostname Management 中授权（workers.dev 需显式添加）', '400021': '域名与 Site Key 不匹配', '110500': '组件模式不匹配（应为 Managed）', '110600': '验证超时，请刷新重试', '400070': 'Site Key 已停用' }; return '人机验证组件异常：' + (m[String(code)] || ('错误码 ' + code)); },
                renderTurnstile() {
                    if (!this.tsCfg.enabled) return;
                    // 「已启用但没拿到 Site Key」绝不能静默返回：那会让用户面对一个没有验证框、
                    // 却每次都提示「人机验证未通过」的登录页，完全无从下手。
                    if (!this.tsCfg.siteKey) { this.tsError = '未获取到 Site Key：请到「系统设置 → 人机验证」确认两把密钥已成对保存。'; return; }
                    const el = this.$refs.tsBox;
                    if (!el) return;
                    if (!(window.turnstile && window.turnstile.render)) {
                        if (this.tsPollTimer) return;
                        let tries = 0;
                        this.tsPollTimer = setInterval(() => {
                            tries++;
                            if (window.turnstile && window.turnstile.render) { clearInterval(this.tsPollTimer); this.tsPollTimer = null; this.renderTurnstile(); }
                            else if (tries > 50) { clearInterval(this.tsPollTimer); this.tsPollTimer = null; this.tsError = '验证组件加载失败：可能被广告拦截插件或网络策略拦截，请检查后重试。'; }
                        }, 200);
                        return;
                    }
                    if (this.tsWidgetId !== null) { try { window.turnstile.reset(this.tsWidgetId); return; } catch (e) { /* 重新渲染 */ } }
                    try {
                        this.tsWidgetId = window.turnstile.render(el, {
                            sitekey: this.tsCfg.siteKey,
                            theme: this.theme === 'light' ? 'light' : 'dark',
                            callback: (t) => { this.turnstileToken = t; this.tsError = ''; },
                            'error-callback': (c) => { this.tsError = this.tsHint(c); },
                            'timeout-callback': () => { this.tsError = this.tsHint('110600'); },
                            'expired-callback': () => { this.turnstileToken = ''; },
                        });
                    } catch (e) { this.tsError = '验证组件初始化失败，请刷新页面重试。'; }
                },
                resetTurnstile() { this.turnstileToken = ''; this.tsError = ''; try { if (window.turnstile && this.tsWidgetId !== null) window.turnstile.reset(this.tsWidgetId); } catch (e) {} },
                dismissTsWarning() { this.tsWarning = ''; try { sessionStorage.removeItem('nexus_ts_warning'); } catch (e) {} },

                // 🟢 Turnstile：设置页配置
                openSettings() { this.modals.settings = true; this.loadTurnstile(); },
                computeTsBadge() {
                    if (this.ts.emergencyOff) { this.ts.badgeText = '已应急关闭'; this.ts.badgeClass = 'border-red-500/30 text-red-400'; return; }
                    if (this.ts.enabled) { this.ts.badgeText = this.ts.source === 'env' ? '已启用（环境变量）' : '已启用'; this.ts.badgeClass = 'border-emerald-500/30 text-emerald-400'; return; }
                    if (this.ts.siteKeySet || this.ts.secretKeySet) { this.ts.badgeText = '配置不完整'; this.ts.badgeClass = 'border-amber-500/30 text-amber-400'; return; }
                    this.ts.badgeText = '未配置'; this.ts.badgeClass = 'border-gray-500/30 text-gray-400';
                },
                async loadTurnstile() {
                    try {
                        const res = await fetch('/api/settings/turnstile', { headers: { 'Authorization': this.token } });
                        if (!res.ok) return;
                        const d = await res.json();
                        this.ts.siteKeySet = !!d.siteKeySet; this.ts.secretKeySet = !!d.secretKeySet;
                        this.ts.siteKeyMasked = d.siteKeyMasked || ''; this.ts.secretKeyMasked = d.secretKeyMasked || '';
                        this.ts.source = d.source || 'none'; this.ts.emergencyOff = !!d.emergencyOff; this.ts.enabled = !!d.enabled;
                        this.ts.form.siteKey = ''; this.ts.form.secretKey = '';
                        this.ts.form.mode = d.mode === 'lenient' ? 'lenient' : 'strict';
                        this.computeTsBadge();
                    } catch (e) {}
                },
                async saveTurnstile() {
                    const f = this.ts.form;
                    const site = (f.siteKey || '').trim(), secret = (f.secretKey || '').trim();
                    if (site && secret && site === secret) return this.showToast('Site Key 与 Secret Key 不能相同（很可能填反了）', 'error');
                    const body = { mode: f.mode };
                    if (site) body.siteKey = site;
                    if (secret) body.secretKey = secret;
                    try {
                        const res = await fetch('/api/settings/turnstile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': this.token }, body: JSON.stringify(body) });
                        const d = await res.json().catch(() => ({}));
                        if (!res.ok) return this.showToast(d.message || '保存失败', 'error');
                        await this.loadTurnstile();
                        // 立刻让当前页面与新配置对齐（无需刷新）。否则不刷新页面时，登录弹窗仍按旧配置渲染，
                        // 就会出现「服务端已启用、页面上却没有验证框」→ 提交必然 403「人机验证未通过」的死循环。
                        await this.refreshTsCfg();
                        if (this.tsCfg.enabled) this.ensureTsScript();
                        this.showToast('已保存并即时生效');
                    } catch (e) { this.showToast('网络异常，请稍后重试', 'error'); }
                },
                clearTurnstile() { this.askConfirm('将同时清空 Site Key 与 Secret Key，登录将不再进行人机验证。', async () => {
                    try {
                        const res = await fetch('/api/settings/turnstile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': this.token }, body: JSON.stringify({ siteKey: '', secretKey: '' }) });
                        const d = await res.json().catch(() => ({}));
                        if (!res.ok) return this.showToast(d.message || '操作失败', 'error');
                        await this.loadTurnstile(); await this.refreshTsCfg(); this.showToast('已清空验证配置');
                    } catch (e) { this.showToast('网络异常', 'error'); }
                }, { okText: '清空' }); },
                async diagnoseTurnstile() {
                    this.ts.result = '检测中…'; this.ts.resultOk = true;
                    try {
                        const res = await fetch('/api/turnstile/diagnose');
                        const d = await res.json().catch(() => ({}));
                        if (res.status === 429) { this.ts.resultOk = false; this.ts.result = d.message || '检测过于频繁，请稍后再试'; return; }
                        this.ts.resultOk = d.conclusion === 'secret-ok' || d.conclusion === 'not-configured';
                        this.ts.result = (d.conclusionText || '未知') + '：' + (d.advice || '') + ((d.codes && d.codes.length) ? '（' + d.codes.join(', ') + '）' : '');
                    } catch (e) { this.ts.resultOk = false; this.ts.result = '自检请求失败，请检查网络。'; }
                },
                exportData() { const blob = new Blob([JSON.stringify({ version: 'v${APP_VERSION}', exportedAt: new Date().toISOString(), data: this.groups, settings: this.settings }, null, 2)], {type: "application/json"}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nexus_backup_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch(e) {} }, 1000); this.showToast('备份已导出'); },
                resetSettings() { this.askConfirm('将把背景 / 布局 / 外观等设置恢复为默认值（不会删除任何链接），确定继续？', () => { this.settings = { ...this.settings, bgType: 'bing', customBg: '', blur: 0, engine: 'google', customSearchUrl: '', showBgInLight: false, iconSize: 32, layoutWidth: 'center', iconOpacity: 100, cardOpacity: 40, headerOpacity: 75 }; this.updateCSSVars(); this.saveAll(); this.showToast('已恢复默认设置'); }, { okText: '恢复默认', danger: false }); },
                
                // 🟢 FIXED: Prevent browser "Reload site?" prompt by clearing saving status
                importData(e) { 
                    const file = e.target.files[0]; 
                    if (!file) return; 
                    const reader = new FileReader(); 
                    reader.onload = async (ev) => { 
                        let json;
                        try { json = JSON.parse(ev.target.result); } catch { return this.showToast('文件损坏或不是合法 JSON', 'error'); }
                        if (!json || !Array.isArray(json.data)) return this.showToast('备份文件格式不正确（缺少 data 数组）', 'error');
                        this.groups = json.data; 
                        if (json.settings && typeof json.settings === 'object') this.settings = { ...this.settings, ...json.settings };
                        this.sanitizeData(this.groups);
                        this.updateCSSVars();
                        await this.saveAll(); 
                        this.showToast('恢复成功'); 
                        setTimeout(() => { 
                            // 清掉未保存状态，避免浏览器弹出「离开站点？」提示
                            this.status.pending = false; 
                            this.status.saving = false; 
                            location.reload(); 
                        }, 1000); 
                    }; 
                    reader.readAsText(file); 
                },
                
                importBookmarks(e) {
                    const file = e.target.files[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        const doc = new DOMParser().parseFromString(ev.target.result, 'text/html');
                        const mkItem = (a) => ({ id: Math.random().toString(36).substr(2, 9), title: (a.textContent || '').trim() || a.href, url: a.href, iconUrl: a.getAttribute('icon') || '', isPrivate: false });
                        const newGroups = [];
                        // 按书签文件夹分组；只取该文件夹「直接子级」链接，排除嵌套子文件夹
                        Array.from(doc.querySelectorAll('h3')).forEach(h3 => {
                            const dl = h3.nextElementSibling;
                            if (!dl || dl.tagName !== 'DL') return;
                            const anchors = Array.from(dl.querySelectorAll('a')).filter(a => a.closest('dl') === dl);
                            if (!anchors.length) return;
                            newGroups.push({ id: 'g_' + Math.random().toString(36).substr(2, 9), name: (h3.textContent || '').trim() || 'Imported', isPrivate: false, items: anchors.map(mkItem) });
                        });
                        if (!newGroups.length) {
                            const anchors = Array.from(doc.querySelectorAll('a'));
                            if (!anchors.length) return this.showToast('未找到书签', 'error');
                            newGroups.push({ id: 'g_' + Math.random().toString(36).substr(2, 9), name: 'Imported', isPrivate: false, items: anchors.map(mkItem) });
                        }
                        const total = newGroups.reduce((n, g) => n + g.items.length, 0);
                        this.groups.push(...newGroups);
                        await this.saveAll();
                        this.$nextTick(() => { this.initGroupSortable(); this.updateSortableState(); });
                        this.showToast(\`导入 \${newGroups.length} 个分组 / \${total} 个书签\`);
                    };
                    reader.readAsText(file);
                }
            }
        }
    </script>
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}</script>
</body>
</html>
`;

async function hashText(text) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 🟢 会话：服务端随机令牌，存 R2，30 天过期。令牌本身不含任何口令信息。
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
function randomHex(bytes = 32) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function createSession(env, username) {
    const raw = randomHex(32);
    await env.NAV_R2.put('session_' + raw, JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL }));
    return 'Bearer ' + raw;
}
/** 校验用户名/口令；兼容旧数据（无 salt 时按原算法比对） */
async function verifyCreds(env, username, password) {
    const storedObj = await env.NAV_R2.get('admin_hash');
    const stored = storedObj ? await storedObj.json() : null;
    if (!stored || !stored.username || username !== stored.username) return null;
    const hashed = stored.salt ? await hashText(stored.salt + password) : await hashText(password);
    return safeEqual(hashed, stored.password) ? stored : null;
}
async function revokeSession(env, header) {
    if (header && header.startsWith('Bearer ')) {
        const raw = header.slice(7);
        if (/^[a-f0-9]{64}$/.test(raw)) await env.NAV_R2.delete('session_' + raw);
    }
}

/** 恒定时间字符串比较，避免通过响应耗时推测口令哈希 */
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// 🟢 登录限流：同一 IP 在窗口期内失败次数过多则临时锁定，缓解暴力破解
const LOGIN_MAX_FAILS = 8;
const LOGIN_WINDOW = 10 * 60 * 1000;
async function checkLoginThrottle(env, ip) {
    if (!ip) return { blocked: false };
    const obj = await env.NAV_R2.get('login_fail_' + ip);
    if (!obj) return { blocked: false };
    try {
        const s = await obj.json();
        if (s && s.until > Date.now() && s.count >= LOGIN_MAX_FAILS) {
            return { blocked: true, retryAfter: Math.ceil((s.until - Date.now()) / 1000) };
        }
    } catch { /* 记录损坏则视为未锁定 */ }
    return { blocked: false };
}
async function recordLoginFail(env, ip) {
    if (!ip) return;
    const key = 'login_fail_' + ip;
    let state = { count: 0, until: 0 };
    const obj = await env.NAV_R2.get(key);
    if (obj) { try { const p = await obj.json(); if (p && p.until > Date.now()) state = p; } catch { /* 忽略 */ } }
    state.count = (state.count || 0) + 1;
    state.until = Date.now() + LOGIN_WINDOW;
    await env.NAV_R2.put(key, JSON.stringify(state));
}
async function clearLoginFails(env, ip) { if (ip) await env.NAV_R2.delete('login_fail_' + ip); }

/** 通用计数限流：窗口期内超过 limit 次即拒绝 */
async function bumpRate(env, key, limit, windowMs) {
    let state = { count: 0, until: 0 };
    const obj = await env.NAV_R2.get(key);
    if (obj) { try { const p = await obj.json(); if (p && p.until > Date.now()) state = p; } catch { /* 忽略 */ } }
    state.count = (state.count || 0) + 1;
    state.until = Date.now() + windowMs;
    await env.NAV_R2.put(key, JSON.stringify(state));
    return { blocked: state.count > limit, count: state.count };
}

// 🟢 Turnstile 人机验证
// 密钥优先读「应用内设置」(R2: sys_settings)，没有则回退环境变量；两者都没有则自动关闭。
// 应急开关 sys_turnstile_off 只允许在 Cloudflare 控制台写（R2 对象），
// 用于「密钥/域名配错导致连管理员都登不进去」时的自救。
const TS_CONFIG_CODES = ['missing-input-secret', 'invalid-input-secret', 'bad-request'];
const TS_HINTS = {
    '110100': 'Site Key 无效或格式错误', '400020': 'Site Key 无效或填反了（Site Key / Secret Key 不要互换）',
    '110110': 'Site Key 不存在或不属于当前账号', '110200': '当前域名未在 widget 的 Hostname Management 中授权（workers.dev 需显式添加）',
    '400021': '域名与 Site Key 不匹配', '110500': '组件模式不匹配（应为 Managed）',
    '110600': '验证超时，请刷新重试', '400070': 'Site Key 已停用',
};

// siteverify 返回的「请求方原因」错误码 → 可读原因。
// 这些码只用于「告诉用户为什么被拦」，绝不参与放行判断（那是 verifyTurnstile 的职责）。
const TS_FAIL_HINTS = {
    'missing-input-response': '页面没有把验证令牌发过来：验证组件未加载、未完成验证，或页面里还是旧的配置（保存密钥后未刷新页面）。请按 Ctrl/Cmd+Shift+R 强制刷新后重新验证。',
    'invalid-input-response': '验证令牌无效：Site Key 与 Secret Key 可能取自两个不同的 widget，或令牌已被使用/失效。请核对两把密钥是否来自同一个 widget。',
    'timeout-or-duplicate': '验证令牌已过期或已被重复使用（有效期 300 秒）。请重新完成一次验证后再提交。',
    'bad-request': 'Cloudflare 拒绝了本次请求（bad-request）：Secret Key 格式可能不正确，请检查是否复制完整。',
    'internal-error': 'Cloudflare 验证服务内部错误，请稍后重试。',
    'network-error': '无法连接 Cloudflare 验证服务，请检查网络后重试。',
};
function tsFailMessage(codes) {
    const list = Array.isArray(codes) ? codes : [];
    for (const c of list) { if (TS_FAIL_HINTS[c]) return TS_FAIL_HINTS[c]; }
    return '人机验证未通过，请重新完成验证。';
}

async function getSysSettings(env) {
    const obj = await env.NAV_R2.get('sys_settings');
    if (!obj) return {};
    try { const s = await obj.json(); return (s && typeof s === 'object') ? s : {}; } catch { return {}; }
}
async function putSysSettings(env, settings) {
    const { __turnstileOff, ...clean } = settings || {};   // 防止内部标记被持久化
    await env.NAV_R2.put('sys_settings', JSON.stringify(clean), { httpMetadata: { contentType: 'application/json' } });
}
async function isTurnstileForceOff(env) {
    const obj = await env.NAV_R2.get('sys_turnstile_off');
    if (!obj) return false;
    try { const t = (await obj.text()).trim(); return t !== '' && t !== '0'; } catch { return false; }
}
/** 「是否启用」的唯一出口：任何地方都不要重复手写 Boolean(siteKey && secretKey)，否则破窗开关会失效 */
async function resolveTurnstile(env) {
    const off = await isTurnstileForceOff(env);
    const s = await getSysSettings(env);
    if (off) return { enabled: false, siteKey: null, secretKey: null, mode: 'strict', source: 'emergency-off' };
    if (s.turnstileSiteKey && s.turnstileSecretKey) {
        return { enabled: true, siteKey: s.turnstileSiteKey, secretKey: s.turnstileSecretKey, mode: s.turnstileMode === 'lenient' ? 'lenient' : 'strict', source: 'settings' };
    }
    if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) {
        return { enabled: true, siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY, mode: 'strict', source: 'env' };
    }
    return { enabled: false, siteKey: null, secretKey: null, mode: 'strict', source: 'none' };
}
function maskKey(k) { return k ? String(k).slice(0, 6) + '••••••••' + String(k).slice(-4) : ''; }

async function callSiteVerify(secretKey, token, ip) {
    const fd = new FormData();
    fd.append('secret', secretKey);
    fd.append('response', token || '');
    if (ip && ip !== 'unknown') fd.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
    try { return await res.json(); } catch { return { success: false, 'error-codes': ['bad-request'] }; }
}

/** 只把「非请求方原因」（密钥无效 / 服务不可达）标记为 configError —— 这类失败请求方无法制造，可安全降级 */
async function verifyTurnstile(token, secretKey, ip) {
    if (!secretKey) return { ok: true, skipped: true, codes: [], configError: false };
    if (!token) {
        // 用必定无效的探针 token 判断「这把密钥本身能不能用」
        try {
            const probe = await callSiteVerify(secretKey, 'XXXX.DUMMY.TOKEN.XXXX', ip);
            const codes = probe['error-codes'] || [];
            const broken = codes.some(c => TS_CONFIG_CODES.includes(c));
            return { ok: false, codes: broken ? codes : ['missing-input-response'], configError: broken };
        } catch { return { ok: false, codes: ['network-error'], configError: true }; }
    }
    try {
        const out = await callSiteVerify(secretKey, token, ip);
        const codes = out['error-codes'] || [];
        const ok = Boolean(out.success);
        return { ok, codes, configError: !ok && codes.some(c => TS_CONFIG_CODES.includes(c) || c === 'network-error' || c === 'internal-error') };
    } catch { return { ok: false, codes: ['network-error'], configError: true }; }
}

function tsWarningText(result, mode) {
    const list = result.codes || [];
    const codes = list.join(', ') || 'unknown';
    const base = list.includes('network-error') ? '人机验证服务暂时不可达'
        : (list.some(c => TS_CONFIG_CODES.includes(c)) ? '人机验证密钥无效' : '人机验证组件异常');
    const tail = mode === 'lenient' ? '，当前为「宽松模式」，已临时放行（防护强度已降低）' : '，已临时放行以免把管理员锁在门外';
    return base + tail + '。请到「系统设置 → 人机验证」检查配置（错误码：' + codes + '）。';
}

async function adjudicateTurnstile(cfToken, ts, ip, clientError) {
    if (!ts.enabled) return { pass: true, warning: '', codes: [] };
    const result = await verifyTurnstile(cfToken, ts.secretKey, ip);
    if (clientError) console.warn('[turnstile] client error code:', String(clientError).slice(0, 32)); // 仅记录，绝不参与放行判断
    if (result.ok) return { pass: true, warning: '', codes: [] };
    if (!result.configError && ts.mode !== 'lenient') return { pass: false, warning: '', codes: result.codes };
    return { pass: true, warning: tsWarningText(result, ts.mode), codes: result.codes };
}

/** SSRF 防护：只放行 http/https，拦截 localhost / 内网 / 保留地址 */
function isSafeTarget(rawUrl) {
    let u;
    try { u = new URL(rawUrl); } catch { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || host.endsWith('.home.arpa')) return false;
    if (host.includes(':')) { // IPv6
        if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false;
        return true;
    }
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const a = Number(m[1]), b = Number(m[2]);
        if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
        if (a === 169 && b === 254) return false;                 // link-local
        if (a === 172 && b >= 16 && b <= 31) return false;        // 172.16/12
        if (a === 192 && b === 168) return false;                 // 192.168/16
        if (a === 100 && b >= 64 && b <= 127) return false;       // CGNAT 100.64/10
    }
    return true;
}

class MetaHandler {
    constructor(state) { this.state = state; }
    element(element) {
        const tag = element.tagName;
        if (tag === "title" && !this.state.title) { this.state.inTitle = true; }
        if (tag === "meta") {
            const name = element.getAttribute("name"); const prop = element.getAttribute("property"); const content = element.getAttribute("content");
            if (name === "description" && content) this.state.description = content;
            if (prop === "og:image" && content) this.state.image = content;
        }
        if (tag === "link") {
            const rel = (element.getAttribute("rel") || "").toLowerCase();
            const href = element.getAttribute("href");
            if (href && (rel === "icon" || rel === "shortcut icon" || rel === "apple-touch-icon" || rel === "apple-touch-icon-precomposed")) {
                if (!this.state.icon) this.state.icon = href;
            }
        }
    }
    text(text) { if (this.state.inTitle && text.text.trim()) { this.state.title = (this.state.title || "") + text.text; } }
    end(element) { if (element.tagName === "title") this.state.inTitle = false; }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url); const path = url.pathname;
        const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };
        if (request.method === "OPTIONS") return new Response(null, { headers: cors });

        try {
            // PWA Manifest Route
            if (path === "/manifest.json") {
                const manifest = {
                    name: "Nexus", short_name: "Nexus", start_url: "/", display: "standalone",
                    background_color: "#0f172a", theme_color: "#0f172a",
                    icons: [
                        { src: SITE_ICON, sizes: "72x72", type: "image/png" },
                        { src: SITE_ICON, sizes: "192x192", type: "image/png", purpose: "any maskable" }
                    ],
                    shortcuts: [
                        {
                            name: "快速搜索",
                            url: "/?action=search",
                            icons: [{ src: SITE_ICON, sizes: "96x96", type: "image/png" }]
                        },
                        {
                            name: "我的便签",
                            url: "/?action=memo",
                            icons: [{ src: SITE_ICON, sizes: "96x96", type: "image/png" }]
                        }
                    ]
                };
                return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json", ...cors } });
            }

            // Service Worker Route
            if (path === "/sw.js") {
                return new Response(SW_SOURCE, { headers: { "Content-Type": "application/javascript; charset=UTF-8", "Service-Worker-Allowed": "/", "Cache-Control": "no-cache" } });
            }

            // Main UI Route
            if (path === "/" || path === "/index.html") {
                const coords = { lat: request.cf?.latitude || null, lon: request.cf?.longitude || null };
                const ts = await resolveTurnstile(env);
                const turnstile = { enabled: ts.enabled, siteKey: ts.enabled ? ts.siteKey : '', mode: ts.mode };
                return new Response(HTML_TEMPLATE({ coords, turnstile }), { headers: { "Content-Type": "text/html;charset=UTF-8", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-cache" } });
            }
            
            // --- R2 Storage Handlers ---

            if (path === "/api/status") { 
                const adminObj = await env.NAV_R2.get("admin_hash");
                return new Response(JSON.stringify({ setup: !!adminObj }), { headers: cors }); 
            }

            if (path === "/api/meta") {
                const targetUrl = url.searchParams.get("url"); if (!targetUrl) return new Response("Missing URL", { status: 400 });
                if (!isSafeTarget(targetUrl)) return new Response(JSON.stringify({ error: "URL not allowed" }), { status: 400, headers: cors });
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    const response = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusBot/11.0)' }, redirect: 'follow', signal: controller.signal });
                    clearTimeout(timeoutId);

                    const state = { title: null, description: null, image: null, icon: null, inTitle: false };
                    await new HTMLRewriter().on("title", new MetaHandler(state)).on("meta", new MetaHandler(state)).on("link", new MetaHandler(state)).transform(response).text();

                    // 优先用 <link rel="icon"> 作为图标（比 og:image 更适合小尺寸），相对路径解析为绝对地址
                    let icon = (state.icon || state.image || "").trim();
                    if (icon && !/^https?:/i.test(icon)) { try { icon = new URL(icon, targetUrl).href; } catch { icon = ""; } }
                    return new Response(JSON.stringify({ title: state.title ? state.title.trim() : "", description: state.description ? state.description.trim() : "", icon }), { headers: cors });
                } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: cors }); }
            }
            
            if (path === "/api/data") {
                if (request.method === "GET") {
                    const dataObj = await env.NAV_R2.get("nav_data");
                    let data = dataObj ? await dataObj.json() : [];
                    if (!Array.isArray(data)) data = [];

                    const settingsObj = await env.NAV_R2.get("nav_settings");
                    let settings = settingsObj ? await settingsObj.json() : {};
                    if (!settings || typeof settings !== "object") settings = {};

                    const isAuth = await checkAuth(request, env);
                    if (!isAuth) {
                        data = data.filter(g => g && !g.isPrivate)
                                   .map(g => ({ ...g, items: Array.isArray(g.items) ? g.items.filter(i => !i.isPrivate) : [] }));
                        // 便签属私密内容，未登录不下发
                        const { memo, ...publicSettings } = settings;
                        settings = publicSettings;
                    }
                    return new Response(JSON.stringify({ data, settings }), { headers: cors });
                }
                if (request.method === "POST") {
                    if (!(await checkAuth(request, env))) return new Response("Unauthorized", { status: 401, headers: cors });
                    const raw = await request.text();
                    if (raw.length > 4 * 1024 * 1024) return new Response("Payload Too Large", { status: 413, headers: cors });
                    let body;
                    try { body = JSON.parse(raw); } catch { return new Response("Bad Request", { status: 400, headers: cors }); }
                    if (body && Array.isArray(body.groups)) await env.NAV_R2.put("nav_data", JSON.stringify(body.groups));
                    if (body && body.settings) await env.NAV_R2.put("nav_settings", JSON.stringify(body.settings));
                    return new Response("Saved", { headers: cors });
                }
            }
            
            if (path === "/api/setup" && request.method === "POST") {
                const existing = await env.NAV_R2.get("admin_hash");
                if (existing) return new Response("Forbidden", { status: 403, headers: cors });

                const ip = request.headers.get("CF-Connecting-IP") || "";
                const gate = await checkLoginThrottle(env, ip);
                if (gate.blocked) return new Response(JSON.stringify({ error: "too_many_attempts" }), { status: 429, headers: cors });

                const body = await request.json();
                if (!body || !body.username || !body.password) return new Response("Bad Request", { status: 400, headers: cors });

                const ts = await resolveTurnstile(env);
                const verdict = await adjudicateTurnstile(body.cfToken, ts, ip, body.cfError);
                if (!verdict.pass) { await recordLoginFail(env, ip); return new Response(JSON.stringify({ error: 'turnstile_failed', codes: verdict.codes, message: tsFailMessage(verdict.codes) }), { status: 403, headers: cors }); }

                const salt = randomHex(16);
                const creds = { username: body.username, salt, password: await hashText(salt + body.password) };
                await env.NAV_R2.put("admin_hash", JSON.stringify(creds));
                const token = await createSession(env, creds.username);
                return new Response(JSON.stringify({ token, warning: verdict.warning }), { headers: cors });
            }

            if (path === "/api/login" && request.method === "POST") {
                const ip = request.headers.get("CF-Connecting-IP") || "";
                const gate = await checkLoginThrottle(env, ip);
                if (gate.blocked) return new Response(JSON.stringify({ error: "too_many_attempts", retryAfter: gate.retryAfter }), { status: 429, headers: cors });
                const body = await request.json();

                const ts = await resolveTurnstile(env);
                const verdict = await adjudicateTurnstile(body?.cfToken, ts, ip, body?.cfError);
                if (!verdict.pass) { await recordLoginFail(env, ip); return new Response(JSON.stringify({ error: 'turnstile_failed', codes: verdict.codes, message: tsFailMessage(verdict.codes) }), { status: 403, headers: cors }); }

                const stored = await verifyCreds(env, body?.username, body?.password);
                if (stored) {
                    await clearLoginFails(env, ip);
                    const token = await createSession(env, stored.username);
                    return new Response(JSON.stringify({ token, warning: verdict.warning }), { headers: cors });
                }
                await recordLoginFail(env, ip);
                return new Response("Unauthorized", { status: 401, headers: cors });
            }

            // 🟢 Turnstile 密钥配置（需登录）。字段不传=不修改，显式传空串=清空
            if (path === "/api/settings/turnstile") {
                if (!(await checkAuth(request, env))) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });
                if (request.method === "GET") {
                    const s = await getSysSettings(env);
                    const off = await isTurnstileForceOff(env);
                    const ts = await resolveTurnstile(env);
                    return new Response(JSON.stringify({
                        siteKeySet: Boolean(s.turnstileSiteKey), secretKeySet: Boolean(s.turnstileSecretKey),
                        siteKeyMasked: maskKey(s.turnstileSiteKey), secretKeyMasked: maskKey(s.turnstileSecretKey),
                        mode: s.turnstileMode === 'lenient' ? 'lenient' : 'strict',
                        source: ts.source, enabled: ts.enabled, emergencyOff: off,
                        envFallback: { siteKeySet: Boolean(env.TURNSTILE_SITE_KEY), secretKeySet: Boolean(env.TURNSTILE_SECRET_KEY) },
                    }), { headers: cors });
                }
                if (request.method === "POST") {
                    let body;
                    try { body = JSON.parse(await request.text()); } catch { return new Response(JSON.stringify({ message: '请求格式错误' }), { status: 400, headers: cors }); }
                    const s = await getSysSettings(env);
                    if (typeof body.siteKey === 'string') s.turnstileSiteKey = body.siteKey.trim();
                    if (typeof body.secretKey === 'string') s.turnstileSecretKey = body.secretKey.trim();
                    if (body.mode === 'strict' || body.mode === 'lenient') s.turnstileMode = body.mode;
                    if (s.turnstileSiteKey && s.turnstileSecretKey && s.turnstileSiteKey === s.turnstileSecretKey) {
                        return new Response(JSON.stringify({ message: 'Site Key 与 Secret Key 不能相同（很可能填反了）' }), { status: 400, headers: cors });
                    }
                    if (Boolean(s.turnstileSiteKey) !== Boolean(s.turnstileSecretKey)) {
                        return new Response(JSON.stringify({ message: 'Site Key 与 Secret Key 必须成对配置，或同时清空' }), { status: 400, headers: cors });
                    }
                    await putSysSettings(env, s);
                    return new Response(JSON.stringify({ ok: true }), { headers: cors });
                }
            }

            // 🟢 Turnstile 运行时配置（公开、无需登录）。只回显 Site Key —— 它本就是公开值，绝不返回 Secret Key。
            // 登录弹窗打开时会实时拉取一次。原因见前端 refreshTsCfg() 的注释：
            // 页面里的 TURNSTILE_CFG 是 HTML 渲染时写死的，保存密钥后不刷新页面就会「服务端已启用、页面还以为没启用」，
            // 于是验证组件根本不渲染 → 永远拿不到 token → 每次提交都是 403「人机验证未通过」，怎么重试都好不了。
            if (path === "/api/turnstile/config" && request.method === "GET") {
                const ts = await resolveTurnstile(env);
                return new Response(JSON.stringify({
                    enabled: ts.enabled, siteKey: ts.enabled ? ts.siteKey : '',
                    mode: ts.mode, source: ts.source,
                }), { headers: cors });
            }

            // 🟢 Turnstile 自检（无需登录，专供「正因为配错而登不进去」时使用），按 IP 限流
            if (path === "/api/turnstile/diagnose" && request.method === "GET") {
                const ip = request.headers.get("CF-Connecting-IP") || "";
                const rl = await bumpRate(env, 'diag_' + ip, 10, 15 * 60 * 1000);
                if (rl.blocked) return new Response(JSON.stringify({ error: 'rate_limited', message: '检测过于频繁，请 15 分钟后再试' }), { status: 429, headers: cors });
                const s = await getSysSettings(env);
                const ts = await resolveTurnstile(env);
                let conclusion = 'not-configured', codes = [], advice = '';
                if (ts.source === 'emergency-off') {
                    conclusion = 'emergency-off'; advice = '已通过 R2 对象 sys_turnstile_off 应急关闭；删除该对象即可恢复验证。';
                } else if (!ts.enabled) {
                    conclusion = 'not-configured'; advice = '尚未配置（或只配了一半），登录当前不做人机验证。';
                } else {
                    const probe = await verifyTurnstile('', ts.secretKey, ip);
                    codes = probe.codes || [];
                    if (probe.configError) {
                        const unreachable = codes.includes('network-error');
                        conclusion = unreachable ? 'unreachable' : 'secret-invalid';
                        advice = unreachable ? '无法访问 Cloudflare 验证服务（网络问题），当前会临时放行。' : 'Secret Key 无效：请核对是否与 Site Key 填反、或复制不完整。';
                    } else {
                        conclusion = 'secret-ok'; advice = '密钥有效。若组件仍报错，多为域名未授权（110200），请检查该 widget 的 Hostname Management。';
                    }
                }
                const text = { 'not-configured': '未配置', 'emergency-off': '已应急关闭', 'secret-invalid': 'Secret Key 无效', 'secret-ok': '密钥有效', 'unreachable': '验证服务不可达' }[conclusion];
                return new Response(JSON.stringify({
                    conclusion, conclusionText: text, advice, codes, host: request.headers.get("Host") || url.host,
                    source: ts.source, mode: ts.mode, enabled: ts.enabled,
                    siteKeyMasked: maskKey(s.turnstileSiteKey || env.TURNSTILE_SITE_KEY),
                    secretKeySet: Boolean(ts.secretKey), emergencyOff: ts.source === 'emergency-off',
                }), { headers: cors });
            }

            if (path === "/api/logout" && request.method === "POST") {
                await revokeSession(env, request.headers.get("Authorization"));
                return new Response("OK", { headers: cors });
            }

            if (path === "/api/check") { return (await checkAuth(request, env)) ? new Response("OK", { headers: cors }) : new Response("Unauthorized", { status: 401, headers: cors }); }

        } catch (e) { return new Response("Error: " + e.message, { status: 500, headers: cors }); }
        return new Response("Not Found", { status: 404 });
    }
};

async function checkAuth(req, env) {
    const h = req.headers.get("Authorization");
    if (!h || !h.startsWith("Bearer ")) return false;
    const raw = h.slice(7);
    if (!/^[a-f0-9]{64}$/.test(raw)) return false;
    const obj = await env.NAV_R2.get("session_" + raw);
    if (!obj) return false;
    try {
        const s = await obj.json();
        return !!(s && s.exp && s.exp > Date.now());
    } catch { return false; }
}
