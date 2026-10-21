# Blind grading sheet — 2026-10-21T15-45-57-v0

Grade every response below WITHOUT looking at raw.jsonl / grading_key.json. Write `grades.json` in this directory as:
```json
{ "R-xxxx": { "score": 4, "note": "one-line justification" }, ... }
```
Scores are integers 0–5 per the rubric of each task. Failed calls are listed for completeness and get 0 automatically.

## research

**Rubric:** Score 0-5 = accuracy (0-2: 2 = no factual errors, 1 = minor slip, 0 = material error) + coverage (0-2: all requested sub-points addressed) + form (0-1: length/format constraint met AND a clear conclusion/recommendation given when asked).

### research-sqlite-vs-postgres

**Prompt:**

```
在单机桌面应用场景(macOS 菜单栏工具,单用户,本地数据 <1GB)下,对比 SQLite 和 PostgreSQL:并发写入、部署与分发、备份、全文检索四个方面各说一点,最后给出明确选择。全文不超过 300 字。
```

**Grader notes (gold facts):** Key facts: SQLite single-writer (WAL allows concurrent readers), zero-config embedded file vs PostgreSQL needs a running server/installer; backup = copy file / .backup / VACUUM INTO vs pg_dump; FTS5 vs tsvector/GIN. Expected recommendation: SQLite.

#### R-12b5

- **并发写入**：SQLite 同时仅支持一个写事务，单用户桌面场景通常足够；PostgreSQL 支持更高并发写入。  
- **部署与分发**：SQLite 内嵌、零服务、易随应用打包；PostgreSQL 需安装、初始化并维护后台服务。  
- **备份**：SQLite 可用 Backup API 或在一致性快照下复制单文件；PostgreSQL 可用 `pg_dump`，但流程更重。  
- **全文检索**：SQLite FTS5 可满足本地搜索；PostgreSQL 全文检索功能更强、可扩展性更好。  

**选择：SQLite**。其部署简单、备份方便，且性能足以覆盖该场景；仅在未来需要多用户或高并发写入时考虑 PostgreSQL。

---

#### R-5e61

在该场景下：

- **并发写入**：SQLite 仅支持单写者，但单用户桌面工具几乎无并发写冲突；PostgreSQL 并发强，却需独立服务，单用户下优势用不上。
- **部署与分发**：SQLite 是嵌入式单文件，零配置，随应用打包即可；PostgreSQL 需安装并维护数据库服务，分发和启动成本高。
- **备份**：SQLite 直接复制数据库文件即可完成一致性备份；PostgreSQL 通常需 `pg_dump` 或管理备份，运维更重。
- **全文检索**：PostgreSQL 的 `tsvector` 更强大，但 SQLite 的 FTS5 已能满足本地搜索需求且更轻量。

**明确选择：SQLite。**

---

#### R-4e45

* **并发写入**：SQLite 在 WAL 模式下单写多读，完全能从容应对单用户交互；PostgreSQL 强大的高并发细粒度锁在此场景大材小用。
* **部署与分发**：SQLite 为无服务器的嵌入式库，零外部依赖且与 macOS 深度集成；PostgreSQL 需打包并常驻独立后台服务，极大增加安装包体积与权限签名成本。
* **备份**：SQLite 是单一独立文件，直接复制或配合 Time Machine 即可秒级备份；PostgreSQL 则必须依赖 `pg_dump` 等专有工具或服务导出。
* **全文检索**：SQLite 内置的 FTS5 虚表开箱即用，在 <1GB 数据量下兼具极致轻量与毫秒级查询；PostgreSQL 功能虽强但配置繁琐、内存开销偏大。

**明确选择**：**SQLite**。其极致轻量、零维护与嵌入式特性是此类轻量桌面工具的绝对最优解。

---

#### R-b0f3

在 macOS 菜单栏工具场景（单用户、<1GB）下：

- **并发写入**：SQLite WAL 模式已满足一写多读，单用户无瓶颈；PostgreSQL 的 MVCC 在此纯属过重。
- **部署与分发**：SQLite 为单文件零配置，直接嵌入 App；PostgreSQL 需安装服务端，桌面分发极繁琐。
- **备份**：SQLite 直接复制数据库文件即可；PostgreSQL 需 pg_dump 等工具，流程复杂。
- **全文检索**：SQLite 内置 FTS5，轻量够用；PostgreSQL 虽强，但小数据量下无需引入额外架构负担。

**选择 SQLite**。

---

#### R-840c

