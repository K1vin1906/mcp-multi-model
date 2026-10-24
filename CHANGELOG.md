# Changelog

All notable changes to `mcp-multi-model` will be documented here.

## [3.12.0] - 2026-10-24 "no silent truncation"

起因(2026-10-24 复盘 10 月 25 次真实调用):7 次失败 = 4 次 60s 超时 + 3 次 Kimi「reasoning 耗尽」空答,每次失败都要重调;另有 Gemini 回复在句中被截且无任何标记。根因:思考模型的 reasoning token 与 `max_tokens` 共用预算(Gemini 3.8 Flash 默认档一次 research 先烧 2,600-3,700 thoughts),而 server 只在正文几乎为空时才报警。

### Added
- **`effort` 参数**(`ask_<model>` / `ask_ai` / `delegate` / `ask_both` / `ask_all`):`fast`(默认,低推理预算,最快)/ `deep`(高推理预算)。按模型在 config 的 `effort` 表映射到各家旋钮:Gemini `thinking_level`、OpenAI Chat/Responses `reasoning_effort`、Kimi K3 `reasoning_effort`;`default_effort` 决定不传时的档位(日常入口 fast,`gemini-pro` / `openai-pro` / `openai-pro-search` / `kimi_k3` deep);`ask_all` 统一 fast。实测 Gemini 3.8 Flash 联网 research 55s → 18s。
- **`thinking_headroom`**(defaults,默认 4000):思考模型(`reasoning: true` / `thinking: true` / 有 `effort` 表 / Gemini 3.x 文本模型)实际发送 `max_tokens + headroom`,正文保住调用方要的预算;<256 的小预算(check_health)不加。
- **截断永不静默**:三个 adapter 统一——finish `length` / `MAX_TOKENS` / Responses `incomplete:max_output_tokens` 且有正文 → 末尾追加 `[⚠️ Output truncated: max_tokens reached (reasoning used N tokens) ...]`;正文为空 → 原 reasoning 耗尽诊断;SAFETY / content_filter 等其他非正常结束 → `[⚠️ Output stopped early: ...]`;Gemini 流没给 finishReason 也标。结果对象新增 `finish_reason` / `truncated` / `thinking_tokens` / `effort` / `max_tokens_sent`,stats 行显示 `(N thinking)` 与 `effort=`。
- **流式 stall 看门狗**:headers 到达后,正文流若超过该模型 `timeout_ms` 没有新 chunk 即中止并报 `Stream stalled`,不再要么挂到宿主超时、要么静默返回半截(以前 headers 一到就 clearTimeout,正文无超时)。
- **`delegate` / `research` 运行期 fallback**:主模型失败(超时 / 5xx / 流中断)→ 用该类目 `fallback_chain` 第一个可用模型再试一次,回复头部注明 `⚠️ X failed: ... → answered by Y (fallback)`;最多两次尝试;预算超限不重试。`ask_<model>` / `ask_ai` 是显式指定,不 fallback。
- **`eval/reliability.js`**:可靠性验收(long 长文 / fast 默认档 / deep 升档 / headroom 回归 / fallback 合成 / askall / realtime / search / effort 参数接受度),导入 index.js 走真实 adapter;验收 = 静默截断 0 + 失败率 ≤ 5%。
- config 新字段:`effort` / `default_effort` / `thinking` / `extra_body`(原样并入请求体)/ `reasoning_effort`(Chat Completions 也透传)。

