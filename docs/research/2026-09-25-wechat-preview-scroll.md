# 公众号预览：滚动与复制参考

2026-09-25 检视公开源码：

- [doocs/md](https://github.com/doocs/md/tree/f358039/apps/web/src/composables)：`useScrollSync.ts` 把源文按空行拆为块，再与预览 DOM 块按序映射；编辑区、预览区都能驱动对方滚动。程序设置 `scrollTop` 后记录目标值，避免延迟到达的滚动事件造成回跳。项目许可证为 WTFPL v2。
- [note-to-mp](https://github.com/sunbooshi/note-to-mp/tree/34abe3c/src)：`note-preview.ts` 通过当前文件和 `vault.modify` 刷新侧栏；`Wechat.tsx` 把公众号预览、复制、草稿操作放在同一工作区。此次检视的公开预览代码没有双向滚动同步。项目许可证为 MIT；核心渲染还依赖私有子模块，不能把公开代码当成完整实现。
- [AI Elements 组件目录](https://elements.ai-sdk.dev/components/) 没有 Markdown 编辑器与预览滚动同步组件；本功能使用 Obsidian 的 MarkdownView 和原生滚动容器。

当前插件采用双向滚动百分比映射：Obsidian 源码或阅读视图 ↔ 公众号侧栏；首尾对齐、过滤程序滚动回跳、切换笔记时重新绑定。正文样式与复制沿用同一份内联 HTML。没有直接复制上述项目的代码。

限制：当一侧有特别高的图片、表格或折叠块时，中段位置可能偏移。doocs/md 的块级映射是后续提高定位精度的参考，但 Obsidian 的源码视图会虚拟化行，不能直接照搬其 CodeMirror 映射。