- **并发写入**：单用户下 SQLite 单写者足够；PostgreSQL 高并发强但此处过剩。  
- **部署分发**：SQLite 嵌入式、零配置，适合菜单栏 App；PostgreSQL 需安装并常驻服务，分发复杂。  
- **备份**：SQLite 单文件复制或 backup API 即可；PostgreSQL 需 pg_dump 等工具与服务配合。  
- **全文检索**：SQLite FTS5 对 <1GB 本地数据足够；PostgreSQL 的 tsvector/GIN 更强但运维更重。  

**明确选择：SQLite。**

---

#### R-9c52

1. **并发写入**：单用户场景无高并发，SQLite 开启 WAL 模式足以游刃有余；PostgreSQL 的高并发处理优势在此场景下纯属性能过剩。

2. **部署与分发**：SQLite 作为内嵌库可随应用直接打包（零配置）；PostgreSQL 则需在用户电脑上额外安装和运行独立服务端，严重破坏轻量级工具的安装体验。

3. **备份**：SQLite 数据库本质就是一个本地文件，直接“复制粘贴”即可完成备份；PostgreSQL 则需依赖 `pg_dump` 等命令行工具导出，对普通用户极其繁琐。

4. **全文检索**：SQLite 内置 FTS5 扩展，对 <1GB 的本地数据搜索极快且系统开销极低；PostgreSQL 检索功能虽更强大，但后台常驻内存占用过高。

**明确选择**：坚决选择 **SQLite**。其零依赖、免维护和单文件的特性完美契合 macOS 菜单栏工具的需求，而 PostgreSQL 在此场景下过于笨重。

---

### research-websocket-vs-sse

**Prompt:**

```
A browser dashboard needs server-pushed updates roughly once per second. Compare WebSocket and Server-Sent Events on: message direction, automatic reconnection, behavior through HTTP/2 and reverse proxies, and the per-browser connection limit. Finish with a one-sentence recommendation. Max 250 words.
```

**Grader notes (gold facts):** Key facts: WS bidirectional / SSE server→client only; SSE auto-reconnects via EventSource with Last-Event-ID, WS needs manual reconnect; SSE is plain HTTP so works through proxies and multiplexes over HTTP/2 (6-connection limit is HTTP/1.1 only), WS needs Upgrade support (HTTP/2 WS via RFC 8441 is rarer); recommendation for one-way 1Hz updates: SSE.

#### R-7e82

**Message direction:** WebSocket is full-duplex; SSE is strictly unidirectional (server→client).

**Automatic reconnection:** SSE includes built-in automatic reconnection with event-ID resume; WebSocket requires custom reconnect logic.

**HTTP/2 and reverse proxies:** SSE uses plain HTTP, so it passes through HTTP/2 and reverse proxies with standard load-balancing rules—though HTTP/2 multiplexing over a shared TCP connection can theoretically introduce head-of-line blocking—while WebSocket needs an Upgrade handshake that some corporate proxies and firewalls block (HTTP/2 WebSocket bootstrapping is not yet universal).

**Per-browser connection limit:** SSE under HTTP/1.1 shares the browser’s per-domain limit of roughly six concurrent connections, which becomes painful across multiple tabs; HTTP/2 multiplexing solves this by reusing one TCP connection. WebSocket connections are counted separately and typically allow higher per-domain limits.

**Recommendation:** For a roughly once-per-second unidirectional dashboard, choose SSE because its automatic reconnection, simpler HTTP-based deployment, and sufficient performance avoid WebSocket's complexity unless you require bidirectional messaging.

---

#### R-28fd

| Aspect | WebSocket | Server-Sent Events (SSE) |
|---|---|---|
| Message direction | Full-duplex: both browser and server can send messages at any time. | Server-to-browser only; the browser uses ordinary HTTP requests for client-to-server actions. |
| Automatic reconnection | None standardized; the application must detect disconnection, reconnect, and usually implement backoff and state recovery. | `EventSource` automatically reconnects, supports retry delays, and can use event IDs (`Last-Event-ID`) to resume logically. |
| HTTP/2 and reverse proxies | Traditionally uses an HTTP/1.1 `Upgrade`; proxies and load balancers must explicitly support WebSocket upgrades and idle timeouts. HTTP/2 WebSockets use extended CONNECT and are not uniformly supported by infrastructure. | Runs as a long-lived HTTP response and generally works naturally over HTTP/2 multiplexing. Proxies may nevertheless buffer the stream or enforce idle/request timeouts, so flushing, heartbeats, and buffering-disable settings may be needed. |
| Browser connection limit | Not generally subject to the classic six-per-origin HTTP/1.1 request limit, though browser and server resource limits still apply. | Under HTTP/1.1, typically counts against the browser’s roughly six simultaneous connections per origin; under HTTP/2, streams share one connection and the negotiated stream limit applies. |

**Recommendation:** For a dashboard needing only server-to-browser updates about once per second, choose SSE unless it also requires low-latency bidirectional messaging or WebSocket-specific semantics.

