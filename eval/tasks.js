// eval/tasks.js — fixed prompt set for the routing benchmark (eval v0).
// Do NOT edit prompts or gold answers between runs you intend to compare; bump TASKSET_VERSION instead.
export const TASKSET_VERSION = "v0";
// Scoring-only changes since the first v0 run (prompts untouched, run rescored with `rescore`):
//   2026-10-21  extract-rental-zh: landmark gold accepts "望京SOHO附近"; code harness isolates per-case exceptions.

export const CATEGORIES = {
  code:       { temperature: 0,   grading: "auto",  system: "You are a senior JavaScript engineer. Follow the output format exactly." },
  extraction: { temperature: 0,   grading: "auto",  system: "You are a precise information-extraction engine. Output a single JSON object and nothing else." },
  reasoning:  { temperature: 0,   grading: "auto",  system: "Solve the problem carefully. Keep the working brief. The very last line of your reply must be exactly `ANSWER: <final answer>`." },
  research:   { temperature: 0.7, grading: "blind", system: "" },
  creative:   { temperature: 0.7, grading: "blind", system: "" },
};

export const anyOf = (...vals) => ({ __anyOf: vals });

const CODE_FORMAT = "Reply with exactly one ```js code block containing an ES module that exports the function as a named export. No text outside the block.";

export const RUBRICS = {
  research: `Score 0-5 = accuracy (0-2: 2 = no factual errors, 1 = minor slip, 0 = material error) + coverage (0-2: all requested sub-points addressed) + form (0-1: length/format constraint met AND a clear conclusion/recommendation given when asked).`,
  creative: `Score 0-5 = constraint compliance (0-1: counts, lengths, forbidden words) + originality (0-2: not generic boilerplate, has a real idea) + fit & naturalness (0-2: right audience/tone, natural Chinese, no AI clichés).`,
};

