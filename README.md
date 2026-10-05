# Local EPUB Reader

支持 Windows、Android 和浏览器的本地 EPUB 阅读器。图书、阅读进度、书签、阅读偏好和背景图保存在设备本机，阅读不需要注册账户或连接服务器。

## 快速下载

| 平台 | 下载最新版 | 运行要求 |
| --- | --- | --- |
| Windows | [下载 EXE](https://github.com/38huangyukong38/epub-reader/releases/latest/download/Local.EPUB.Reader.exe) | Windows 10/11，x64，Microsoft Edge WebView2 Runtime |
| Android | [下载 APK](https://github.com/38huangyukong38/epub-reader/releases/latest/download/Local.EPUB.Reader.apk) | Android 7.0 及以上，ARM64 |

[查看全部版本与更新说明](https://github.com/38huangyukong38/epub-reader/releases) · [下载 SHA-256 校验文件](https://github.com/38huangyukong38/epub-reader/releases/latest/download/SHA256SUMS.txt)

Windows 下载后直接运行 EXE；Android 下载后打开 APK 安装。源代码压缩包用于开发，安装使用请选择上方 EXE 或 APK。Android 当前提供调试签名包，后续升级请使用同一项目发布的 APK。

## 功能

- 本地导入 EPUB，保存阅读进度、书签与阅读设置；重复导入相同内容时复用已有记录。
- 支持从系统“打开方式”打开 EPUB 并自动加入书架；Android 还支持接收分享的文件。
- Windows 支持鼠标滚轮、点击和按钮翻页，跨章节可连续操作。
- 手机支持左右滑动翻页；点击左侧 45% 上一页、右侧 45% 下一页，中间 10% 隐藏或恢复操作栏。
- 可折叠章节目录、字体大小、行高、正文边距、主题、自定义背景图和背景板透明度。
- 兼容部分 EPUB 图片标签的 XML 格式问题，避免因缺失属性值中断正文与插画显示。

已确认的侧栏、目录与背景板样式见 [阅读器界面约定](docs/reader-ui-conventions.md)，后续各平台更新沿用这些约定。

## 源码开发

使用 Node.js 22 LTS 或更新的兼容版本，克隆仓库后安装依赖：

```powershell
git clone https://github.com/38huangyukong38/epub-reader.git
cd epub-reader
npm ci
npm run dev
```

打开开发服务器显示的本地地址，使用“导入 EPUB”选择一本或多本无 DRM 的 EPUB。

## 验证

```powershell
npm test
npm run lint
npm run build
```

运行浏览器端到端测试前，先安装 Playwright Chromium：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "0"
npx playwright install chromium
npm run test:e2e
```

编译 Windows EXE 后，可用 `node scripts/test-external-exe.mjs` 验证实际 EXE 的冷启动、已运行窗口接收文件和重复文件去重。测试使用仓库内的自制 EPUB；本机 `release/1.epub` 仅供可选兼容性测试，不随项目发布。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `src/` | React / TypeScript 阅读器、书架、数据库与 EPUB 兼容处理 |
| `src-tauri/src/` | Rust 桌面入口与外部文件接收 |
| `src-tauri/gen/android/` | Android 工程、文件打开与分享接收、返回键处理 |
| `src-tauri/icons/` | Windows 与 Android 图标，以及图标源配置 |
| `scripts/` | 开发、构建与实际 EXE 验证脚本 |
| `e2e/` | Playwright 测试与自制 EPUB 样例 |
| `docs/` | 界面约定及设计记录 |

下载的工具链、依赖缓存、个人书籍、签名密钥与构建产物不进入源码仓库；编译后的 APK、EXE 在 Releases 中提供。

## 限制

- 仅支持无 DRM 的本地 EPUB。
- 阅读背景只支持 JPEG、PNG 和 WebP，单个文件不超过 10 MB。
- 清除浏览器的站点数据会同时删除所有本地图书、阅读进度、书签和设置。

## Windows 便携桌面版

桌面版使用 Tauri 和系统 Microsoft Edge WebView2，不安装 Chromium，不注册 EPUB 文件关联，也不修改注册表。它与浏览器版使用不同的 IndexedDB 作用域，因此首次运行时书架为空；之后的桌面版图书和阅读数据会保存在本机应用数据中。

```powershell
npm.cmd run tauri:dev
npm.cmd run tauri:build
```

`tauri:build` 会为 Windows x64 编译免安装的可执行文件，并复制到 `release/Local EPUB Reader.exe`。构建需要 Rust 的 `stable-x86_64-pc-windows-msvc` 工具链、Windows SDK/MSVC 和系统 WebView2 Runtime；桌面开发和构建脚本会在完整的 `tools/rust` 工具链存在时优先使用它，否则使用系统 `cargo`。

### 系统默认打开 EPUB

新版支持接收 Windows 传入的 EPUB 路径。将 EXE 放在固定位置，右键任意 EPUB，选择“打开方式 → 选择其他应用 → 在电脑上选择应用”，指定 `Local EPUB Reader.exe` 并选“始终”。之后双击 EPUB 会自动加入书架并进入阅读。应用已运行时复用现有窗口；相同内容的文件即使改名或移动，也复用已有图书、书签与阅读进度。默认选择由 Windows 系统界面确认，EXE 移动后需要重新指定。

## Android 手机版本

安装包输出为 `release/Local EPUB Reader.apk`，适用于 Android 7.0（API 24）及以上的 ARM64 手机。当前提供个人使用的调试签名包，并非应用商店发布包。

将 APK 传到手机后，用手机的文件管理器打开安装。在应用中点击“导入 EPUB”，从下载目录或其他本地文件位置选择图书。页面资源随安装包提供，阅读本地图书不需要电脑运行服务器。

新版也支持从文件管理器的“打开方式”以及“分享”接收 EPUB，并自动加入书架后打开。首次打开时选择 Local EPUB Reader；系统提供“始终”选项时可设为默认。部分文件管理器强制每次选择应用，这时可以使用“分享到 Local EPUB Reader”。同一内容重复打开会恢复已有记录，不会重复导入。读取系统授予访问的本地文件，不需要“管理所有文件”权限。

- 手机默认显示全宽正文，左右滑动、点击正文两侧或底部按钮翻页。正文左侧45%点击上一页，右侧45%点击下一页；中间10%点击隐藏或恢复顶部与底部操作栏，隐藏时仍可点击两侧或滑动翻页。
- 右上角菜单打开整个侧栏；关闭按钮或点击侧栏外部可收起。目录、书签、阅读设置和背景图均在侧栏中。
- 横竖屏自动重新分页；正文边距只改变文字左右留白，主题和背景覆盖阅读窗口。
- 系统返回键依次关闭章节确认、收起侧栏、恢复已隐藏的操作栏、返回书架；在书架再次返回则离开应用。
- 图书、书签与进度保存在手机本机，切到后台时立即保存当前位置。手机与电脑的数据各自独立，不会自动同步；卸载或清除应用数据会删除本地书架。

### 重新构建

```powershell
npm.cmd run android:build
```

脚本优先使用项目 `tools/android` 下的 JDK、Android SDK、NDK 和 Gradle 缓存；也可设置 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME`、`GRADLE_USER_HOME`。本次环境使用 JDK 17、SDK Platform 36、Build Tools 35/36、NDK 27.2、Gradle 8.14.3，以及 Rust `aarch64-linux-android` target。首次构建需要网络下载依赖，构建完成后生成 APK 并复制到上述发布目录。

Windows 未开启符号链接权限时，脚本会在 Rust 编译成功后复制 JNI 动态库，再由 Gradle 打包，无需修改系统开发者模式。`src-tauri/build.rs` 为 Android 动态库设置 16 KB 对齐。保留本机调试签名密钥，后续使用相同密钥和应用标识构建的 APK 才能直接覆盖升级。

`npm.cmd run android:dev` 用于连接设备后的开发调试；Android 工程已包含在 `src-tauri/gen/android` 中。使用现有工程直接构建即可；重新执行 `android:init` 会涉及生成文件，应保留 `MainActivity.kt`、`ExternalEpubReceiver.kt` 和 AndroidManifest.xml 中的定制内容。仓库不包含本机调试签名密钥，自行编译的 APK 默认使用构建者自己的密钥。

手机浏览器布局也可使用。若通过浏览器访问，应部署到 HTTPS 地址；Android APK 无需这一步。

## 图标来源

软件图标来自 Pixiv 作者 [**S-Kiorder**](https://www.pixiv.net/users/82233354) 的[作品](https://www.pixiv.net/artworks/140731232)。