---

#### R-49d2

WebSocket provides bidirectional, full-duplex communication, while Server-Sent Events (SSE) are one-way, server-to-client only; client messages require a separate HTTP request.

SSE has built-in automatic reconnection via `EventSource`, including resumable last-event IDs. WebSocket has no native auto-reconnect; applications must implement it manually.

SSE is plain HTTP, so it works well through reverse proxies and HTTP/2 multiplexing, though some proxies may buffer streams unless configured. WebSocket uses an HTTP upgrade, which most proxies support but often needs explicit configuration; HTTP/2 WebSocket support remains inconsistent.

Per browser, HTTP/1.1 limits connections to about six per domain, so multiple SSE streams can exhaust this pool; WebSocket connections are not counted against this HTTP/1.1 limit. Over HTTP/2, SSE multiplexing removes that practical limit.

For a one-second dashboard update stream, use SSE: it is simpler, auto-reconnects, and proxies well.

---

#### R-0482

Here is how WebSocket and Server-Sent Events (SSE) compare for your dashboard:

*   **Message Direction:** WebSocket provides full-duplex, bidirectional communication. SSE is strictly unidirectional (server-to-client).
*   **Automatic Reconnection:** SSE natively supports automatic reconnection and tracks dropped messages using last-event IDs. WebSocket connections fail silently, requiring developers to write custom reconnection and state-recovery logic.
*   **HTTP/2 Behavior:** SSE natively multiplexes over HTTP/2, allowing many streams to share a single TCP connection. WebSocket traditionally struggles with HTTP/2 multiplexing (though RFC 8441 improves this) and often falls back to requiring dedicated, individual TCP connections.
*   **Reverse Proxies:** SSE uses standard HTTP traffic, making it simple to pass through load balancers and proxies, provided proxy buffering is disabled to prevent delayed updates. WebSocket requires explicit proxy configuration to handle the HTTP `Upgrade` header and manage long-lived idle timeouts.
*   **Per-Browser Connection Limit:** Over HTTP/1.1, browsers strictly limit SSE to roughly six connections per domain, meaning opening multiple dashboard tabs can quickly block new connections. HTTP/2 eliminates this issue via multiplexing. WebSocket is not bound by the standard HTTP/1.1 pool limit and typically allows 30 to 255 concurrent connections per domain.

**Recommendation:** Use Server-Sent Events delivered over HTTP/2, as its unidirectional nature, native multiplexing, and built-in reconnection perfectly align with the needs of a read-only dashboard.

---

#### R-b070

* **Message Direction:** WebSocket is bidirectional (full-duplex), allowing simultaneous client-to-server and server-to-client streaming. SSE is strictly unidirectional (server-to-client); upstream communication requires standard HTTP requests.
* **Automatic Reconnection:** SSE has native, built-in reconnection handling in the browser (`EventSource`) with automatic state tracking via the `Last-Event-ID` header. WebSockets lack native reconnection logic, requiring custom JavaScript implementation or external libraries.
* **HTTP/2 and Reverse Proxies:** SSE operates over standard HTTP (`text/event-stream`), multiplexing seamlessly over HTTP/2 alongside regular traffic and passing through corporate firewalls and reverse proxies with minimal configuration (only disabling proxy response buffering). WebSockets require an HTTP upgrade handshake, bypass HTTP/2 multiplexing in most setups, and require explicit reverse-proxy configuration for header forwarding and idle timeouts.
* **Connection Limits:** Over HTTP/1.1, SSE is constrained by the browser's 6-connection-per-domain limit, which can starve concurrent browser tabs; over HTTP/2, this limitation vanishes because connections are multiplexed into a single TCP stream. WebSockets are exempt from HTTP/1.1 connection limits, constrained only by system and browser socket limits.

**Recommendation:** For a read-heavy dashboard needing only one-way updates, use **Server-Sent Events over HTTP/2** to benefit from built-in reconnection, simple proxy handling, and zero protocol overhead without WebSocket complexity.

---

#### R-dab6

- **Message direction:** WebSocket is full-duplex (client ↔ server). SSE is server → client only; client messages use separate HTTP requests.
- **Automatic reconnection:** SSE’s `EventSource` reconnects automatically, supports `retry`, and resumes with `Last-Event-ID`. WebSocket has no built-in reconnection—you implement backoff, heartbeats, and resume logic.
- **HTTP/2 and reverse proxies:** SSE is ordinary HTTP streaming, so HTTP/2 multiplexing helps, but proxies must disable buffering, permit long-lived responses, and tune idle timeouts/compression. WebSocket needs HTTP `Upgrade`/tunneling support (or extended CONNECT over HTTP/2 where supported), plus proxy idle-timeout and upgrade configuration; HTTP/2 WebSocket support is less universal.
- **Per-browser connection limit:** Under HTTP/1.1, SSE is commonly capped at about six connections per origin; HTTP/2 removes that practical cap. WebSockets are not subject to the HTTP/1.1 six-connection limit, though browser/host-specific limits still exist.

