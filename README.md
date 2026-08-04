# Zotero Context Translator

面向 Zotero 9 PDF Reader 的上下文感知学术翻译插件。当前版本：`0.1.6`，支持 Zotero `9.0.*`。

## 功能特点

- 在 PDF Reader 中选中文本后显示浮动翻译卡片；仅选中不会自动调用 API。
- 点击唯一的“翻译”按钮，才会发出一次 OpenAI 兼容的 Chat Completions 请求。
- 同一张卡片中展示原文、译文、说明与错误状态，并支持复制、重试、拖动和 `Esc` 关闭。

## 系统要求

- Windows 64 位与 Zotero `9.0.*`。
- 可选中文本层的 PDF；插件不包含 OCR，不支持扫描版 PDF。
- 一个 OpenAI Chat Completions 兼容接口。

## 安装

1. 克隆源代码并安装项目依赖。
2. 在仓库根目录运行 `pnpm run build`，生成 `outputs/zotero-context-translator-0.1.6.xpi`。
3. 在 Zotero 中打开“工具 → 插件”，点击齿轮并选择“Install Add-on From File…”，再选择生成的 XPI 文件。
4. 安装后打开“编辑 → 设置 → 上下文翻译”，完成 API 配置。

详见 [安装与使用说明](docs/INSTALL.md)。

## API 配置

在设置页填写：

```text
Base URL: https://api.example.com/v1
API Key: <your-api-key>
Model Name: model-name
```

`Base URL` 可填写版本根地址或完整的 `/chat/completions` 地址。`API Key` 保存在 Zotero 使用的 Firefox Login Manager 中，不写入普通首选项、日志或论文缓存。`Model Name` 应为服务端实际支持的模型名。

## 使用方法

1. 在 Zotero PDF Reader 选中单词、句子或段落。
2. 查看选区附近出现的浮动卡片。
3. 点击“翻译”按钮发送一次请求，并在卡片内查看流式结果。

打开设置页、打开论文、选择文本或建立本地索引均不会产生 API 请求；“测试连接”会发出一次最小请求，第三方服务仍可能计费。

## 上下文与缓存

插件仅在本地建立结构索引，结合条目标题、摘要、章节路径与当前段落附近的文本构造上下文。缓存按附件指纹保存于 Zotero profile 的 `zotero-context-translator-cache`，不写入 `zotero.sqlite`，也不持久化保存完整论文的翻译历史。

## 隐私说明

只有点击“翻译”或“测试连接”时，插件才访问已配置的 API。请求受字符预算限制，包含标题、摘要、章节路径、当前选区和附近文本；默认不会上传整篇 PDF。请根据论文保密要求选择可信的 API 服务商，其数据保留政策不受本插件控制。

## 本地开发

安装依赖后，在仓库根目录运行：

```powershell
pnpm run build
```

构建产物为 `outputs/zotero-context-translator-0.1.6.xpi`。

## 测试与验收

运行自动化测试：

```powershell
pnpm test
```

发布前还需按照 [验收规范](docs/ACCEPTANCE.md) 在 Zotero 9.0.6 中完成 Reader 实机验证；自动化测试不能替代该步骤。

## 已知限制

- 不支持扫描版、损坏或文本层乱序的 PDF，也不包含 OCR。
- 复杂自由排版、跨页表格、旋转侧栏、曲线文字及图片中的公式/图注可能无法正确进入结构索引。
- 结构索引失败或超时不会发送缺少上下文的 API 请求。

## 许可证

本项目尚未授予开源许可证；除法律另有要求外，未授予使用、复制、修改或分发的许可。