### Changed
- 超时按模型实际:`kimi` / `kimi_k27_code` / `kimi_k3` / `deepseek-pro` / `openai-pro` / `openai-search` / `gemini-pro` 加 `timeout_ms: 120000`(全局仍 60s)。
- `openai-pro-search` 固定 `reasoning_effort: high` 改为 effort 表(default deep,行为不变,fast 可省)。
- routing:research 的 fallback_chain 改 `[openai-search, kimi, openai, deepseek]`,realtime 改 `[gemini, openai-search, openai, deepseek]`——联网类目先落到有联网的模型。
- Server instructions 加第 (7) 条(effort 与截断标记);skill `multi-model` 1.1.0 新增「Effort」与「Nothing is cut silently」两节,成本/时长表按 fast 档更新。
- `deepseek` 加 `thinking: true`(长文实测 1,367 个 reasoning token 后 finish=length);Gemini `deep` 档 `thinking_headroom: 8000`(deep 的 thoughts 实测 3-6k)。
- 截断提示按预算去向分叉:reasoning / thinking 用了 0 token 时不再建议 `effort="fast"`(10-24 自测 Gemini 长文 7,996/8,000 全是正文,原提示误导),改为「raise max_tokens or narrow the ask; the answer itself outgrew it」;reasoning 数未知时只给通用提示。
- `ask_all` / `ask_both` 的 📊 汇总行加总耗时 `| 21.3s wall-clock |`,验「整体一分钟内」不必再从单模型最大延迟推断。
- `ask_all` 工具描述 / server instructions 第 (4) 条 / README 宿主超时节的「about 1-2 min」改为实测「about 10-20 s at fast effort, a minute or more at deep」(10-24 两轮 9 模型实测最慢 20.6s)。

### Measured(`eval/reliability.js`,2026-10-24,67 次调用共 $0.92,详见 eval/README.md)
- 失败 0 / 静默截断 0;Gemini 联网 research 默认 fast 中位 21s(此前 ~55s 且 1500 预算下句中截断),deep 中位 102s(5.9-6.3k thoughts,完整);`ask_all` 9 模型全部两轮作答,中位 10s、p90 17s(K3 15-17s,此前 60s 必超时);Kimi realtime 5/5 无超时(10 月 60s 下 2/8 超时);openai-search fast 31-36s / deep 89s。

## [3.11.1] - 2026-10-23

### Changed
- README **Privacy** 节写清全部对外行为:prompt / system prompt / 同 `conversation_id` 的历史只发给被调用的那一家 provider、启动时对 registry.npmjs.org 的一次版本检查、生成图片/视频后 macOS `open` 自动打开(传 `save_path` 可跳过)。为 Anthropic plugin 目录的安全扫描做准备(未披露的数据去向 = 首次提交直接拒)。
- `.claude-plugin/plugin.json` 的 npx 启动命令锁定精确版本(`mcp-multi-model@3.11.1`),目录校验要求(未锁 = Blocks)。以后每次发版同步改这里。

### Added
- 环境变量 `MCP_MULTI_MODEL_NO_UPDATE_CHECK=1` 关闭启动时的 npm 版本检查。

## [3.11.0] - 2026-10-23

「把脑发出去」:server 的工具跨宿主早就能跑,这版把编排规则随 server 一起发出去,Codex CLI / Gemini CLI / Grok Build / Cursor 用户拿到和 Claude Code 一样的用法。

### Added
- **Server instructions**(MCP initialize `instructions` 字段):握手时把使用规则注入宿主 system prompt。**实测(10-23)**:Gemini CLI 0.65 逐字读到;Codex CLI 0.163 不注入(模型看不到,靠下面的 skill 补);Claude Code 实测读到(新会话 system prompt 出现 multi-model 段)。前 512 字自包含:路由默认、`ask_all` 只看偏置不当证据、慢工具要调宿主超时、成本档。
- **Agent Skill `multi-model`**(`skills/multi-model/SKILL.md`,agentskills.io 开放标准格式,一份全宿主):完整编排手册——工具表、默认路由、成本与速度档、重要事实的取证协议(两路独立联网 + 自读一手来源 + 不一致必须解释)、`ask_all` 定位、各宿主 MCP 超时表、禁忌与示例。npm 包随带(`files` 加 `skills`)。
- **Claude Code plugin 清单**(`.claude-plugin/plugin.json`,内联 `mcpServers` 走 `npx -y mcp-multi-model`):`claude plugin install` 一步装 server + skill;Grok Build 直接读 Claude plugin 格式。
- README 新节 **Works with any MCP host**:Claude Code / Codex CLI / Gemini CLI / Grok Build / Cursor / Cline 的接入片段、默认超时与修法、skill 安装路径(官方文档核实的与二手来源分开标注)。