**Recommendation:** Use SSE for this once-per-second server-push dashboard unless you need low-latency bidirectional messaging.

---

### research-swift6-strict-concurrency

**Prompt:**

```
一个已有的 SwiftUI + SwiftData 项目要打开 Swift 6 严格并发检查(strict concurrency = complete)。列出迁移时最常见的 3 个报错/痛点,每个给出一句话的应对方式。不超过 250 字。
```

**Grader notes (gold facts):** Plausible pain points: non-Sendable types crossing actor boundaries (make Sendable / @MainActor / isolate); global mutable state ("var is not concurrency-safe" → let / actor / nonisolated(unsafe)); main-actor isolation of UI code called from background (@MainActor annotations, Task { @MainActor in }); SwiftData ModelContext not Sendable (use @ModelActor / pass PersistentIdentifier). Accept any 3 that are real.

#### R-fbf8

1. **KeyPath 不满足 Sendable**：`SortDescriptor` 与 `#Predicate` 中的 `\.property` 报 `KeyPath` 不合规。显式声明为 `Sendable KeyPath<Model, Type>` 或提前提取为常量后传入。

2. **@MainActor 隔离缺失**：SwiftUI 视图、ViewModel 或 UI 相关方法未标注导致跨 Actor 访问报错。在视图、视图模型及所有 UI 操作方法上统一添加 `@MainActor` 标注。

3. **全局/静态可变状态**：全局 `var` 或 `VersionedSchema` 等静态属性被判定为共享可变状态。将其改为 `let` 常量，或添加 `@MainActor` 隔离，或封装进 `actor` 管理。

---

#### R-8cc5

1. **SwiftData 的 `ModelContext`/`@Model` 跨并发域传递，报非 `Sendable` 或数据竞争**：将持久化操作限制在 `@MainActor`，跨域只传递 `persistentModelID` 或 Sendable DTO。  
2. **`@MainActor` 隔离与 `Task.detached`、后台闭包冲突**：避免 detached 直接访问 UI/SwiftData，改用 `Task {}` 或在目标 actor 内创建并使用独立 context。  
3. **`ObservableObject`、属性包装器或协议方法出现隔离不匹配**：为类型/成员明确标注 `@MainActor`，或让协议与实现统一采用相同的 actor 隔离。

---

#### R-6910

打开 Swift 6 严格并发后，SwiftUI + SwiftData 最常见的 3 个痛点：

1. `@Model` 对象/`ModelContext` 非 Sendable，被 `Task` 捕获报错。应对：SwiftData 操作限定主 actor，后台用 `@ModelActor` 隔离。  
2. 自定义 View 未显式主线程隔离，body 访问主隔离状态报错。应对：给对应 View 结构体加 `@MainActor`。  
3. `@Sendable` 闭包捕获模型对象或 Context 报并发安全错误。应对：闭包外提取 Sendable 值（如 ID、字符串）传入，或用 `MainActor.assumeIsolated` 执行 SwiftData 操作。

---

#### R-d7a3

1. **跨并发域传递 `@Model` 实例报错（非 Sendable）**
   **应对**：禁止跨 Actor 传递实体对象，改传 `PersistentIdentifier` 后在目标上下文中重新查询。

2. **后台并发直接访问 `ModelContext` 触发隔离报错**
   **应对**：将后台操作封装到遵循 `@ModelActor` 的自定义 Actor 中，由其私有上下文独立执行增删改。

3. **ViewModel 与 SwiftUI 视图产生 `@MainActor` 隔离冲突**
   **应对**：将 ViewModel 及相关业务类显式标记为 `@MainActor`，确保与视图层保持同域隔离。

---

#### R-31eb

在 SwiftUI + SwiftData 项目开启 Swift 6 严格并发检查时，最常见的 3 个痛点及应对方式如下：

**1. SwiftData 模型跨线程传递报错 (Non-Sendable Type)**
*   **痛点**：`@Model` 类默认不是 `Sendable`，将模型实例传入 `Task` 或其他 Actor 时会触发隔离错误。
*   **应对**：跨界传递时只传模型的 `PersistentIdentifier`，在目标上下文中重新抓取数据实例。

**2. 后台操作 ModelContext 报错 (Actor Isolation)**
*   **痛点**：在后台任务中直接使用视图层的 `@Environment(\.modelContext)` 会因 `@MainActor` 隔离导致数据竞争报错。
*   **应对**：通过 `ModelContainer` 创建独立的背景上下文，或封装并使用自定义的 `@ModelActor` 处理后台写入。

