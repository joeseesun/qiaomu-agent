# Obsidian 公众号排版发布：竞品调研与通用方案 · 2026-09-25

目标：把现有「只能走乔木自建 Bridge」的公众号草稿发布，升级成任何用户都能用的通用能力：**预览 → 复制 / 发草稿**。用户的出口 IP 在公众号白名单里时直连微信；不在白名单里时，获准的用户可以走乔木服务器中转。

## 一、关键事实：白名单到底管什么

微信官方文档（[API IP 白名单](https://developers.weixin.qq.com/doc/oplatform/developers/basic_func/ip_whitelist.html)）对两类账号的规定不同：

- 小程序和小游戏：只有带 `AppSecret` 的接口（也就是取 token）受白名单限制。
- **公众号和服务号：用 `AppSecret` 或 `access_token` 调用服务端接口，都要求来源 IP 在白名单里。**

所以对公众号来说，「服务器只负责换 token，图片上传和建草稿从用户电脑直接发」这种做法，**不符合文档规定**。note-to-mp 正是这样实现的（见下文）。它现在能用，可能是因为微信实际没有严格执行。这种情况随时可能变化，本方案**按严格规定设计**：凡是中转模式，所有微信 API 请求都经过白名单服务器。「只中转 token」可以留作以后用测试号验证的优化项，不作为默认方案。

## 二、竞品对比

| 产品 | 许可证 | 发布链路 | 白名单处理 | 值得借鉴 | 不宜照搬 |
| --- | --- | --- | --- | --- | --- |
| [sunbooshi/note-to-mp](https://github.com/sunbooshi/note-to-mp) `34abe3c` | MIT（**核心渲染在私有子模块 `note-to-mp-core`，公开仓库无法独立构建**） | 调作者服务 `obplugin.dualhue.cn/v1/wx/token` 取 token；上传图片、新建草稿、素材和草稿管理都**从客户端直接请求** `api.weixin.qq.com` | 让用户把作者的两个服务器 IP 加入白名单；token 中转属于会员功能（需 authkey）；AppSecret 经服务端 `/v1/wx/encrypt` 加密后才存到本地 | 30+ 主题、样式小部件和「专家设置」（把 h2 或 callout 映射成组件，不侵入笔记）；frontmatter 字段重映射；多公众号；素材和草稿管理（列表、删除、`freepublish`）；Unsplash 封面；图片背景和水印；笔记转图片，发成公众号贴图（`article_type: newspic`）；n8n 和 Coze 工作流；note-pub-skill 让 Agent 调用 | 付费中转和闭源核心；直连 API 违背公众号白名单规定；错误码 40164 的提示里写死了作者的 IP |
| [freestylefly/wesight](https://github.com/freestylefly/wesight) `a8606e1` | MIT | **没有公众号发布功能**。它是 Electron 桌面 Agent 工作台，附带「内容创作」预设 Agent、`article-writer`（五种写作风格，写作后有公众号排版硬规则）、`content-planner`（用搜狗搜公众号热文）；「微信」在这里指个人微信 IM 通道 | — | 选题 → 大纲确认 → 写作 → 排版规则 → 存成草稿 Markdown 的 Agent 工作流；写作规则（段落不超过 4 行、前 3 行放钩子） | 搜狗抓取属于灰色地带；桌面壳和 IM 网关与本插件定位无关 |
| [geekjourneyx/obsidian-md2wechat](https://github.com/geekjourneyx/obsidian-md2wechat) | AGPL-3.0 | 依赖本机 `md2wechat` CLI 保存凭据和执行排版，插件本身只做预览和触发 | 交给 CLI 处理 | 由 Agent 负责排版，插件负责预览和确认；本地去重，防止重复建草稿 | AGPL，只能参考思路 |
| [DavidLam-oss/obsidian-wechat-converter](https://github.com/davidlam-oss/obsidian-wechat-converter) | MIT | AppID 和 Secret 直连官方 API | 可选「API 代理」：官方 Cloudflare Worker 或自建 VPS，要求 https，只转发到 `api.weixin.qq.com`，不记录密钥 | 手机外框预览、双向滚动同步；横滑图集；飞书同步；配合浏览器扩展分发到知乎、掘金、小红书 | Cloudflare Worker 的出口 IP 不固定，理论上不能稳定满足白名单 |
| [joeytoday/obsidian-mp-publisher](https://github.com/joeytoday/obsidian-mp-publisher) | AGPL-3.0，另有商业授权 | 直连 | 让用户把自己的 IP 加入白名单，文档建议动态 IP 填 `0.0.0.0/0` | 30+ 种 Callout；公式转 PNG | 建议填 `0.0.0.0/0` 等于关掉白名单，不能这样引导用户 |
| [chararch/obsidian-enhanced-publisher](https://github.com/chararch/obsidian-enhanced-publisher) | MIT | 直连 | 手动加入白名单 | 粘贴图片时自动归档到 `文档名__assets`；注音 | — |
| **本插件现状**（`src/wechat/`） | 自有 | 只能走 qmblog Bridge（服务端保存账号，单一 `BRIDGE_TOKEN`） | Bridge 部署在固定 IP 的 VPS 上 | 移植了博客 30+ 主题、规范化、发布前检查；公式和 Mermaid 转 PNG；不引入 juice，用 CSSOM 内联；写回 frontmatter | **只有乔木自己能用**：普通用户既没有 Bridge，也不能把自己的公众号加进去 |
| **乔木博客** `tools/wechat-bridge` | 自有 | `stable_token` 并缓存，遇 40001、40014、42001 时强制刷新并只重试一次；ImageMagick 转码兜底；GIF 原样透传；SSRF 防护；mmbiz 图片不重复上传；`thumb_media_id` | 已部署在 VPS 上，两个账号验证通过（2026-09-03） | 可以直接作为中转服务的底座 | 单租户：账号和密钥写在服务器文件里，所有调用方共用一个令牌 |

结论：这些产品都没有同时做到三点——**开源可构建、符合公众号白名单规定、普通用户零运维**。现有 Bridge 已经解决了最难的部分（token 稳定性和图片转码），只差多租户。

## 三、通用方案：一个发布接口，三种连接方式

```text
笔记 → 渲染 / 主题 / 内联（已有） → 预览（手机宽度 / 深色模式） → 发布前检查（已有）
                                                 │
                        ┌────────────────────────┼─────────────────────────┐
                        ▼                        ▼                         ▼
                   ① 直连微信                ② 乔木中转（受邀）             ③ 自建 Bridge
             AppID + Secret 存本机      AppID + Secret 存本机            账号存在自己的服务器
             requestUrl 直接请求        所有请求经中转服务器              现有 qmblog 模式
             要求本机 IP 在白名单      要求中转 IP 在白名单
                                         + 邀请密钥
                        └────────────── 统一的 WechatTransport ──────────────┘
                  getAccounts · uploadContentImage · uploadCover · addDraft · listDrafts · test
```

另外始终保留兜底：**复制公众号格式**，不需要任何配置。

### ① 直连（默认，通用）

- 设置里添加公众号：名称、AppID、AppSecret。Secret 存入 `SecretStorage`，不写进 `data.json`，也不交给 Agent。
- 调用 `stable_token`；遇到 token 类错误时强制刷新并只重试一次，逻辑从 Bridge 移植。
- 「测试连接」按钮：请求 `get_api_domain_ip`（只读）。返回 40164 时，从 errmsg 里解析出本机当前出口 IP，提示用户「把 x.x.x.x 加入白名单」，或者改用 ② 或 ③。**不建议用户填 `0.0.0.0/0`。**
- 局限：家庭宽带或 VPN 的出口 IP 会变，换网络后就会失效。移动端能用，但出口 IP 基本不固定。

### ② 乔木中转（受邀用户，多租户）

在现有 `tools/wechat-bridge` 上新增 `/v2/*` 多租户路由，服务本身不保存任何用户的公众号账号：

- **准入**：邀请密钥（`relay_keys.json`：key 的哈希、所有者、每日配额、允许的 AppID 列表、启用状态）。这就是「白名单用户可以用乔木的服务器」：没有密钥就拿不到服务。
- **凭据**：插件每次请求在请求头里带上 AppID 和 Secret，只走 https。服务端只在内存里按 `appid + sha256(secret)` 缓存 token，不落盘，不写日志。用户需要知道，中转服务在传输过程中能看到 Secret。设置页要明确写出来，并建议用户中途停用时去公众号后台重置 Secret。
- **范围**：只允许调用固定几个接口：`stable_token`、`media/uploadimg`、`material/add_material`、`draft/add`、`draft/batchget`、`get_api_domain_ip`。**不开放 `freepublish/submit`**，只进草稿箱。
- **防护**：沿用现有 SSRF 防护和 20 MB 上限；按密钥限流；日志只记录 key id、接口、耗时和 errcode；给出公开的 `GET /v2/egress-ip`，告诉用户该把哪个 IP 加入白名单。
- **复用**：图片转码、GIF 透传、mmbiz 去重、封面回退都复用 `server.mjs` 里的现成函数；把「账号来源」抽象出来（文件 或 请求头）即可，不需要重写。
- 同一份服务端代码开源后，谁都可以自建，这也就成了模式 ③ 的通用版本。

### ③ 自建 Bridge（现有模式）

保留现在的 qmblog Bridge：账号保存在服务器上，插件只保存访问令牌。适合乔木自己和团队使用：多台设备、多人共用同一组公众号，Secret 不出服务器。

### 设置和首次使用流程

1. 发布弹窗里，没有配置过的用户默认看到「复制公众号格式」，同时有一个次级入口「连接公众号以直接发草稿」。
2. 连接向导只有一步：选择连接方式（直连 / 乔木中转 / 自建），填写对应字段，点「测试」。失败时说清楚原因和下一步（白名单 IP、Secret 错误、账号被冻结），错误码对照参考 note-to-mp 的 50002、40125、40164。
3. 多个公众号混用不同的连接方式：每个账号记录自己的 `transport`。

## 四、预览与排版要补的能力（按优先级）

| 优先级 | 能力 | 来源 |
| --- | --- | --- |
| P0 | 侧边栏实时预览，跟随当前笔记，编辑时防抖刷新；手机宽度（375px）和微信深色模式预览（微信会自动反色，需要提前暴露浅色文字、透明 PNG 等问题） | converter 的手机外框预览；本插件已有 Modal 预览 |
| P0 | 三种连接方式和连接测试（见上文） | 本方案 |
| P1 | frontmatter 字段映射可配置（兼容 note-to-mp 的中文字段：`封面裁剪`、`打开评论`、`仅粉丝可评论`、`原文地址`、`样式`），降低从 note-to-mp 迁移的成本 | note-to-mp |
| P1 | 草稿列表：最近草稿、打开后台链接；本地记录 `wechat_media_id`，再次发布时提示「更新草稿还是新建」，避免重复 | note-to-mp 素材管理、md2wechat 去重 |
| P1 | 「按规则映射组件」而不是在笔记里写私有语法：例如「h2 → 编号标题」「> [!tip] → 提示卡片」，写在主题设置里 | note-to-mp 专家设置（只借鉴思路） |
| P2 | 笔记转图片，发成公众号贴图（`newspic`）或导出给小红书 | note-to-mp 2.3 |
| P2 | 封面：从笔记第一张图或 Unsplash 选图，裁剪成 2.35:1 和 1:1 | note-to-mp 2.4 |
| P2 | Agent 工作流 Skill：润色、标题、摘要、排版规则检查（段落长度、开头钩子），最后一步仍由用户在确认弹窗里点击 | WeSight `article-writer`、note-pub-skill |
| 不做 | 自动正式发布（`freepublish/submit`）、搜狗抓取、付费会员体系、`0.0.0.0/0` 引导 | — |

## 五、实施拆分

1. **插件：抽象 transport**。把 `bridge-client.ts` 包成 `WechatTransport` 接口，现有 Bridge 作为第一个实现，其余行为不变。补测试。
2. **插件：直连 transport**。移植 `stable_token` 缓存和重试、multipart 上传（`requestUrl` + ArrayBuffer，写法参照 note-to-mp 的 `wxUploadImage`，MIT）、`draft/add`；图片转码缺 ImageMagick，改在客户端用 canvas 转成 JPEG 或 PNG，GIF 大于 10 MB 时提示。
3. **服务端：`/v2` 多租户中转**。邀请密钥、请求头凭据、接口白名单、限流、`/v2/egress-ip`；在 `乔木博客` 仓库开 PR，部署前用测试号走完端到端。
4. **插件：连接向导、侧边栏实时预览、深色模式预览**。
5. 用测试号验证：直连（白名单内 / 白名单外）、中转、自建，每种都跑纯文本、本地图片、GIF、公式、Mermaid、长标题。**顺便验证白名单是否真的对 `access_token` 调用生效**，结果写回本文档。

## 待确认

- 乔木中转的准入方式：邀请密钥由乔木手动发放，还是和乔木现有的会员或账号体系打通？
- 中转服务能看到用户 Secret，这一点是否接受？如果不接受，可以改成「用户在中转服务注册账号，Secret 加密存在服务端」，但那样会变成有状态的服务，运维和安全责任都更重。
- 中转服务的出口 IP 是否固定、会不会更换（更换会导致所有用户的白名单失效，需要提前公告）。
