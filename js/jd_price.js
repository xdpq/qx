/**
 * 京东移动端网页版 - 历史价格展示
 * 适用：Quantumult X (script-response-body)
 *
 * 功能：
 * 1. 从商品页 URL / HTML 中提取 SKU
 * 2. 请求慢慢买历史价格接口
 * 3. 在页面注入历史价格浮层（最低价 / 日期 / 近期走势）
 *
 * 配置见同目录 price.conf
 */

const DEBUG = false;

function log(...args) {
  if (DEBUG) console.log("[JD-Price]", ...args);
}

function extractSku(url, html) {
  // 1) URL 路径：/product/100012345678.html 或 /100012345678.html
  let m = url.match(/\/(?:product\/)?(\d{5,})\.html/i);
  if (m) return m[1];

  // 2) 查询参数：wareId= / sku= / skuId=
  m = url.match(/(?:wareId|skuId?|sku)=(\d{5,})/i);
  if (m) return m[1];

  // 3) 页面源码兜底
  if (html) {
    m = html.match(/['"]skuId?['"]\s*[:=]\s*['"]?(\d{5,})/i)
      || html.match(/item\.jd\.com\/(\d{5,})\.html/i)
      || html.match(/skuid\s*=\s*['"]?(\d{5,})/i);
    if (m) return m[1];
  }
  return null;
}

function parseHistoryBody(raw) {
  // 慢慢买接口有时返回 JSON，有时是带回调的文本
  let text = String(raw || "").trim();
  if (!text) return null;

  // 去掉可能的 JSONP 包裹
  const jp = text.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
  if (jp) text = jp[1];

  try {
    return JSON.parse(text);
  } catch (e) {
    log("JSON 解析失败", e.message);
    return null;
  }
}

/**
 * 从慢慢买响应里整理出可读数据
 * 兼容几种常见字段结构
 */
function normalizeHistory(data) {
  if (!data) return null;

  // 结构 A：直接带 lowerPrice / singlePrice 等
  // 结构 B：嵌在 data / result 里
  const root = data.data || data.result || data;

  let lowerPrice = root.lowerPrice || root.LowerPrice || root.minPrice;
  let lowerDate = root.lowerDate || root.LowerDate || root.minDate || "";
  let currentPrice = root.currentPrice || root.CurrentPrice || root.price || "";
  let averagePrice = root.averagePrice || root.avgPrice || "";
  let trend = root.trend || root.list || root.priceHistory || root.datePrice || [];

  // 结构 C：history 字符串 "日期,价格|日期,价格"
  if ((!trend || !trend.length) && typeof root.history === "string") {
    trend = root.history.split("|").map((pair) => {
      const [d, p] = pair.split(",");
      return { date: d, price: p };
    }).filter((x) => x.date && x.price);
  }

  // 结构 D：二维数组 [[date, price], ...] 或 [timestamp, price]
  if (Array.isArray(trend) && trend.length && Array.isArray(trend[0])) {
    trend = trend.map((row) => {
      let date = row[0];
      const price = row[1];
      if (typeof date === "number" && date > 1e11) {
        const d = new Date(date);
        date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      return { date, price };
    });
  } else if (Array.isArray(trend) && trend.length && typeof trend[0] === "object") {
    trend = trend.map((item) => ({
      date: item.date || item.d || item.time || item.t || "",
      price: item.price || item.p || item.pr || "",
    }));
  }

  // 若没给最低价，从走势里算
  if ((!lowerPrice || lowerPrice === "") && trend.length) {
    let min = Infinity;
    let minDate = "";
    for (const point of trend) {
      const p = parseFloat(point.price);
      if (!isNaN(p) && p < min) {
        min = p;
        minDate = point.date;
      }
    }
    if (min !== Infinity) {
      lowerPrice = min;
      if (!lowerDate) lowerDate = minDate;
    }
  }

  // 近期样本：最多取末尾 12 个点做简表
  const recent = Array.isArray(trend) ? trend.slice(-12) : [];

  if (lowerPrice === undefined || lowerPrice === null || lowerPrice === "") {
    return null;
  }

  return {
    lowerPrice: String(lowerPrice),
    lowerDate: String(lowerDate || "未知"),
    currentPrice: currentPrice !== "" ? String(currentPrice) : "",
    averagePrice: averagePrice !== "" ? String(averagePrice) : "",
    recent,
    totalPoints: Array.isArray(trend) ? trend.length : 0,
  };
}

function buildPanelHtml(sku, info, errMsg) {
  const title = errMsg ? "历史价格获取失败" : "历史价格";
  const body = errMsg
    ? `<div class="jdph-err">${escapeHtml(errMsg)}</div>`
    : `
      <div class="jdph-row"><span>SKU</span><b>${escapeHtml(sku)}</b></div>
      ${info.currentPrice ? `<div class="jdph-row"><span>当前参考</span><b>¥${escapeHtml(info.currentPrice)}</b></div>` : ""}
      <div class="jdph-row highlight"><span>历史最低</span><b>¥${escapeHtml(info.lowerPrice)}</b></div>
      <div class="jdph-row"><span>最低日期</span><b>${escapeHtml(info.lowerDate)}</b></div>
      ${info.averagePrice ? `<div class="jdph-row"><span>历史均价</span><b>¥${escapeHtml(info.averagePrice)}</b></div>` : ""}
      ${renderSpark(info.recent)}
      <div class="jdph-tip">数据来源：慢慢买 · 仅供参考</div>
    `;

  return `
<style>
#jd-price-history-panel{
  position:fixed;right:10px;bottom:80px;z-index:2147483646;
  width:220px;max-width:70vw;
  background:rgba(20,20,20,.92);color:#fff;
  border-radius:12px;padding:12px 12px 10px;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;
  font-size:13px;line-height:1.45;
  box-shadow:0 8px 24px rgba(0,0,0,.28);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
}
#jd-price-history-panel .jdph-hd{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:8px;font-weight:600;font-size:14px;
}
#jd-price-history-panel .jdph-close{
  width:22px;height:22px;border:0;border-radius:11px;
  background:rgba(255,255,255,.15);color:#fff;font-size:14px;line-height:22px;
  text-align:center;padding:0;cursor:pointer;
}
#jd-price-history-panel .jdph-row{
  display:flex;justify-content:space-between;gap:8px;margin:4px 0;color:#ddd;
}
#jd-price-history-panel .jdph-row span{color:#aaa;flex-shrink:0}
#jd-price-history-panel .jdph-row b{font-weight:600;text-align:right;word-break:break-all}
#jd-price-history-panel .jdph-row.highlight b{color:#ffd666;font-size:16px}
#jd-price-history-panel .jdph-err{color:#ffb4b4;font-size:12px}
#jd-price-history-panel .jdph-tip{margin-top:8px;color:#888;font-size:11px}
#jd-price-history-panel .jdph-spark{
  margin-top:8px;display:flex;align-items:flex-end;gap:2px;height:36px;
  padding:4px 0;border-top:1px solid rgba(255,255,255,.08);
}
#jd-price-history-panel .jdph-bar{
  flex:1;min-width:3px;background:linear-gradient(180deg,#ffd666,#ff9500);
  border-radius:2px 2px 0 0;opacity:.9;
}
#jd-price-history-toggle{
  position:fixed;right:10px;bottom:80px;z-index:2147483646;
  width:44px;height:44px;border-radius:22px;border:0;
  background:#e1251b;color:#fff;font-size:12px;font-weight:700;
  box-shadow:0 4px 14px rgba(225,37,27,.45);display:none;
}
</style>
<div id="jd-price-history-panel">
  <div class="jdph-hd">
    <span>${title}</span>
    <button class="jdph-close" type="button" onclick="(function(p,t){p.style.display='none';t.style.display='block';})(document.getElementById('jd-price-history-panel'),document.getElementById('jd-price-history-toggle'))">×</button>
  </div>
  ${body}
</div>
<button id="jd-price-history-toggle" type="button" onclick="(function(p,t){p.style.display='block';t.style.display='none';})(document.getElementById('jd-price-history-panel'),document.getElementById('jd-price-history-toggle'))">史价</button>
`;
}

function renderSpark(recent) {
  if (!recent || recent.length < 2) return "";
  const prices = recent.map((x) => parseFloat(x.price)).filter((n) => !isNaN(n));
  if (prices.length < 2) return "";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const bars = prices
    .map((p) => {
      const h = 8 + Math.round(((p - min) / span) * 28);
      return `<div class="jdph-bar" style="height:${h}px" title="¥${p}"></div>`;
    })
    .join("");
  return `<div class="jdph-spark" title="近 ${prices.length} 次价格采样">${bars}</div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectBeforeBodyEnd(html, snippet) {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, snippet + "</body>");
  }
  return html + snippet;
}

function fetchManmanbuy(sku) {
  const itemUrl = `https://item.jd.com/${sku}.html`;
  // 慢慢买历史价格接口（ChromeWidgetServices）
  const req = {
    url: "https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      Accept: "*/*",
      Origin: "https://www.manmanbuy.com",
      Referer: "https://www.manmanbuy.com/",
    },
    body: `methodName=getHistoryTrend&p_url=${encodeURIComponent(itemUrl)}&t=${Date.now()}`,
    timeout: 8,
  };

  return new Promise((resolve) => {
    // Quantumult X
    if (typeof $task !== "undefined" && $task.fetch) {
      $task.fetch(req).then(
        (resp) => resolve({ ok: true, body: resp.body, status: resp.statusCode }),
        (err) => resolve({ ok: false, error: err && (err.error || err.message) || String(err) })
      );
      return;
    }
    // 兼容 Surge / Loon 写法（万一共用脚本）
    if (typeof $httpClient !== "undefined") {
      $httpClient.post(req, (error, resp, data) => {
        if (error) resolve({ ok: false, error: String(error) });
        else resolve({ ok: true, body: data, status: resp && resp.status });
      });
      return;
    }
    resolve({ ok: false, error: "当前环境不支持网络请求" });
  });
}

async function main() {
  const url = $request.url;
  let html = $response.body;

  // 非 HTML 直接放行
  if (html == null) {
    $done({});
    return;
  }
  if (typeof html !== "string") {
    try {
      html = html.toString();
    } catch (e) {
      $done({});
      return;
    }
  }

  // 明显不是页面就不动
  const head = html.slice(0, 200).toLowerCase();
  if (head.indexOf("<html") === -1 && head.indexOf("<!doctype") === -1 && html.indexOf("</body>") === -1) {
    log("非 HTML 响应，跳过", url);
    $done({ body: html });
    return;
  }

  const sku = extractSku(url, html);
  log("URL:", url, "SKU:", sku);

  if (!sku) {
    const panel = buildPanelHtml("-", null, "未能识别商品 SKU");
    $done({ body: injectBeforeBodyEnd(html, panel) });
    return;
  }

  try {
    const resp = await fetchManmanbuy(sku);
    if (!resp.ok) {
      const panel = buildPanelHtml(sku, null, "网络请求失败：" + (resp.error || "unknown"));
      $done({ body: injectBeforeBodyEnd(html, panel) });
      return;
    }

    log("history status:", resp.status, "body head:", String(resp.body || "").slice(0, 180));
    const raw = parseHistoryBody(resp.body);
    const info = normalizeHistory(raw);

    if (!info) {
      const panel = buildPanelHtml(sku, null, "暂无历史价格数据（接口无有效字段）");
      $done({ body: injectBeforeBodyEnd(html, panel) });
      return;
    }

    const panel = buildPanelHtml(sku, info, null);
    $done({ body: injectBeforeBodyEnd(html, panel) });
  } catch (e) {
    log("异常", e && e.message);
    const panel = buildPanelHtml(sku, null, "脚本异常：" + (e && e.message ? e.message : e));
    $done({ body: injectBeforeBodyEnd(html, panel) });
  }
}

main();