**3. 异步闭包更新状态警告 (MainActor Mutation)**
*   **痛点**：在 `.task` 等异步闭包中执行耗时操作后，直接修改未隔离的 ViewModel 属性会报错。
*   **应对**：为 Observable/ViewModel 类统一添加 `@MainActor` 标注，确保 UI 状态更新严格限制在主线程。

---

#### R-b5da

1. **“Main actor-isolated property/method cannot be referenced…”**：给 View/ViewModel 标 `@MainActor`，UI 状态只主线程更新，后台结果用 `await MainActor.run` 回到主线程。
2. **“@Model/ModelContext is not Sendable…”**：别跨 actor 传模型对象或 context，改传 `PersistentIdentifier`，在 `@ModelActor` 或目标上下文里重新查询。
3. **“Capture of non-Sendable … in @Sendable closure”/全局可变状态**：闭包只捕获 Sendable 值类型，共享状态收进 actor 或 `@MainActor`，`static var` 改 `let` 或加隔离。

---

### research-letsencrypt-behind-cloudflare

**Prompt:**

```
A VPS sits behind Cloudflare proxy (orange cloud) with port 443 restricted to Cloudflare IP ranges only. Compare Let's Encrypt HTTP-01 vs DNS-01 challenges for this setup: whether each can work at all, what credentials or exposure each requires, and wildcard support. Recommend one. Max 200 words.
```

**Grader notes (gold facts):** Key facts: HTTP-01 needs port 80 reachable (LE validates over HTTP; through Cloudflare proxy it can work if port 80 is open to CF and the challenge path is passed through, but a firewall restricted to CF ranges + proxy adds fragility); DNS-01 needs a Cloudflare API token with DNS edit rights, no inbound exposure, supports wildcards (HTTP-01 does not). Recommendation: DNS-01.

#### R-2023

HTTP-01: Can work only if port 80 is open to Cloudflare and Cloudflare can fetch `/.well-known/acme-challenge` from the origin. It does not use port 443 directly, so the 443 restriction is less relevant, but origin must allow Cloudflare’s port 80 requests. Requires no DNS/Cloudflare credentials. No wildcard certificate support.

DNS-01: Works regardless of port restrictions. Requires a Cloudflare API token with DNS edit permission, or manual TXT record creation. No inbound exposure to Let’s Encrypt or the public. Supports wildcard certificates.

Recommendation: Use DNS-01. It avoids any dependency on port 80 or Cloudflare proxy behavior, needs no public origin exposure, and supports wildcards. The only requirement is a least-privilege Cloudflare API token.

---

#### R-26c9

**HTTP-01** is unreliable behind Cloudflare’s orange cloud. Let’s Encrypt fetches a token from `/.well-known/acme-challenge/` over HTTP, but Cloudflare may block, cache, or redirect that request via WAF, Bot Fight Mode, or Always Use HTTPS rules. You would need fragile edge bypass rules and must expose port 80; even then, renewals fail intermittently. It does **not** support wildcards and requires no DNS credentials.

**DNS-01** works seamlessly with the proxy enabled. It validates by publishing a TXT record through the Cloudflare API, never touching your origin over HTTP/HTTPS. You must store a **scoped Cloudflare API token** (`Zone:DNS:Edit` and `Zone:Zone:Read`) on the VPS—a credential exposure risk—but no inbound ports need to be open. It is the **only** method that supports wildcard certificates.

**Recommendation: DNS-01.** It is purpose-built for this topology, eliminates brittle edge-configuration dependencies, and enables wildcards.

---

#### R-9669

**HTTP-01:** Can work, but is fragile here. Let’s Encrypt hits `http://domain/.well-known/acme-challenge/...` via Cloudflare. It works only if Cloudflare proxies that path to the origin, or redirects to HTTPS and Cloudflare then reaches origin:443 from an allowed Cloudflare IP. The origin must serve the token; WAF/cache/redirect rules can break it. No API credentials, but the challenge path must be reachable through the proxy and origin 80/443 must be arranged. **No wildcard support.**

**DNS-01:** Works cleanly regardless of proxy/port restrictions. Requires a Cloudflare API token scoped to `Zone:DNS:Edit` (or equivalent) so the ACME client can create temporary `_acme-challenge` TXT records. No inbound ports or origin exposure are needed; only public DNS TXT records are temporarily exposed. **Supports wildcards.**

**Recommendation:** Use **DNS-01** with a restricted Cloudflare DNS API token. It is more reliable behind Cloudflare proxy and port-443 IP allowlisting, avoids origin challenge-path issues, and enables wildcard certificates.