export const TASKS = [
  // ───────────────────────── code (auto: run hidden tests in a node --permission sandbox) ─────────────────────────
  {
    id: "code-merge-intervals", category: "code", fn: "mergeIntervals", cases: 8,
    prompt: `Write a JavaScript function \`mergeIntervals(intervals)\`. Input: an array of [start, end] integer pairs, unsorted, possibly overlapping or touching. Output: a NEW array of merged, non-overlapping intervals sorted by start. Touching intervals merge ([1,3] and [3,5] → [1,5]). Empty input returns []. ${CODE_FORMAT}`,
    harness: `
check("empty", fn([]), []);
check("classic", fn([[1,3],[2,6],[8,10],[15,18]]), [[1,6],[8,10],[15,18]]);
check("touching", fn([[1,4],[4,5]]), [[1,5]]);
check("unsorted", fn([[5,7],[1,3],[2,4]]), [[1,4],[5,7]]);
check("contained", fn([[1,10],[2,3],[4,5]]), [[1,10]]);
check("negative", fn([[-5,-1],[-3,0]]), [[-5,0]]);
check("single-point", fn([[1,1]]), [[1,1]]);
check("no-overlap-kept", fn([[1,2],[3,4]]), [[1,2],[3,4]]);
`,
  },
  {
    id: "code-parse-duration", category: "code", fn: "parseDuration", cases: 12,
    prompt: `Write a JavaScript function \`parseDuration(str)\` that parses duration strings such as "1h30m", "45s", "2d4h", "90m", "1h 30m 15s" (whitespace between parts is optional) and returns the total number of seconds as an integer. Units: d = days, h = hours, m = minutes, s = seconds; parts may appear in any order. Throw an Error for invalid input: not a string, empty string, unknown unit, a number without a unit, or a unit without a number. ${CODE_FORMAT}`,
    harness: `
check("1h30m", fn("1h30m"), 5400);
check("45s", fn("45s"), 45);
check("2d4h", fn("2d4h"), 187200);
check("90m", fn("90m"), 5400);
check("spaces", fn("1h 30m 15s"), 5415);
check("zero", fn("0s"), 0);
check("any-order", fn("15s2h"), 7215);
checkThrows("empty", () => fn(""));
checkThrows("unknown-unit", () => fn("1x"));
checkThrows("number-without-unit", () => fn("10"));
checkThrows("unit-without-number", () => fn("m"));
checkThrows("non-string", () => fn(42));
`,
  },
  {
    id: "code-wildcard-match", category: "code", fn: "wildcardMatch", cases: 12,
    prompt: `Write a JavaScript function \`wildcardMatch(s, p)\` that returns true iff the whole string s matches pattern p, where "?" matches exactly one character and "*" matches any sequence of characters (including the empty sequence). Both s and p may be up to 2000 characters; the implementation must not use exponential backtracking (a 1500-character input against a pattern with many "*" must finish well under a second). ${CODE_FORMAT}`,
    harness: `
check("aa/a", fn("aa","a"), false);
check("aa/*", fn("aa","*"), true);
check("cb/?a", fn("cb","?a"), false);
check("adceb/*a*b", fn("adceb","*a*b"), true);
check("acdcb/a*c?b", fn("acdcb","a*c?b"), false);
check("empty/*", fn("","*"), true);
check("empty/empty", fn("",""), true);
check("exact", fn("abc","abc"), true);
check("question", fn("abc","a?c"), true);
check("mississippi", fn("mississippi","m??*ss*?i*pi"), false);
check("stars-only", fn("abc","***"), true);
partial();
check("perf-no-exponential", fn("a".repeat(1500) + "b", "*a*a*a*a*a*a*a*a*a*c"), false);
`,
  },
  {
    id: "code-lru-cache", category: "code", fn: "createLRU", cases: 12,
    prompt: `Write a JavaScript function \`createLRU(capacity)\` that returns an object with two methods: \`get(key)\` returns the stored value and marks the key as most recently used, or returns undefined if the key is absent; \`put(key, value)\` inserts or updates the key (an update also marks it most recently used) and, when the cache would exceed capacity, evicts the least recently used key first. Keys are strings or numbers. Both operations must be O(1). ${CODE_FORMAT}`,
    harness: `
const c = fn(2);
c.put(1, 1); c.put(2, 2);
check("get1", c.get(1), 1);
c.put(3, 3);
check("evicted2", c.get(2), undefined);
c.put(4, 4);
check("evicted1", c.get(1), undefined);
check("get3", c.get(3), 3);
check("get4", c.get(4), 4);
const d = fn(2);
d.put("a", 1); d.put("b", 2); d.put("a", 9); d.put("c", 3);
check("update-refresh-a", d.get("a"), 9);
check("update-refresh-b", d.get("b"), undefined);
check("update-refresh-c", d.get("c"), 3);
const e = fn(1);
e.put("x", 1); e.put("y", 2);
check("cap1-x", e.get("x"), undefined);
check("cap1-y", e.get("y"), 2);
partial();
const big = fn(1000);
for (let i = 0; i < 200000; i++) { big.put(i, i); if (i % 3 === 0) big.get(i - 500); }
check("perf-last", big.get(199999), 199999);
check("perf-evicted", big.get(100), undefined);
`,
  },

  // ───────────────────────── extraction (auto: field-level match against gold JSON) ─────────────────────────
  {
    id: "extract-receipt-zh", category: "extraction",
    schema: `merchant (string, 商户名,不含门店), branch (string, 门店), date (string, YYYY-MM-DD), time (string, HH:MM), table (string), guests (integer), items (array of objects: name (string), qty (integer), unit_price (number)), subtotal (number), service_fee (number), total (number), payment_method (string)`,
    doc: `【收据】
商户:老王家常菜(朝阳门店)
日期:2026年10月18日 19:42
桌号:A07  人数:3
----------------
品名            数量   单价
宫保鸡丁        x2    38.00
清炒时蔬        x1    22.00
米饭            x3     3.00
酸梅汤(大)      x1    15.00
----------------
小计:            122.00
服务费(10%):      12.20
合计:            134.20
支付方式:微信支付`,
    gold: {
      merchant: "老王家常菜", branch: "朝阳门店", date: "2026-10-18", time: "19:42", table: "A07", guests: 3,
      items: [
        { name: "宫保鸡丁", qty: 2, unit_price: 38 },
        { name: "清炒时蔬", qty: 1, unit_price: 22 },
        { name: "米饭", qty: 3, unit_price: 3 },
        { name: "酸梅汤(大)", qty: 1, unit_price: 15 },
      ],
      subtotal: 122, service_fee: 12.2, total: 134.2, payment_method: "微信支付",
    },
  },
  {
    id: "extract-job-posting-en", category: "extraction",
    schema: `title (string, job title without parenthetical), company (string), city (string), country (string), remote (boolean), salary_min (integer), salary_max (integer), currency (string, ISO 4217 code), years_experience_min (integer), required_skills (array of strings), nice_to_have (array of strings), vacation_days (integer), start_date (string, YYYY-MM), application_deadline (string, YYYY-MM-DD), contact_email (string)`,
    doc: `Senior iOS Engineer (SwiftUI) — Remote within EU
Company: Nordlicht Labs GmbH · Berlin, Germany
We're hiring a Senior iOS Engineer to own our consumer app (2M MAU). You'll work in SwiftUI and Swift Concurrency, ship weekly, and pair closely with design.
Must have: 5+ years iOS, SwiftUI, Swift Concurrency (async/await, actors), Combine, Xcode Cloud or similar CI.
Nice to have: Kotlin Multiplatform, German B1.
Compensation: €85,000–€105,000 per year + equity. 30 days vacation. Start: January 2027.
Apply by 15 Nov 2026 to jobs@nordlicht.example.`,
    gold: {
      title: "Senior iOS Engineer", company: "Nordlicht Labs GmbH", city: "Berlin", country: "Germany", remote: true,
      salary_min: 85000, salary_max: 105000, currency: "EUR", years_experience_min: 5,
      required_skills: ["iOS", "SwiftUI", "Swift Concurrency", "Combine", "Xcode Cloud"],
      nice_to_have: ["Kotlin Multiplatform", "German B1"],
      vacation_days: 30, start_date: "2027-01", application_deadline: "2026-11-15", contact_email: "jobs@nordlicht.example",
    },
  },
  {
    id: "extract-server-log", category: "extraction",
    schema: `total_requests (integer), status_counts (object: HTTP status code string → count), server_error_count (integer, number of 5xx responses), first_5xx_timestamp (string, exactly as written in the log), unique_ips (array of strings), ip_with_most_requests (string), most_requested_path (string, the path including its query string exactly as written, that appears most often), slowest_request_ms (integer), avg_latency_ms (number, arithmetic mean over all lines, 1 decimal)`,
    doc: `2026-10-19T02:14:07Z 203.0.113.7 GET /api/health 200 3ms
2026-10-19T02:14:09Z 198.51.100.23 POST /api/login 401 41ms
2026-10-19T02:14:09Z 198.51.100.23 POST /api/login 401 39ms
2026-10-19T02:14:10Z 198.51.100.23 POST /api/login 200 120ms
2026-10-19T02:14:12Z 203.0.113.7 GET /api/items?page=2 500 812ms
2026-10-19T02:14:13Z 192.0.2.44 GET /api/items?page=1 200 95ms
2026-10-19T02:14:15Z 203.0.113.7 GET /api/items?page=2 500 790ms
2026-10-19T02:14:16Z 192.0.2.44 GET /api/health 200 2ms
2026-10-19T02:14:20Z 198.51.100.23 DELETE /api/items/42 204 60ms
2026-10-19T02:14:21Z 192.0.2.44 GET /api/items?page=3 404 12ms`,
    gold: {
      total_requests: 10,
      status_counts: { "200": 4, "401": 2, "500": 2, "204": 1, "404": 1 },
      server_error_count: 2, first_5xx_timestamp: "2026-10-19T02:14:12Z",
      unique_ips: ["203.0.113.7", "198.51.100.23", "192.0.2.44"],
      ip_with_most_requests: "198.51.100.23", most_requested_path: "/api/login",
      slowest_request_ms: 812, avg_latency_ms: 197.4,
    },
  },
  {
    id: "extract-rental-zh", category: "extraction",
    schema: `district (string), landmark (string), bedrooms (integer), living_rooms (integer), bathrooms (integer), area_sqm (number), floor (integer), total_floors (integer), elevator (boolean), rent_monthly_cny (integer), deposit_months (integer), prepay_months (integer, 一次付几个月), property_fee_included (boolean), pets_allowed (boolean), min_lease_months (integer), contact_name (string), contact_phone (string, digits only), appliances (array of strings, 家电名称)`,
    doc: `【出租】朝阳区 望京SOHO附近 两室一厅 精装修 随时入住
户型:2室1厅1卫,建筑面积 78㎡,南北通透
楼层:12/25层,有电梯
租金:7500元/月,押一付三,物业费已含,水电燃气自理
家电:冰箱、洗衣机、空调×2、燃气热水器,可做饭
要求:不接受养宠物,最短租期一年
看房联系:李女士 138-0013-5566(微信同号),中介勿扰`,
    gold: {
      district: "朝阳区", landmark: anyOf("望京SOHO", "望京SOHO附近"), bedrooms: 2, living_rooms: 1, bathrooms: 1, area_sqm: 78,
      floor: 12, total_floors: 25, elevator: true, rent_monthly_cny: 7500, deposit_months: 1, prepay_months: 3,
      property_fee_included: true, pets_allowed: false, min_lease_months: 12,
      contact_name: "李女士", contact_phone: "13800135566",
      appliances: ["冰箱", "洗衣机", "空调", "燃气热水器"],
    },
  },

  // ───────────────────────── reasoning (auto: exact final answer) ─────────────────────────
  {
    id: "reason-grid-paths", category: "reasoning", numeric: true, expect: 34,
    prompt: `On a grid of lattice points from (0,0) to (4,4), you move one unit right or one unit up per step. How many paths from (0,0) to (4,4) avoid the point (2,2)?`,
  },
  {
    id: "reason-mod-power", category: "reasoning", numeric: true, expect: 49,
    prompt: `What is the remainder when 7^2026 is divided by 100?`,
  },
  {
    id: "reason-knights-knaves", category: "reasoning", numeric: false, expect: "knave", reject: ["knight"],
    prompt: `On an island, knights always tell the truth and knaves always lie. A says: "B is a knave." B says: "A and C are the same type." C says nothing. Is C a knight or a knave? Answer with the single word knight or knave.`,
  },
  {
    id: "reason-crt-sum", category: "reasoning", numeric: true, expect: 14703,
    prompt: `Find the sum of all integers n with 1 ≤ n ≤ 1000 such that n ≡ 3 (mod 7) and n ≡ 2 (mod 5).`,
  },

  // ───────────────────────── research (blind: Claude grades 0-5 by rubric) ─────────────────────────
  {
    id: "research-sqlite-vs-postgres", category: "research",
    prompt: `在单机桌面应用场景(macOS 菜单栏工具,单用户,本地数据 <1GB)下,对比 SQLite 和 PostgreSQL:并发写入、部署与分发、备份、全文检索四个方面各说一点,最后给出明确选择。全文不超过 300 字。`,
    notes: `Key facts: SQLite single-writer (WAL allows concurrent readers), zero-config embedded file vs PostgreSQL needs a running server/installer; backup = copy file / .backup / VACUUM INTO vs pg_dump; FTS5 vs tsvector/GIN. Expected recommendation: SQLite.`,
  },
  {
    id: "research-websocket-vs-sse", category: "research",
    prompt: `A browser dashboard needs server-pushed updates roughly once per second. Compare WebSocket and Server-Sent Events on: message direction, automatic reconnection, behavior through HTTP/2 and reverse proxies, and the per-browser connection limit. Finish with a one-sentence recommendation. Max 250 words.`,
    notes: `Key facts: WS bidirectional / SSE server→client only; SSE auto-reconnects via EventSource with Last-Event-ID, WS needs manual reconnect; SSE is plain HTTP so works through proxies and multiplexes over HTTP/2 (6-connection limit is HTTP/1.1 only), WS needs Upgrade support (HTTP/2 WS via RFC 8441 is rarer); recommendation for one-way 1Hz updates: SSE.`,
  },
  {
    id: "research-swift6-strict-concurrency", category: "research",
    prompt: `一个已有的 SwiftUI + SwiftData 项目要打开 Swift 6 严格并发检查(strict concurrency = complete)。列出迁移时最常见的 3 个报错/痛点,每个给出一句话的应对方式。不超过 250 字。`,
    notes: `Plausible pain points: non-Sendable types crossing actor boundaries (make Sendable / @MainActor / isolate); global mutable state ("var is not concurrency-safe" → let / actor / nonisolated(unsafe)); main-actor isolation of UI code called from background (@MainActor annotations, Task { @MainActor in }); SwiftData ModelContext not Sendable (use @ModelActor / pass PersistentIdentifier). Accept any 3 that are real.`,
  },
  {
    id: "research-letsencrypt-behind-cloudflare", category: "research",
    prompt: `A VPS sits behind Cloudflare proxy (orange cloud) with port 443 restricted to Cloudflare IP ranges only. Compare Let's Encrypt HTTP-01 vs DNS-01 challenges for this setup: whether each can work at all, what credentials or exposure each requires, and wildcard support. Recommend one. Max 200 words.`,
    notes: `Key facts: HTTP-01 needs port 80 reachable (LE validates over HTTP; through Cloudflare proxy it can work if port 80 is open to CF and the challenge path is passed through, but a firewall restricted to CF ranges + proxy adds fragility); DNS-01 needs a Cloudflare API token with DNS edit rights, no inbound exposure, supports wildcards (HTTP-01 does not). Recommendation: DNS-01.`,
  },

  // ───────────────────────── creative (blind: Claude grades 0-5 by rubric) ─────────────────────────
  {
    id: "creative-app-names", category: "creative",
    prompt: `为一款 macOS 菜单栏系统监控小工具(显示 CPU/内存/网络/磁盘/温度/电池六项)起 5 个中文名,每个名字配一句不超过 12 字的 slogan。要求:名字两到四个字,避免"监控""大师""管家"这类词。只输出名字和 slogan 列表。`,
  },
  {
    id: "creative-app-store-copy", category: "creative",
    prompt: `为一款面向中国成年自学者的德语学习 app(歌德 A1/A2 词库、导师可建班点评)写:1) 一条 App Store 副标题(不超过 30 字);2) 3 条推广短文案(每条不超过 40 字)。不要用"轻松""高效""海量"这三个词。`,
  },
  {
    id: "creative-moments-post", category: "creative",
    prompt: `写一条 80 字以内的朋友圈文案,幽默向:家里的 HomePod 连续一周半夜自己放歌,排查了路由器、Apple TV、快捷指令,最后发现是顶部触控板误触。只输出文案本身。`,
  },
  {
    id: "creative-blog-titles", category: "creative",
    prompt: `为一篇技术博客写 3 个备选标题和一段 60 字以内的摘要。博客内容:用一个 MCP server 让 Claude Code 按任务类型把工作分派给 DeepSeek / Gemini / GPT / Kimi 四个模型,并用实测表决定路由。标题不超过 25 字,不要用问句。`,
  },
];

export function buildPrompt(task) {
  if (task.category === "extraction") {
    return `Extract information from the TEXT below into ONE JSON object with exactly these keys (use null when a value is absent):\n${task.schema}\n\nOutput only the JSON object.\n\nTEXT:\n"""\n${task.doc}\n"""`;
  }
  if (task.category === "reasoning") {
    return `${task.prompt}\n\nEnd your reply with a final line of the form \`ANSWER: <final answer>\`.`;
  }
  return task.prompt;
}