### Changed
- **工具描述全部宿主中立、英文**:`delegate`(去掉 Claude 专属措辞)、`ask_all`(明确"偏置检测、非证据、只有 Gemini/Kimi 联网、慢且贵")、`ask_both`(给出取证推荐配对)、`ask_ai`;`config.example.yaml` 全部 17 个模型与 4 个 tools 的描述换成英文一句话版(不再带维护者私人核验备注)。
- `gemini` 入口加 `timeout_ms: 120000`:Google Search grounding 常超全局 60s(10-22 实测 5 次 2 超时 2 截断)。
- CI:`actions/checkout` / `actions/setup-node` 升 v5,Node 22(Node 20 已 EOL,runner 强制 Node 24 的 deprecation 警告消除)。
- README 标题与 package.json 描述从 "for Claude Code" 改为面向任何 MCP 宿主。
- 运行期用户可见文本英文化:错误信息(超时 / 网络 / 模型未配置)、`delegate` 回复头(`🎯 Routed:`)、reasoning 耗尽提示、`ask_all` / `ask_both` 失败分隔、`translate` / `research` 结果头;`config.example.yaml` 的 4 条 routing `reason` 同步英文。`translate` / `research` 的中文 enum 值与系统提示不变(工具设计如此)。
- `generate_image` 的 `save_path` 描述改为与代码一致的 `/tmp/mcp-media/images/`(此前写的是不存在的 `/tmp/mcp-images/`)。

### Fixed
- 启动时的版本检查只在 npm 版本**高于**本地时提示更新;此前本地比 npm 新(从 git 跑、或发版前)也会误报 "Update available: v3.11.0 → v3.10.0"。

### Removed
- **agent-monitor UDS 事件广播**:`/tmp/agent-monitor.sock` 监听、30s 重试、`monitorClients`、`emitEvent` 及全部调用点、退出清理钩子、`net` import。agent-monitor 项目 2026-10-23 已归档删除,这段是死代码。工具返回里的 token / 耗时 / 成本统计不受影响。

## [3.10.0] - 2026-10-22

### Added
- **OpenAI 联网:新 adapter `openai-responses`**(Responses API + `tools:[{type:"web_search"}]`)。Chat Completions 不支持 web_search tool(只有 `gpt-5-search-api` 专用模型,实测把 Node 22 当 Active LTS 给过期答案),正经联网走 `/v1/responses`。两个新入口:**`openai-search`**(GPT-5.6 Luna,日常取证 ~$0.02-0.05/问)和 **`openai-pro-search`**(GPT-6 Astra,reasoning high + search_context_size high,重大决策深度取证,一问 $0.3-1)。回传正文自动附 `Sources:` URL 列表(去掉 `utm_source=openai`),`fmt` 行显示搜索次数。config 可选项:`search_context_size` / `allowed_domains` / `blocked_domains` / `tool_choice` / `reasoning_effort` / `web_search_sources`。
- **成本:`pricing.web_search_call`**($/次,官方 $10/1K)计入 `cost_usd` 与日预算。
- **模型级 `timeout_ms`** 覆盖全局 `defaults.timeout_ms`(所有 adapter 生效;`openai-pro-search` 设 180s)。
- **`ask_all: false`** config flag:该入口不进 `ask_all`(联网按次计费且慢),仍可 `ask_ai` / `ask_both` 显式调用。
- **`check_health` 对联网入口 ping 不触发搜索**(adapter 收到 `healthPing` 时不挂 tools),Responses API `max_output_tokens` 下限 16 已处理。
- **`eval/` 路由实测 benchmark** — `node eval/run.js run`:5 类任务(code / extraction / reasoning / research / creative)× 4 题 × 6 模型,客观题自动打分(模型代码在 `node --permission` 沙箱跑隐藏测试 / JSON 字段级比对 / 标准答案精确匹配),research / creative 走匿名盲评 rubric;产出 `eval/results/<run>/TABLE.md`。首轮 2026-10-21(120 次调用,$0.78)的结论写进 README "Why these defaults"。`eval/` 不随 npm 包发布。
- **Library 模式** — `MCP_MULTI_MODEL_LIBRARY=1` 时 `index.js` 可被 import(导出 `callModel` / `models` / `calcCost` 等),不启动 stdio transport 和 monitor socket,供跑分脚本复用同一套 adapter。默认启动行为不变。