---

#### R-fc2b

**HTTP-01**
* **Works?** Technically yes, but fragile. Validation occurs over HTTP (port 80). Because the domain resolves to Cloudflare, requests hit Cloudflare’s edge first. Origin port 80 must be open to Cloudflare IP ranges, and SSL/redirection rules must not interfere with the `/.well-known/acme-challenge/` path.
* **Credentials & Exposure:** Requires no external credentials. Exposes origin port 80 to Cloudflare IPs.
* **Wildcards:** Not supported.

**DNS-01**
* **Works?** Yes, seamlessly. Let's Encrypt queries Cloudflare’s authoritative DNS servers for a `_acme-challenge` TXT record. Origin firewall rules and proxy states are completely bypassed.
* **Credentials & Exposure:** Requires a scoped Cloudflare API token (`Zone:DNS:Edit`) stored on the VPS. Requires zero inbound network exposure (ports 80 and 443 can stay entirely closed during renewal).
* **Wildcards:** Supported.

**Recommendation: Use DNS-01**
DNS-01 is much more reliable here. It completely decouples certificate generation from web server routing, bypasses proxy and firewall constraints, and supports wildcard certificates. 

*(Note: If you only serve proxied traffic, Cloudflare’s free Origin CA certificates are also an excellent non-ACME alternative).*

---

#### R-c4da

**HTTP-01:** Can work with Cloudflare proxying. Let’s Encrypt requests `http://domain/.well-known/acme-challenge/...` at Cloudflare’s edge; Cloudflare must be able to obtain the response from your origin. Port 80 must be available at the edge, and either origin port 80 must be reachable from Cloudflare or the request must redirect to HTTPS, where Cloudflare can reach your origin on restricted port 443. You must expose an HTTP challenge endpoint (though not the origin directly), and configure your ACME client/web server to serve the token. Cloudflare caching, redirects, or security rules can interfere. It requires no Cloudflare API credentials if handled by the web server. **No wildcard certificates.**

**DNS-01:** Works independently of HTTP, port 80, proxying, and origin reachability. The ACME client creates a TXT record under `_acme-challenge.example.com`. It requires DNS-provider credentials—ideally a narrowly scoped Cloudflare API token—or manual/delegated DNS updates. No web endpoint or origin exposure is required. **Supports wildcard certificates**, including alongside ordinary names.

**Recommendation:** Use **DNS-01**, particularly for wildcards or reliable automation. Use a least-privilege Cloudflare token limited to the relevant zone’s DNS records.

---

#### R-0773

Here is how **HTTP-01** and **DNS-01** compare for a VPS behind a Cloudflare proxy:

**HTTP-01 Challenge**
*   **Viability:** It works, but can be fragile. Let's Encrypt connects to Cloudflare, which proxies the request to your VPS. You must allow Cloudflare IPs on port 80/443 and ensure Cloudflare's SSL/TLS mode (like "Full Strict") doesn't block the connection before the certificate is issued. 
*   **Exposure/Credentials:** Requires an active web server exposed to Cloudflare. No API credentials are required.
*   **Wildcards:** Not supported.

**DNS-01 Challenge**
*   **Viability:** Works flawlessly. Validation happens via DNS TXT records, entirely bypassing your firewall and Cloudflare proxy.
*   **Exposure/Credentials:** Requires zero inbound open ports. You must store a restricted Cloudflare API token (scoped to DNS edit permissions) on the VPS to automate TXT record creation.
*   **Wildcards:** Fully supported.

**Recommendation:**
**Use DNS-01.** When proxying through Cloudflare, HTTP-01 frequently suffers from redirect loops or "chicken-and-egg" errors if Cloudflare requires a valid origin certificate to connect. DNS-01 operates entirely out-of-band, supports wildcards, and lets you manage certificates without worrying about complex HTTP routing or temporarily lowering Cloudflare's strict SSL settings.

---

## creative

**Rubric:** Score 0-5 = constraint compliance (0-1: counts, lengths, forbidden words) + originality (0-2: not generic boilerplate, has a real idea) + fit & naturalness (0-2: right audience/tone, natural Chinese, no AI clichés).

### creative-app-names

**Prompt:**

```
为一款 macOS 菜单栏系统监控小工具(显示 CPU/内存/网络/磁盘/温度/电池六项)起 5 个中文名,每个名字配一句不超过 12 字的 slogan。要求:名字两到四个字,避免"监控""大师""管家"这类词。只输出名字和 slogan 列表。
```

#### R-a2d0

1. **脉象** —— 六项状态一眼掌握  
2. **星脉** —— 让系统状态清晰可见  
3. **澄观** —— CPU内存尽在掌握  
4. **六维** —— 性能温度电量全知道  
5. **流光** —— 网络磁盘实时呈现

