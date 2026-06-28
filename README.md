# 通过 Cloudflare Workers 导航网站

本指南将教如何完全通过网页界面部署导航应用，无需使用命令行工具。

## 🚀 部署步骤

### 第一步：创建 Worker

请在 Cloudflare 后台创建一个 R2 存储桶 (Bucket)（例如命名为 nav-data）。

### 第二步：创建R2 (存数据的地方)

登录 Cloudflare 控制台，进入左侧导航栏的 Workers & Pages。

点击 Create application（创建应用程序），然后选择 Pages 选项卡。

点击 Connect to Git（连接到 Git）。

选择你的 GitHub 账号，并选中你刚刚创建的 nexus-nav 仓库，点击 Begin setup（开始设置）。

### 第三步：配置构建设置并初次部署

在“Set up builds and deployments”页面，按以下方式配置：

Project name (项目名称): 随意填写（例如 nexus-nav），这会成为你的免费二级域名。

Production branch (生产分支): main 或 master。

Framework preset (框架预设): 选择 None。

Build command (构建命令): 留空（因为我们不需要打包）。

Build output directory (构建输出目录): 填写 / （表示输出目录就是仓库根目录）。

点击 Save and Deploy (保存并部署)。

#### 大功告成！ 点击 Worker 概览页面的 URL（通常是 https://你的名字.workers.dev）即可访问。
## 第一次打开网站提示设置账号和密码

### 🔍 搜索沉浸模式 (Auto Zen)

当您点击搜索框并停留（聚焦）超过 3 秒时，系统会自动判断您正在进行深度搜索，随后自动进入“禅模式”，隐藏所有图标干扰。
如果 3 秒内鼠标离开（失焦），计时取消。
进入禅模式后，点击背景空白处依然可以一键退出。 

### 🤔 常见问题
Q: 背景图怎么不显示？

A: 确保在“全局设置”里选择了正确的壁纸类型。如果是自定义 URL，确保链接是直链（以 .jpg 或 .png 结尾）。

Q: 我想改分类顺序怎么办？

A: 目前为了保证稳定性，分类顺序是按创建时间排的。你可以通过修改 JSON 备份文件（备份 -> 调整 JSON 里的数组顺序 -> 恢复）来调整。