## [3.9.0] - 2026-09-09

两个月(7-10 → 9-09)的模型市场变化一次追平。每个新 ID 都对真 API 探测过(live `/models` + 空请求 404/400 探活 + 实际调用)。

### Fixed
- **`generate_image` 默认路径已坏(Imagen 4 被 Google 下线)** — `imagen-4.0-fast-generate-001` / `imagen-4.0-ultra-generate-001` / `imagen-4.0-generate-001` 在 v1 与 v1beta 全部 404,ListModels 亦无任何 imagen 条目。与 3.8.0 的 Veo 3.0 死链同一类问题(check_health 跳过生成型模型所以没报)。删除 `gemini-image` / `imagen-4-ultra` 两条,新增 **`nano-banana-lite`**(`gemini-3.1-flash-lite-image`,官方 $30/M image tokens ≈ $0.034/1K 图)接任 `generate_image` 默认;`nano-banana` / `nano-banana-pro` 从 preview ID 切到 GA ID(`gemini-3.1-flash-image` / `gemini-3-pro-image`,价格不变)。
- **GPT-6 会被发 `max_tokens` 而 400** — `useNewTokenParam` 正则只匹配 `gpt-5|o1-|o3-|o4-`,补上 `gpt-6`;reasoning 兜底正则同步扩到 `gpt-5.[5-9]|gpt-6`(config flag 仍优先)。
- **Gemini 3.x thinking 三处修正** — (1) `thoughtsTokenCount` 现计入 completion tokens(thinking 按 output 计费,之前成本被低估 5-10x);(2) 流式路径跟踪 `finishReason`,`MAX_TOKENS` 且正文 <20 字时回显诊断(实测 3.8 Flash `maxOutputTokens=200` 默认 thinking 会吃掉 382 thoughts 只剩 8 个字正文);(3) 新增 config 字段 `thinking_level: low|medium|high` 透传 `generationConfig.thinkingConfig.thinkingLevel`(默认不设=模型默认 medium;`gemini` 入口暂保持默认,追求便宜/低延迟可自行设 low)。
- **图像模型成本显示错误** — `pricing.output` 对图像模型语义是 $/张,之前按 token 公式算出 `$0.000047` 这种数;现按 `张数 × 单价`。
- **思考模型正文为空时静默返回空串** — 根因是 reasoning 吃满 `max_tokens`(finish_reason=length,K2.7 Code 在 ask_all 里复现)。流式与非流式两条路径现在都回显诊断文本「思考耗尽 max_tokens,请提高 max_tokens 或换非思考模型」。

### Changed
- **OpenAI**:`openai-pro` = `gpt-5.6-sol` → **`gpt-6-astra`**(2026-09-03 发布,1.05M context / 128K 输出,$10/$50,锁 temperature=1 需 `reasoning: true`,实测确认)。`openai` 仍 `gpt-5.6-luna`,**定价 $1/$6 → $0.20/$1.20**(OpenAI 2026-07-30 降价 80%)。备注:Sol 现 $4/$20 促销至 11-21,嫌 Astra 贵可切回。
- **Gemini**:`gemini` = `gemini-3-flash-preview` → **`gemini-3.8-flash`**(2026-09-02 GA,1M context,thinking 三档;Google Search grounding 实测正常)。定价 $0.50/$3 → **$0.75/$3.75 intro 价至 2026-12-31**,2027-01-01 起 $1.50/$7.50(届时重估)。`gemini-pro` 保持 `gemini-3.1-pro-preview`(Google 至今无 GA Pro 后继)。
- **Kimi**:`kimi` = `moonshot-v1-32k`(已下线 404)→ **`kimi-k2.6`** + `reasoning: true`(思考模型锁 temperature=1);`$web_search` builtin 走现有 tool loop 实测通过(MCP stdio 端到端 17s)。定价 ¥6.50/¥27 → $0.92/$3.80。
  - 为什么不上 K3 联网:官方 .cn 文档标注「联网搜索正在更新升级中,近期不建议使用,当前文档已过时」;实测 K3 `$web_search` 第二轮回传一律 400 `tokenization failed`(3 组查询 / 关 thinking / 5 种回传格式全复现)。K3 联网官方推荐 Formula API「官方工具」通道(另一套协议,未实现)。
