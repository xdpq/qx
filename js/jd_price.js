/**
 * 京东移动端网页版 · 历史价格面板
 * 适用于 Quantumult X
 *
 * 功能：
 *  - 在 item.m.jd.com 商品页注入悬浮按钮与历史价格面板
 *  - 展示：当前价 / 历史最低 / 均价 / 区间
 *  - 简易 SVG 折线图（近 90 / 180 / 全部）
 *  - 数据源：购物党（主）→ 慢慢买（备）
 *
 * 配置见同目录 jd_price_history.conf
 *
 * @version 1.0.0
 * @author Claude
 */

const VERSION = "1.0.0";
const SCRIPT_TAG = "jd-price-history";

// ===================== 工具 =====================

function log(...args) {
  console.log(`[${SCRIPT_TAG}]`, ...args);
}

function extractSku(url) {
  // https://item.m.jd.com/product/100012043978.html
  let m = url.match(/\/product\/(\d+)\.html/i);
  if (m) return m[1];

  // https://item.m.jd.com/ware/view.action?wareId=100012043978
  m = url.match(/[?&]wareId=(\d+)/i);
  if (m) return m[1];

  // https://item.m.jd.com/product/xxx 或路径尾部数字
  m = url.match(/\/(\d{6,})\.html/i);
  if (m) return m[1];

  m = url.match(/[?&]sku(?:Id)?=(\d+)/i);
  if (m) return m[1];

  return null;
}

function formatPrice(n) {
  if (n == null || isNaN(n)) return "-";
  return Number(n).toFixed(2).replace(/\.00$/, "");
}

function formatDate(ts) {
  // 支持秒 / 毫秒
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===================== 数据源 =====================

/**
 * 购物党：browser.gwdang.com
 * 返回 points: [[ts, price], ...]  ts 多为秒
 */
function fetchGwdang(sku) {
  const itemUrl = encodeURIComponent(`https://item.jd.com/${sku}.html`);
  const api = `https://browser.gwdang.com/extension/price_towards?url=${itemUrl}&from=jd`;
  return $task
    .fetch({
      url: api,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept: "application/json,text/plain,*/*",
        Referer: "https://www.gwdang.com/",
      },
    })
    .then((resp) => {
      if (resp.statusCode !== 200) throw new Error(`gwdang HTTP ${resp.statusCode}`);
      const data = JSON.parse(resp.body);
      const points = normalizeGwdang(data);
      if (!points.length) throw new Error("gwdang empty");
      return { source: "购物党", points };
    });
}

function normalizeGwdang(data) {
  const points = [];

  // 常见结构 1: { series: [{ data: [[ts,price],...] }] }
  if (data && Array.isArray(data.series)) {
    for (const s of data.series) {
      if (s && Array.isArray(s.data)) {
        for (const p of s.data) {
          if (Array.isArray(p) && p.length >= 2) {
            points.push([Number(p[0]), Number(p[1])]);
          }
        }
        break;
      }
    }
  }

  // 常见结构 2: { data: { points / price_list } }
  if (!points.length && data && data.data) {
    const arr =
      data.data.points ||
      data.data.price_list ||
      data.data.list ||
      (Array.isArray(data.data) ? data.data : null);
    if (Array.isArray(arr)) {
      for (const p of arr) {
        if (Array.isArray(p) && p.length >= 2) {
          points.push([Number(p[0]), Number(p[1])]);
        } else if (p && (p.date || p.time || p.t) != null && (p.price || p.p) != null) {
          points.push([Number(p.date || p.time || p.t), Number(p.price || p.p)]);
        }
      }
    }
  }

  // 常见结构 3: 直接数组
  if (!points.length && Array.isArray(data)) {
    for (const p of data) {
      if (Array.isArray(p) && p.length >= 2) {
        points.push([Number(p[0]), Number(p[1])]);
      }
    }
  }

  return points
    .filter((p) => !isNaN(p[0]) && !isNaN(p[1]) && p[1] > 0)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * 慢慢买：tool.manmanbuy.com
 * 返回可能是 JSONP / 自定义结构
 */
function fetchManmanbuy(sku) {
  const itemUrl = encodeURIComponent(`https://item.jd.com/${sku}.html`);
  const t = Date.now();
  const api =
    `https://tool.manmanbuy.com/history.aspx?DA=1&action=gethistory` +
    `&url=${itemUrl}&bjid=&spbh=&bh=&t=${t}`;

  return $task
    .fetch({
      url: api,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        Accept: "*/*",
        Referer: "https://tool.manmanbuy.com/",
      },
    })
    .then((resp) => {
      if (resp.statusCode !== 200) throw new Error(`manmanbuy HTTP ${resp.statusCode}`);
      const points = normalizeManmanbuy(resp.body);
      if (!points.length) throw new Error("manmanbuy empty");
      return { source: "慢慢买", points };
    });
}