---

#### R-fd98

1. 芯脉 - 感知每一次设备心跳
2. 六维 - 六项核心状态尽在掌握
3. 毫厘 - 方寸顶栏尽显毫厘变化
4. 棱镜 - 洞悉系统的每一分性能
5. 舷窗 - 菜单栏的系统全景视界

---

#### R-486f

1. 六目：六项状态一眼掌握
2. 脉象：系统脉搏栏上可见
3. 轻况：轻量状态一栏尽览
4. 舱表：六项指标舱内全览
5. 栏况：六项状态栏边即览

---

#### R-f875

1. **知微**
   Slogan：方寸微光，尽览全貌。

2. **机心**
   Slogan：倾听这台 Mac 的心跳。

3. **了然**
   Slogan：抬眼一瞬，底细尽悉。

4. **素览**
   Slogan：六维指标，一眼清爽。

5. **脉象**
   Slogan：把脉系统，静默无扰。

---

#### R-7781

1. 顶栏六景：六项状态一眼看全  
2. 机脉：实时感知整机脉搏  
3. 轻仪：简洁呈现关键数据  
4. 栏中晴雨：系统冷暖一栏即知  
5. 六感：感知系统六项状态

---

#### R-067f

方寸 —— 方寸见真章
入微 —— 入微悉全局
六维 —— 六维尽掌中
瞬悉 —— 瞬息知冷暖
随行 —— 随行览万象

---

### creative-app-store-copy

**Prompt:**

```
为一款面向中国成年自学者的德语学习 app(歌德 A1/A2 词库、导师可建班点评)写:1) 一条 App Store 副标题(不超过 30 字);2) 3 条推广短文案(每条不超过 40 字)。不要用"轻松""高效""海量"这三个词。
```

#### R-60f3

1）**副标题**  
歌德A1/A2词库配合导师建班点评，成年人自学德语更稳。

2）**推广短文案**  
- 成年人自学德语，别再只背单词。歌德A1/A2词库加导师点评，每一步都算数。  
- 导师建班点评，专治自学没反馈。A1/A2词库对准歌德考试，成人备考不绕路。  
- 不用硬撑，按自己的节奏来。歌德A1/A2词库每天推进，导师能看到你的进展。

---

#### R-3674

1) **App Store 副标题**  
歌德A1/A2词库，成人自学与导师点评

2) **推广短文案**  
- A1/A2分级词库，按目标积累德语词汇。  
- 导师创建班级，作业点评与反馈更清晰。  
- 面向中国成人自学者，开启你的德语学习计划。

---

#### R-1563

### 1. App Store 副标题
**歌德A1/A2考级词库，导师建班指导，自学德语有人带。**（26字）

---

### 2. 推广短文案（3 条）

* **文案 1（主打导师反馈，解决自学无人纠错的痛点）：**  
  自学德语不再孤军奋战。导师建班针对性点评，带你扎实吃透歌德A1/A2词汇。（36字）

* **文案 2（主打考级目标与规范性，适合备考人群）：**  
  对标歌德A1/A2大纲，背词有章法，课后练习更有真人导师逐句精批。（33字）

* **文案 3（主打成年人坚持与督学，适合利用碎片时间的上班族）：**  
  成年人自学德语怕断更？加入专属导师班级，打卡练表达，每次输出都有专业反馈。（37字）

---

#### R-2e5d

**App Store 副标题（19字）**  
歌德A1/A2分级词库，真人导师建班点评

**推广短文案**  
1. 紧扣歌德A1/A2考纲词库，真题语境搭配发音，从零基础到考试目标清晰可循。（37字）  

2. 自学怕走偏？导师在线建班督学，作业逐句点评，让成年人的德语学习有反馈、有陪伴。（39字）  

3. 专为上班族设计，每日15分钟A1/A2词汇训练，导师分班点评，稳扎稳打备考歌德。（40字）

---

#### R-0702

这里为您撰写了一套符合要求的 App Store 副标题和推广文案，完全避开了“轻松”、“高效”、“海量”三个词，并针对成年自学者的痛点（需要方向、需要反馈、时间碎片化）进行了设计：

### 1) App Store 副标题（不超过 30 字）
**直击歌德A1/A2词库，导师建班专业点评，成人自学利器。**
*(字符数：28字，含标点及字母)*

---

### 2) 推广短文案（3条，每条不超过 40 字）

**文案一（侧重词库与备考）：**
备考歌德A1/A2？精选大纲核心词库，配合科学记忆，让成人自学不再迷茫。
*(字符数：36字)*