- **DeepSeek**:ID 不变(`deepseek-v4-flash` 已是 0731 版、`deepseek-v4-pro` 已是 0813 GA 版,官方说明调用方式不变),定价核对无变化。
- 依赖:`@modelcontextprotocol/sdk` 1.29 → 1.30,`zod` 4.3 → 4.5,`js-yaml` 4.1 → 4.3(均 semver 范围内)。

### Added
- **Kimi K3 入口 (`ask_kimi_k3` / `ask_ai model="kimi_k3"`)** — Moonshot 旗舰(2026-07-16 发布,2.8T 开源权重,1M context,原生视觉,始终思考不可关)。`reasoning: true` + `force_non_streaming: true`,不开 web_search。定价 ¥20/¥100 → $2.82/$14.08。自动进入 `ask_all`(现 8 个 chat 模型)。
- **`nano-banana-lite`** 见 Fixed。

### Known
- K3 顶层 `reasoning_effort`(low/high/max,默认 max)与 K2.6 `thinking: disabled` 未透传;可选后续加通用 `request_params`。
- K3 联网等 Moonshot 文档更新后再评估官方工具通道。

## [3.8.0] - 2026-07-12

### Added
- **Kimi K2.7 Code 入口 (`ask_kimi_k27_code` / `ask_ai model="kimi_k27_code"`)** — Moonshot 新编程旗舰 `kimi-k2.7-code`,262K context + 多模态(图/视频),agentic coding 最强。走 `reasoning: true`(API 锁 temperature=1 / top_p=0.95,server 对 reasoning 模型跳过这两参数)。**故意不开 `web_search`**:code 用途无需联网,且规避 K2.7「多步 tool call 必须回传 assistant 的 `reasoning_content`」的新约束(当前 tool loop 未实现,开了会在第二轮报错)。编程默认仍走 DeepSeek,此为显式备选。已对真 API 验证:model ID 有效、不发 temperature 返回正常、发 temperature=0.5 确认被锁。

### Removed
- **Kimi K2.6 (`kimi_k26`)** — 被 K2.7 Code 逐项取代:同 262K context、同多模态、同价(¥6.50/¥27 in/out),更新且编程更强,无剩余差异化价值。联网搜索仍走默认 `kimi` (moonshot-v1-32k),不受影响。

### Changed（三家模型刷新,基于 live `/models` + 官方定价核对,每个新 ID 都 curl 验证过）
- **OpenAI GPT-5.4/5.5 → GPT-5.6**(2026-07-09 GA):`openai` = `gpt-5.4-mini` → **`gpt-5.6-luna`**($0.75/$4.50 → $1/$6,新一代廉价档);`openai-pro` = `gpt-5.5` → **`gpt-5.6-sol`**(同价 $5/$30,新旗舰)。⚠️ **GPT-5.6 全系锁 `temperature=1`**(curl 实测 `only 1 is allowed`),两条都加 `reasoning: true`;`index.js` 的 isReasoningModel 正则只到 gpt-5.5,5.6 靠 config flag。中档 Terra($2.50/$15)未加入。
- **视频模型死链修复**:`gemini-video` = `veo-3.0-generate-001` → **`veo-3.1-generate-preview`**。旧 ID 已 404 下线(`generate_video` 之前必失败,因 check_health 跳过视频模型未被发现)。Veo 3.1 目前只有 preview 版。
- **DeepSeek 定价核对 + 证伪注释清理**:删掉 `deepseek-pro` 那条「2026-05-31 后价格回归 4x」的预测——实际未发生,现价维持 `$0.435/$0.87`(官方 + 核对)。`deepseek-v4-flash` output 微调 `$0.29 → $0.28`。无模型变更(`/models` 只有 v4-flash/v4-pro)。
- **Gemini 保持不变**:`gemini-3.5-flash` 已 GA 但价格是现用 `gemini-3-flash-preview` 的 3 倍($1.50/$9 vs $0.50/$3),用户选择主力默认继续用便宜的 preview 档;`gemini-pro` 无 3.5 版可升。