function normalizeManmanbuy(body) {
  const points = [];
  let text = String(body || "").trim();

  // JSONP: callback({...})
  const jsonp = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  if (jsonp) text = jsonp[1];

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // 有些接口返回 datePrice / 字符串拼接点
    // 尝试提取 "date":"...","price":...
    const re = /"?date"?\s*[:=]\s*"?(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{10,13})"?\s*[,}][\s\S]{0,40}?"?price"?\s*[:=]\s*"?([\d.]+)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      let ts = m[1];
      if (/^\d+$/.test(ts)) {
        ts = Number(ts);
      } else {
        ts = Date.parse(ts.replace(/\//g, "-"));
      }
      points.push([ts, Number(m[2])]);
    }
    return points
      .filter((p) => !isNaN(p[0]) && !isNaN(p[1]) && p[1] > 0)
      .sort((a, b) => a[0] - b[0]);
  }

  // 常见：{ datePrice: [{date,price}...] } 或 { list / data / history }
  const list =
    data.datePrice ||
    data.list ||
    data.history ||
    data.data ||
    (Array.isArray(data) ? data : null);

  if (Array.isArray(list)) {
    for (const p of list) {
      if (Array.isArray(p) && p.length >= 2) {
        points.push([Number(p[0]), Number(p[1])]);
      } else if (p && (p.date || p.d || p.time) != null && (p.price || p.p || p.pr) != null) {
        let ts = p.date || p.d || p.time;
        if (typeof ts === "string" && !/^\d+$/.test(ts)) {
          ts = Date.parse(ts.replace(/\//g, "-"));
        } else {
          ts = Number(ts);
        }
        points.push([ts, Number(p.price || p.p || p.pr)]);
      }
    }
  }

  // 字符串： "2024-01-01,99.00|2024-01-02,98.00"
  if (!points.length && typeof data === "string") {
    const segs = data.split(/[|;]/);
    for (const seg of segs) {
      const parts = seg.split(/[,_]/);
      if (parts.length >= 2) {
        let ts = parts[0];
        if (!/^\d+$/.test(ts)) ts = Date.parse(String(ts).replace(/\//g, "-"));
        else ts = Number(ts);
        points.push([ts, Number(parts[1])]);
      }
    }
  }

  // lowerPrice / currentPrice 等元数据忽略，只取序列
  return points
    .filter((p) => !isNaN(p[0]) && !isNaN(p[1]) && p[1] > 0)
    .sort((a, b) => a[0] - b[0]);
}

function fetchHistory(sku) {
  return fetchGwdang(sku).catch((e1) => {
    log("gwdang fail:", e1 && e1.message ? e1.message : e1);
    return fetchManmanbuy(sku).catch((e2) => {
      log("manmanbuy fail:", e2 && e2.message ? e2.message : e2);
      throw new Error("历史价格接口均不可用");
    });
  });
}

// ===================== 统计 & 图表 =====================

function summarize(points) {
  if (!points.length) {
    return {
      current: null,
      lowest: null,
      highest: null,
      average: null,
      lowestDate: null,
      highestDate: null,
      count: 0,
      startDate: null,
      endDate: null,
    };
  }
  let lowest = points[0][1];
  let highest = points[0][1];
  let lowestTs = points[0][0];
  let highestTs = points[0][0];
  let sum = 0;
  for (const [ts, price] of points) {
    sum += price;
    if (price < lowest) {
      lowest = price;
      lowestTs = ts;
    }
    if (price > highest) {
      highest = price;
      highestTs = ts;
    }
  }
  return {
    current: points[points.length - 1][1],
    lowest,
    highest,
    average: sum / points.length,
    lowestDate: formatDate(lowestTs),
    highestDate: formatDate(highestTs),
    count: points.length,
    startDate: formatDate(points[0][0]),
    endDate: formatDate(points[points.length - 1][0]),
  };
}

function filterByDays(points, days) {
  if (!days || !points.length) return points.slice();
  const lastTs = points[points.length - 1][0];
  const lastMs = lastTs < 1e12 ? lastTs * 1000 : lastTs;
  const minMs = lastMs - days * 86400000;
  return points.filter(([ts]) => {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return ms >= minMs;
  });
}

/**
 * 生成简易 SVG 折线图（服务端渲染进 HTML，无需页面再请求）
 */
function buildSvgChart(points, width, height) {
  const w = width || 320;
  const h = height || 140;
  const padL = 36;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  if (!points.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="#fafafa" rx="8"/>
      <text x="50%" y="50%" text-anchor="middle" fill="#999" font-size="12">暂无数据</text>
    </svg>`;
  }

  // 抽样，避免点过多
  let pts = points;
  const maxPts = 120;
  if (pts.length > maxPts) {
    const step = Math.ceil(pts.length / maxPts);
    const sampled = [];
    for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);
    if (sampled[sampled.length - 1] !== pts[pts.length - 1]) {
      sampled.push(pts[pts.length - 1]);
    }
    pts = sampled;
  }

  let minP = pts[0][1];
  let maxP = pts[0][1];
  let minT = pts[0][0];
  let maxT = pts[0][0];
  for (const [t, p] of pts) {
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  // 避免水平线时除零
  if (maxP === minP) {
    maxP = minP + 1;
  }
  if (maxT === minT) {
    maxT = minT + 1;
  }

  const xOf = (t) => padL + ((t - minT) / (maxT - minT)) * plotW;
  const yOf = (p) => padT + (1 - (p - minP) / (maxP - minP)) * plotH;

  const line = pts
    .map(([t, p], i) => `${i === 0 ? "M" : "L"}${xOf(t).toFixed(1)},${yOf(p).toFixed(1)}`)
    .join(" ");

  // 面积填充
  const area =
    line +
    ` L${xOf(pts[pts.length - 1][0]).toFixed(1)},${(padT + plotH).toFixed(1)}` +
    ` L${xOf(pts[0][0]).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  // Y 轴刻度 3 档
  const yTicks = [minP, (minP + maxP) / 2, maxP];
  const yLabels = yTicks
    .map((v) => {
      const y = yOf(v);
      return `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="#999" font-size="9">${formatPrice(v)}</text>
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
    })
    .join("");

  // X 轴首尾日期
  const xLabels = `
    <text x="${padL}" y="${h - 6}" text-anchor="start" fill="#999" font-size="9">${formatDate(minT)}</text>
    <text x="${w - padR}" y="${h - 6}" text-anchor="end" fill="#999" font-size="9">${formatDate(maxT)}</text>
  `;

  // 最低点标记
  let lowIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] < pts[lowIdx][1]) lowIdx = i;
  }
  const lowX = xOf(pts[lowIdx][0]);
  const lowY = yOf(pts[lowIdx][1]);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:auto;">
    <defs>
      <linearGradient id="jphGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e4393c" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#e4393c" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#fff" rx="8"/>
    ${yLabels}
    <path d="${area}" fill="url(#jphGrad)"/>
    <path d="${line}" fill="none" stroke="#e4393c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lowX.toFixed(1)}" cy="${lowY.toFixed(1)}" r="3.5" fill="#fff" stroke="#e4393c" stroke-width="2"/>
    ${xLabels}
  </svg>`;
}

// ===================== 注入 HTML =====================

function buildPanelPayload(sku, result) {
  const all = result.points;
  const ranges = {
    90: filterByDays(all, 90),
    180: filterByDays(all, 180),
    all: all,
  };

  const stats = {
    90: summarize(ranges[90]),
    180: summarize(ranges[180]),
    all: summarize(ranges.all),
  };

  const charts = {
    90: buildSvgChart(ranges[90]),
    180: buildSvgChart(ranges[180]),
    all: buildSvgChart(ranges.all),
  };

  return {
    ok: true,
    sku,
    source: result.source,
    version: VERSION,
    stats,
    charts,
    // 给前端切换用的精简点（可选 hover，此处只做展示）
    latest: stats.all.current,
    lowest: stats.all.lowest,
    lowestDate: stats.all.lowestDate,
  };
}

function buildErrorPayload(sku, message) {
  return {
    ok: false,
    sku: sku || "",
    message: message || "获取失败",
    version: VERSION,
  };
}

/**
 * 注入到页面的 CSS + HTML + JS
 * data 已经是可 JSON 序列化的对象
 */
function buildInjection(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  const css = `
#jph-root{all:initial;position:fixed;z-index:2147483646;right:12px;bottom:88px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;font-size:13px;line-height:1.4;color:#333;-webkit-tap-highlight-color:transparent}
#jph-root *{box-sizing:border-box}
#jph-fab{width:48px;height:48px;border-radius:24px;background:linear-gradient(135deg,#e4393c,#ff6b6b);color:#fff;border:none;box-shadow:0 4px 14px rgba(228,57,60,.45);display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;padding:0}
#jph-fab .jph-fab-price{font-size:10px;font-weight:700;max-width:44px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#jph-fab .jph-fab-label{font-size:9px;opacity:.9;margin-top:1px}
#jph-panel{display:none;position:absolute;right:0;bottom:58px;width:min(92vw,360px);background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden;border:1px solid rgba(0,0,0,.06)}
#jph-panel.jph-open{display:block;animation:jphIn .18s ease-out}
@keyframes jphIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#jph-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;background:linear-gradient(135deg,#fff5f5,#fff)}
#jph-hd h3{margin:0;font-size:15px;font-weight:700;color:#e4393c}
#jph-hd .jph-sub{font-size:11px;color:#999;margin-top:2px}
#jph-close{border:0;background:#f5f5f5;width:28px;height:28px;border-radius:14px;font-size:16px;line-height:28px;color:#666;cursor:pointer}
#jph-tabs{display:flex;gap:6px;padding:0 12px 8px}
#jph-tabs button{flex:1;border:1px solid #eee;background:#fafafa;border-radius:16px;padding:5px 0;font-size:12px;color:#666;cursor:pointer}
#jph-tabs button.jph-on{background:#e4393c;border-color:#e4393c;color:#fff;font-weight:600}
#jph-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:4px 12px 10px}
#jph-stats .jph-card{background:#fafafa;border-radius:10px;padding:8px 6px;text-align:center}
#jph-stats .jph-k{font-size:11px;color:#999}
#jph-stats .jph-v{font-size:15px;font-weight:700;color:#333;margin-top:2px}
#jph-stats .jph-v.jph-low{color:#e4393c}
#jph-stats .jph-v.jph-hi{color:#2b8a3e}
#jph-stats .jph-d{font-size:10px;color:#bbb;margin-top:2px;min-height:14px}
#jph-chart{padding:0 10px 6px}
#jph-ft{padding:6px 14px 12px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#bbb}
#jph-err{padding:28px 16px;text-align:center;color:#999;font-size:13px}
#jph-mask{display:none;position:fixed;inset:0;background:transparent;z-index:2147483645}
#jph-mask.jph-open{display:block}
`.replace(/\n/g, "");

  // 前端只做切换 range / 开关面板，数据已内嵌
  const js = `
(function(){
  if(window.__JPH_INIT__) return;
  window.__JPH_INIT__=1;
  var DATA=${json};

  function el(tag,cls,html){
    var e=document.createElement(tag);
    if(cls) e.className=cls;
    if(html!=null) e.innerHTML=html;
    return e;
  }
  function fmt(n){
    if(n==null||isNaN(n)) return "-";
    return Number(n).toFixed(2).replace(/\\.00$/,"");
  }

  var mask=el("div"); mask.id="jph-mask";
  var root=el("div"); root.id="jph-root";
  var fab=el("button"); fab.id="jph-fab"; fab.type="button";
  var panel=el("div"); panel.id="jph-panel";

  function setFab(){
    var price = DATA.ok ? DATA.latest : null;
    fab.innerHTML = '<div class="jph-fab-price">'+(price!=null?("¥"+fmt(price)):"史价")+'</div><div class="jph-fab-label">历史价</div>';
  }

  function render(range){
    range = range || "180";
    if(!DATA.ok){
      panel.innerHTML = '<div id="jph-hd"><div><h3>历史价格</h3><div class="jph-sub">SKU '+(DATA.sku||"-")+'</div></div><button id="jph-close" type="button">×</button></div>'
        + '<div id="jph-err">'+(DATA.message||"获取失败")+'<br><span style="font-size:11px;color:#ccc">可稍后重试或检查代理/MITM</span></div>';
      bindChrome();
      return;
    }
    var st = DATA.stats[range] || DATA.stats.all;
    var chart = DATA.charts[range] || DATA.charts.all;
    panel.innerHTML =
      '<div id="jph-hd"><div><h3>历史价格</h3><div class="jph-sub">SKU '+DATA.sku+' · 来源 '+DATA.source+'</div></div>'
      + '<button id="jph-close" type="button">×</button></div>'
      + '<div id="jph-tabs">'
      +   '<button type="button" data-r="90"'+(range==="90"?' class="jph-on"':'')+'>近90天</button>'
      +   '<button type="button" data-r="180"'+(range==="180"?' class="jph-on"':'')+'>近180天</button>'
      +   '<button type="button" data-r="all"'+(range==="all"?' class="jph-on"':'')+'>全部</button>'
      + '</div>'
      + '<div id="jph-stats">'
      +   '<div class="jph-card"><div class="jph-k">当前</div><div class="jph-v">¥'+fmt(st.current)+'</div><div class="jph-d">'+(st.endDate||"")+'</div></div>'
      +   '<div class="jph-card"><div class="jph-k">历史最低</div><div class="jph-v jph-low">¥'+fmt(st.lowest)+'</div><div class="jph-d">'+(st.lowestDate||"")+'</div></div>'
      +   '<div class="jph-card"><div class="jph-k">历史最高</div><div class="jph-v jph-hi">¥'+fmt(st.highest)+'</div><div class="jph-d">'+(st.highestDate||"")+'</div></div>'
      +   '<div class="jph-card"><div class="jph-k">平均价</div><div class="jph-v">¥'+fmt(st.average)+'</div><div class="jph-d">'+st.count+' 个点</div></div>'
      +   '<div class="jph-card"><div class="jph-k">区间起</div><div class="jph-v" style="font-size:12px">'+ (st.startDate||"-") +'</div><div class="jph-d">&nbsp;</div></div>'
      +   '<div class="jph-card"><div class="jph-k">区间止</div><div class="jph-v" style="font-size:12px">'+ (st.endDate||"-") +'</div><div class="jph-d">&nbsp;</div></div>'
      + '</div>'
      + '<div id="jph-chart">'+chart+'</div>'
      + '<div id="jph-ft"><span>红点 = 区间最低</span><span>v'+DATA.version+'</span></div>';
    bindChrome(range);
  }

  function bindChrome(range){
    var close=panel.querySelector("#jph-close");
    if(close) close.onclick=function(e){e.stopPropagation();closePanel();};
    var tabs=panel.querySelectorAll("#jph-tabs button");
    for(var i=0;i<tabs.length;i++){
      tabs[i].onclick=function(e){
        e.stopPropagation();
        render(this.getAttribute("data-r"));
      };
    }
  }

  function openPanel(){
    panel.classList.add("jph-open");
    mask.classList.add("jph-open");
  }
  function closePanel(){
    panel.classList.remove("jph-open");
    mask.classList.remove("jph-open");
  }

  setFab();
  render("180");
  fab.onclick=function(e){
    e.stopPropagation();
    if(panel.classList.contains("jph-open")) closePanel();
    else openPanel();
  };
  mask.onclick=closePanel;
  root.appendChild(panel);
  root.appendChild(fab);
  document.documentElement.appendChild(mask);
  document.documentElement.appendChild(root);
})();
`;

  return (
    `<style id="jph-style">${css}</style>` +
    `<script id="jph-script">${js}</script>`
  );
}

function inject(html, injection) {
  if (!html || typeof html !== "string") return html;

  // 避免重复注入
  if (html.indexOf("id=\"jph-root\"") !== -1 || html.indexOf("id='jph-root'") !== -1) {
    return html;
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, injection + "</body>");
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, injection + "</html>");
  }
  return html + injection;
}

// ===================== 主流程 =====================

function passThrough() {
  $done({});
}

function finishWithBody(body) {
  $done({ body });
}

(function main() {
  try {
    const url = $request.url || "";
    const body = $response && $response.body;

    // 非 HTML 直接放行
    const ct =
      ($response.headers &&
        ($response.headers["Content-Type"] ||
          $response.headers["content-type"])) ||
      "";
    if (body == null) return passThrough();
    if (ct && !/text\/html|application\/xhtml/i.test(ct) && !/^\s*</.test(String(body).slice(0, 256))) {
      return passThrough();
    }

    const sku = extractSku(url);
    log("url=", url, "sku=", sku);

    if (!sku) {
      // 无 SKU（可能是列表/活动页），不注入
      return passThrough();
    }

    // 部分京东页是 gzip 后的二进制；QX 一般会解压成字符串。若不是字符串则放行
    if (typeof body !== "string") {
      log("body is not string, skip");
      return passThrough();
    }

    fetchHistory(sku)
      .then((result) => {
        const payload = buildPanelPayload(sku, result);
        const injection = buildInjection(payload);
        const newBody = inject(body, injection);
        log("injected ok, source=", result.source, "points=", result.points.length);
        finishWithBody(newBody);
      })
      .catch((err) => {
        log("history error:", err && err.message ? err.message : err);
        const payload = buildErrorPayload(sku, (err && err.message) || "获取历史价格失败");
        const injection = buildInjection(payload);
        const newBody = inject(body, injection);
        finishWithBody(newBody);
      });
  } catch (e) {
    log("fatal:", e && e.message ? e.message : e);
    passThrough();
  }
})();