**文案二（侧重导师与互动）：**
自学遇到瓶颈？加入导师专属班级，每次练习都有专业点评，带你告别哑巴德语。
*(字符数：36字)*

**文案三（侧重成人学习场景）：**
专为成人自学打造。直击歌德A1/A2大纲，导师建班在线纠错，碎片时间稳步进阶。
*(字符数：39字)*

---

#### R-4a94

**App Store 副标题**
歌德A1/A2词库，导师建班点评

**推广短文案**
1. 先背歌德A1/A2词库，再进导师班练；作业有人点评，自学不盲走。
2. 成年自学德语，按歌德A1/A2进度练；导师建班，发音作业逐项点评。
3. 词库对标歌德A1/A2，练习有反馈；导师建班点评，自学进步看得见。

---

### creative-moments-post

**Prompt:**

```
写一条 80 字以内的朋友圈文案,幽默向:家里的 HomePod 连续一周半夜自己放歌,排查了路由器、Apple TV、快捷指令,最后发现是顶部触控板误触。只输出文案本身。
```

#### R-cb50

HomePod连续一周半夜自动蹦迪。查遍路由器、Apple TV和快捷指令，我正准备请法师驱邪，结果破案了：顶部触控板误触。终究是科学战胜了赛博闹鬼。

---

#### R-4632

HomePod连续一周半夜自嗨，重置路由器、审查Apple TV、盘问Siri，差点请道士。结果发现是顶部触控板误触。不是灵异事件，纯属物理手滑。

---

#### R-85f2

家里 HomePod 连续一周半夜自动开演唱会，排查路由器、Apple TV、快捷指令，最后发现：不是闹鬼，是顶部触控板手滑了。

---

#### R-98b7

HomePod连续一周半夜自动放歌。疯狂排查路由器、Apple TV、快捷指令，以为撞了赛博邪，结果破案：顶部触控板误触。科技捉鬼七天，小丑竟是我自己。

---

#### R-94c8

家里的HomePod连续一周半夜开演唱会，我查了路由器、Apple TV、快捷指令，差点请道士。最后发现是顶部触控板误触——它只是想互动，我却想给它超度。

---

#### R-b30d

家里HomePod连续一周半夜自己放歌，查了路由器、Apple TV、快捷指令，最后发现是顶部触控板误触。原来不是灵异事件，是它头顶太敏感，碰一下就深夜开麦。

---

### creative-blog-titles

**Prompt:**

```
为一篇技术博客写 3 个备选标题和一段 60 字以内的摘要。博客内容:用一个 MCP server 让 Claude Code 按任务类型把工作分派给 DeepSeek / Gemini / GPT / Kimi 四个模型,并用实测表决定路由。标题不超过 25 字,不要用问句。
```

#### R-7548

备选标题：

1. MCP 路由：Claude Code 四模型分工  
2. 给 Claude Code 加多模型 MCP 路由  
3. 实测表驱动：Claude Code 多模型分派  

摘要：用MCP server为Claude Code路由，按任务分派DeepSeek、Gemini、GPT、Kimi，实测表定路由。

---

#### R-dc45

**备选标题**
1. Claude Code 四模型任务路由实测
2. MCP 按任务路由四模型实测
3. Claude Code 接入 MCP 分派四模型

**摘要**
用 MCP 服务让 Claude Code 按任务分派 DeepSeek、Gemini、GPT、Kimi，实测表定路由。

---

#### R-33b0

### 备选标题

1. **实测驱动：Claude Code的MCP四模型调度**（23 字）
2. **Claude Code四模型协同：MCP实测路由**（23 字）
3. **用MCP为Claude Code构建多模型实测路由**（24 字）

---

### 博客摘要

基于实测表搭建 MCP 服务，让 Claude Code 按任务分派至 DeepSeek、Gemini、GPT 与 Kimi。（56 字）

---

#### R-a00a

**备选标题（均不超过25字符，无问句）：**

1. MCP实现Claude Code按实测表路由四模型
2. 实测表驱动：MCP与Claude Code路由实战
3. 用MCP给Claude Code打造四模型分发器

**内容摘要（51字）：**
本文介绍如何通过MCP server，让Claude Code基于实测表，按任务类型将工作智能路由至DeepSeek、Gemini、GPT与Kimi四大模型，实现最优调度。

---

#### R-fbbf  (FAILED — auto 0: 请求超时 (60s))

#### R-11cb

**标题备选：**

1. MCP 驱动 Claude Code 的多模型路由实践  
2. 实测驱动的 Claude Code 多模型分工  
3. 一个 MCP Server 串联四大模型协作  

**摘要：**  
搭建 MCP server，让 Claude Code 按任务类型分派 DeepSeek、Gemini、GPT 与 Kimi，并以实测结果优化路由。

---