## [3.7.0] - 2026-05-17

### Fixed
- **`ask_all` / `ask_both` 把文本 prompt 发给 image/video 生成模型导致桌面端尴尬响应** — 之前两个工具迭代全部 `modelKeys`,Imagen / Nano Banana / Veo / GPT Image 收到 chat 格式 prompt 后或返回 endpoint 错误,或返回"我是视频/图像模型,无法回答"。现在派生 `chatModelKeys`(过滤掉带 `image_generation` / `video_generation` flag 的),`ask_all` 和 `ask_both` 只跑 chat 模型;tool description 显式说明"Image/video models excluded — use generate_image / generate_video instead",让 Claude 桌面端不再尝试。
- **`delegate` 的 category 在 `delegate_to` 模型 key 缺失时静默 fallback 到全局 deepseek,与 category 语义错配** — 例如用户没配 DeepSeek key 时,`code` category 本应找另一个能写代码的模型,但旧逻辑直接走全局 fallback(可能完全不合适)。现在每个 category 新增 `fallback_chain`(同类型备选清单),启动时按顺序 resolve 出实际可用模型,在 reason 里标 `[fallback: X key missing → Y]`。

### Added
- **启动日志打印 routing 路由表** — `📋 Delegate routing: research → Gemini, code → DeepSeek, ...`,fallback 项显式标出 `(fallback, deepseek key missing)`,用户一眼能看到自己 key 配置触发了哪些重映射。
- **`delegate` tool description 动态包含 category 映射** — 之前只有"智能委派"一句,Claude 不知道每个 category 路由到谁,倾向直接走 `ask_<provider>` 绕开。现在 description 形如 `(Routes: research→Gemini, code→DeepSeek*, ...; * = fallback due to missing key)`,Claude 可基于映射信任地用 delegate。

## [3.6.6] - 2026-05-11

### Fixed
- **Kimi K2.6 `invalid temperature: only 1 is allowed`** — K2.6 是 reasoning 模型,Moonshot API 拒绝 temperature ≠ 1。新增通用 config 字段 `reasoning: true`,让 server 跳过自动设 temperature;canonical 与 example 的 `kimi_k26` 已启用。原有正则 `(gpt-5\.5|o1-|o3-|o4-)` 作 fallback,未来新增 reasoning 模型直接改 config 不动代码。
- **`check_health` 把视频/图像生成模型当 chat 模型 ping 导致 (a) 视频模型必报 offline,(b) 图像模型真实扣费** — Veo / Imagen / Nano Banana / GPT Image 等模型走专用 endpoint(`:predictLongRunning` / `:predict`),check_health 通用 ping 走 `:streamGenerateContent` / `chat/completions` 不仅会报错,图像类还会真实产出图片并计费。现在带 `video_generation` / `image_generation` flag 的模型在 check_health 中标 `skipped`(⏭️ icon)而非 online/offline。

### Changed
- **`ask_all` / `ask_both` description 双语化** — 原中文描述让 ToolSearch 的英文关键词 `ask_all` / `all models` / `parallel` 命中率低,影响其他 Claude(尤其桌面端)的工具发现。改为英文为主 + 中文括注。

## [3.6.5] - 2026-05-11

### Fixed
- **DeepSeek V4 Pro 等思考模型流式空响应** — 思考模型(`reasoning_content` 通道)流式 SSE 的 `delta.content` 在 thinking 阶段长时间为空,且 reasoning_tokens 会吃掉 `max_tokens` 预算导致最终始终拿不到可见 content。新增 `force_non_streaming` 模型级 flag,设了之后跳过流式,直接读非流式 `message.content`(实测 800 token 预算下 reasoning_tokens=78 + completion_tokens=104,content 完整返回)。canonical + example 已在 `deepseek-pro` 启用。

### Added
- 模型配置项 `force_non_streaming: true` — 通用 flag,任何走 OpenAI 兼容协议但希望强制非流式的模型(reasoning 类、批处理类)都可启用。

## [3.6.4] - 2026-05-11

