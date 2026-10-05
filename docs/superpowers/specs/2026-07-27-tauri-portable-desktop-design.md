# Tauri 便携桌面版设计

## 目标

将现有本地 EPUB 阅读器封装为 Windows x64 的 Tauri 2 桌面程序。发布物是无需安装的可执行文件；用户从程序内导入无 DRM EPUB，不注册文件关联，也不修改 Windows 注册表。

## 范围

桌面版继续提供现有 Web 版所有阅读能力：

- 导入一个或多个本地 EPUB，检查扩展名与 MIME 类型，解析书名、作者、封面和文件内容。
- 本地书架的封面、元数据、打开、删除和排序。
- EPUB 正文渲染、上一页/下一页、方向键/PageUp/PageDown/空格翻页、目录、当前章节高亮和阅读位置恢复。
- 阅读偏好：字体、字号、行高、亮色/深色/护眼主题与侧边栏显示状态。
- 书签：创建、去重、跳转、删除和摘录。
- 单本书阅读背景：JPEG/PNG/WebP 校验、10 MB 限制、启用、透明度与重置。
- 对导入、打开、保存和恢复失败显示可见错误信息。
- 正文阅读区的鼠标左键下一页、鼠标右键上一页，以及滚轮向下下一页、向上上一页。
- 章节目录点击后的跳转确认窗口，以及不影响正文显示的独立左侧滚动区域。

本期不实现 EPUB 文件的双击关联、右键菜单注册、拖放导入、自动更新、系统菜单、原生文件访问 API 或移动端专项界面。

## 架构

```
React + Vite 前端
        |
        | WebView2 浏览器 API
        v
epub.js + IndexedDB
        |
        v
Tauri 2 Rust 主进程（仅窗口和生命周期）
```

Tauri 使用 Windows 已安装的 Microsoft Edge WebView2 渲染 Vite 构建出的静态资源。前端继续只使用 Web API：文件选择框、Blob、Object URL 和 IndexedDB；因此现有书架、EPUB、阅读状态、书签、偏好和背景图的业务代码保持不变。Rust 主进程不暴露自定义命令，`dangerousDisableAssetCspModification`、Node 集成和任意文件系统权限均不启用。

桌面窗口采用 1280 x 840 的初始尺寸，最小尺寸为 1024 x 680，可缩放；关闭窗口即退出应用。开发模式由 Tauri CLI 启动 Vite 并加载其本地 URL，生产模式加载 Vite 的 `dist` 静态资源。

## 阅读页鼠标交互与布局

阅读页保持左右固定布局：左侧为导航和工具区，右侧为始终可见的 EPUB 正文分页区。页面外层禁止纵向滚动；正文区域采用固定高度和 `overflow: hidden`，防止任一侧内容增长或滚轮操作把正文推出视口。

右侧正文容器和 epub.js 创建的 iframe 文档均注册下列事件：

- 鼠标左键点击正文空白或内容区域时调用下一页。
- 鼠标右键点击时阻止浏览器上下文菜单并调用上一页。
- 滚轮事件阻止默认滚动；正向 `deltaY` 调用下一页，负向 `deltaY` 调用上一页。
- 事件监听在阅读器卸载、图书切换和 iframe 重建时移除，避免重复翻页或泄漏。

左侧不参与正文分页。章节目录、书签、阅读设置和阅读背景分别使用可滚动的独立区块；鼠标在这些区块上滚动只滚动该区块，不触发右侧翻页。章节目录项只响应鼠标左键，先打开确认窗口，窗口显示目标章节名称并提供“取消”和“跳转”操作；仅选择“跳转”后调用 EPUB 目录定位。

## 构建与发布

- `npm run tauri:dev`：启动开发用桌面窗口。
- `npm run tauri:build`：先执行现有生产构建，再执行 `tauri build --no-bundle`。
- Windows x64 可执行文件从 `src-tauri/target/release/` 复制到 `release/`，作为便携发布物。
- 可执行文件运行依赖 Windows 的 WebView2 Runtime；不随应用重复打包 Chromium，也不创建安装程序。

`@tauri-apps/cli` 与 `@tauri-apps/api` 通过 npm 安装到项目的 `node_modules`。执行 Tauri 构建所需的 Rust 下载缓存和工具链定向到项目 `tools/rust`。Windows SDK/MSVC 与 WebView2 是系统组件，保留为明确的外部前提，不写入项目目录。

## 数据与兼容性

桌面端 WebView2 的 IndexedDB 以应用的本地 WebView 配置文件为作用域保存数据。它与用户此前在浏览器中使用 Web 版产生的 IndexedDB 互相独立，因此首次启动桌面版书架为空；桌面版数据会在后续升级中保留，除非用户清除应用数据。

## 验证

- 现有 `npm run test`、`npm run lint`、`npm run build` 与 `npm run test:e2e` 必须继续通过。
- `npm run tauri:build` 必须生成 Windows x64 可执行文件。
- 启动该可执行文件，确认窗口显示书架并可从文件选择器导入 EPUB、打开阅读页、返回书架。
- 在桌面版中关闭并重新打开同一本书，确认阅读位置和书签在 WebView2 IndexedDB 中恢复。

## 风险与处理

WebView2 与 Chromium 的实现差异可能影响 epub.js iframe、CFI 或 IndexedDB 行为。先以现有真实 EPUB 测试书完成桌面手工验证；若不兼容，记录具体 API 差异后仅调整前端兼容层，不放宽 Tauri 权限或引入 Node 集成。