### Fixed
- **`config.example.yaml` 模型清单与 README 对齐** — 修复 npx / `.mcpb` 用户开箱即坏的产品问题:此前 `config.example.yaml` 仍是 2024 末/2025 初的模型 id(`gpt-4o-mini`、`gemini-2.x` 等),但 README 一直宣传"GPT-5 reasoning、Imagen 4、Veo 3.x"。现在 example 同步到最新清单:DeepSeek V4 (flash + pro)、GPT-5.4 mini / GPT-5.5、Gemini 3 Flash / 3.1 Pro、Imagen 4 Fast / Ultra、Nano Banana 2 / Pro、GPT Image 2 (medium + HD)、Veo 3.x、Kimi v1-32k / K2.6。

## [3.6.0] - 2026-04-13

### Added
- **Startup version check** — async check against npm registry on startup; notifies via stderr when a newer version is available (`📦 Update available: vX → vY`). Non-blocking, fails silently if offline.
- **Multi-model cost summary** — `ask_all` and `ask_both` now append a `📊` summary line showing models called, total tokens, and per-model + total cost breakdown.
- **3 new providers** — Mistral, Groq, Together AI added to manifest and config template (12 providers total).
- **Provider reorder** — manifest `user_config` and config template sorted by global popularity: OpenAI → Gemini → Grok → Perplexity → Mistral → Groq → OpenRouter → DeepSeek → Qwen → GLM → Kimi → Together AI.

### Changed
- **New icon** — bright hub-and-spoke design on white background; high contrast at small sizes (replaces dark cosmic icon that was invisible in Claude Desktop tool buttons).
- **Version string from package.json** — `PKG_VERSION` read once at startup, eliminates hardcoded version in 2 places (`McpServer` constructor + startup banner).

## [3.5.0] - 2026-04-10

### Added
- **Unified `ask_ai` tool** — one entry point to query any configured model by passing `model` parameter (e.g. `deepseek`, `gemini`, `kimi`), with per-call `temperature` (0–2) and `top_p` (0–1) inference parameters. Existing `ask_deepseek` / `ask_gemini` / `ask_kimi` tools remain available for backward compatibility. `delegate` retains independent value for category-based auto-routing.

## [3.4.0] - 2026-04-10

### Added
- **`generate_video` tool** — generate short video clips via Gemini Veo models (`veo-3.1-generate-preview` and `fast`/`lite` variants). Uses long-running polling (up to 3 minutes). Videos saved to `/tmp/mcp-media/videos/vid_{timestamp}.mp4` or custom `save_path`, and auto-opened.
- Missing API key startup hint — on server start, show signup links for any required `*_API_KEY` env var that is not set.

### Fixed
- `generate_video` `duration` schema: constrained to exactly `4`, `6`, or `8` seconds via `z.literal` union. Veo API rejects odd seconds despite the error message suggesting "between 4 and 8".
- `generate_image`: confirmed correct Gemini model id `gemini-2.5-flash-image` (previously docs had stale `preview-image` suffix).

## [3.3.0 – 3.3.2] - 2026-04-10

### Added
- **Model fallback chain** — `callModel` auto-switches to `fallback_to` target on failure, with `_isFallback` guard to prevent loops.
- **`check_health` tool** — pings all configured models and reports online/offline status plus latency.
- **Response caching** — identical prompts cached with configurable `cache_ttl_ms`; conversation calls are never cached.
- **Daily budget limit** — configurable `daily_budget_usd`; calls exceeding the daily spend are rejected.
- **Image generation** — Gemini Nano Banana model family (`gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`). Auto-saves to `/tmp/mcp-media/images/` and opens preview.
- **`delegate` routing tool** — category-based auto-routing to appropriate model (research / code / realtime / creative / auto).

## [3.2.0] - earlier

### Added
- Local model support (Ollama, LM Studio, llama.cpp) via `openai`-compatible adapter.
- Streaming output (SSE) for OpenAI-compatible and Gemini APIs.
- Cost tracking with per-model `pricing` config.
- Conversation history via `conversation_id` (30-minute expiry, up to 10 turns).

## Earlier

See git log for pre-3.2 history.
