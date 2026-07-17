/**
 * 京东商品历史价格显示 v2 - QuantumultX 脚本
 * 使用方式：
 *   重写 → 新增 → 常规表达式
 *   匹配地址: https://item\.m\.jd\.com/product/\d+\.html
 *   脚本路径: 选择本文件
 *   mitm 主机名: item.m.jd.com
 */

var $ = new Env("京东历史价格");

// ========== 从URL提取SKU ==========
function getSkuId(url) {
  var m = url.match(/\/product\/(\d+)\.html/);
  if (m) return m[1];
  m = url.match(/[?&](?:sku|wareId)=(\d+)/);
  if (m) return m[1];
  return null;
}

// ========== HTTP请求封装 ==========
function httpGet(url, headers) {
  return new Promise(function (resolve, reject) {
    var opts = {
      url: url,
      method: "GET",
      headers: Object.assign(
        {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        },
        headers || {}
      ),
    };
    $.http
      .get(opts)
      .then(function (resp) {
        resolve(resp);
      })
      .catch(function (err) {
        reject(err);
      });
  });
}

// ========== 慢慢买API（主接口）==========
function fetchManManBuy(skuId) {
  return new Promise(function (resolve) {
    var url =
      "https://apapia-history.maijiabang.com/ManmanbuyComHistoryTrend.ashx";
    var body =
      "methodName=getHistoryTrend&p_url=" +
      encodeURIComponent("https://item.m.jd.com/product/" + skuId + ".html");

    var opts = {
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        Referer: "https://tool.manmanbuy.com/",
      },
      body: body,
    };

    $.http
      .post(opts)
      .then(function (resp) {
        try {
          var data = JSON.parse(resp.body);
          $.log("[慢慢买] 返回: " + JSON.stringify(data).substring(0, 300));
          if (data) resolve(data);
          else resolve(null);
        } catch (e) {
          $.log("[慢慢买] JSON解析失败: " + e.message);
          resolve(null);
        }
      })
      .catch(function (err) {
        $.log("[慢慢买] 请求失败: " + (err.message || err));
        resolve(null);
      });
  });
}

// ========== 备用接口：直接抓取慢慢买网页价格 ==========
function fetchFromWeb(skuId) {
  return new Promise(function (resolve) {
    var url =
      "https://tool.manmanbuy.com/history.aspx?url=" +
      encodeURIComponent("https://item.m.jd.com/product/" + skuId + ".html");

    httpGet(url, { Referer: "https://tool.manmanbuy.com/" })
      .then(function (resp) {
        try {
          var body = resp.body;
          // 尝试从网页提取价格数据
          var priceMatch = body.match(
            /var\s+currentPrice\s*=\s*['"]?([\d.]+)['"]?/
          );
          var lowMatch = body.match(
            /var\s+lowestPrice\s*=\s*['"]?([\d.]+)['"]?/
          );
          var highMatch = body.match(
            /var\s+highestPrice\s*=\s*['"]?([\d.]+)['"]?/
          );

          if (priceMatch || lowMatch) {
            resolve({
              currentPrice: priceMatch ? priceMatch[1] : null,
              lower: lowMatch ? lowMatch[1] : null,
              upper: highMatch ? highMatch[1] : null,
              _source: "web",
            });
          } else {
            $.log("[Web] 未找到价格数据");
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      })
      .catch(function (err) {
        $.log("[Web] 请求失败: " + (err.message || err));
        resolve(null);
      });
  });
}

// ========== 聚合获取价格（多源尝试）==========
async function getPriceData(skuId) {
  // 尝试1: 慢慢买API
  $.log("尝试慢慢买API...");
  var data = await fetchManManBuy(skuId);
  if (data && (data.currentPrice || data.price || data.lower)) {
    $.log("慢慢买API成功");
    return data;
  }

  // 尝试2: 网页抓取
  $.log("尝试网页抓取...");
  var webData = await fetchFromWeb(skuId);
  if (webData) {
    $.log("网页抓取成功");
    return webData;
  }

  return null;
}

// ========== 构建价格卡片HTML ==========
function buildCard(data) {
  var cur = "--",
    low = "--",
    high = "--",
    lowDate = "--",
    avg = "--",
    trend = "",
    updateDate = "";

  try {
    // 兼容多种API返回格式
    if (data.currentPrice != null) cur = Number(data.currentPrice).toFixed(2);
    else if (data.price != null) cur = Number(data.price).toFixed(2);
    else if (data.nowPrice != null) cur = Number(data.nowPrice).toFixed(2);

    if (data.lower != null) low = Number(data.lower).toFixed(2);
    else if (data.lowestPrice != null) low = Number(data.lowestPrice).toFixed(2);

    if (data.upper != null) high = Number(data.upper).toFixed(2);
    else if (data.highestPrice != null)
      high = Number(data.highestPrice).toFixed(2);

    if (data.lowerDate) lowDate = formatDate(data.lowerDate);
    if (data.avgPrice != null) avg = Number(data.avgPrice).toFixed(2);

    if (data.trend === "up") trend = "📈 涨";
    else if (data.trend === "down") trend = "📉 跌";
    else if (data.trend === "flat") trend = "➡️ 平";

    if (data.date) updateDate = formatDate(data.date);
  } catch (e) {
    $.log("解析数据失败: " + e.message);
  }

  // 价格状态判断
  var status = "";
  var statusBg = "";
  if (cur !== "--" && low !== "--") {
    var diff = Number(cur) - Number(low);
    var pct = (diff / Number(low)) * 100;
    if (pct <= 2) {
      status = "历史最低";
      statusBg = "#e74c3c";
    } else if (pct <= 10) {
      status = "价格较低";
      statusBg = "#f39c12";
    } else {
      status = "价格偏高";
      statusBg = "#3498db";
    }
  }

  var priceTag =
    cur !== "--" && low !== "--"
      ? "比最低价 <b style='color:#ff6b6b'>高¥" +
        (Number(cur) - Number(low)).toFixed(2) +
        "</b> (" +
        (((Number(cur) - Number(low)) / Number(low)) * 100).toFixed(1) +
        "%)"
      : "";

  var html =
    '<div id="hp-box" style="position:fixed;top:44px;left:8px;right:8px;z-index:99999;background:#1a1a2e;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.5);padding:16px 18px;color:#fff;font-family:-apple-system,sans-serif;animation:hp-in .3s ease">' +
    "<style>" +
    "@keyframes hp-in{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}" +
    "</style>" +
    "<div style='font-size:10px;color:#7f8c8d;letter-spacing:1px;margin-bottom:6px'>历史价格</div>" +
    "<div style='font-size:30px;font-weight:700;color:#ff6b6b;margin-bottom:2px'>¥" +
    cur +
    "</div>" +
    (status
      ? "<div style='display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;color:#fff;background:" +
        statusBg +
        ";margin-bottom:10px'>" +
        status +
        "</div>"
      : "") +
    (priceTag
      ? "<div style='font-size:12px;color:#95a5a6;margin-bottom:12px'>" +
        priceTag +
        "</div>"
      : "<div style='margin-bottom:12px'></div>") +
    "<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px'>" +
    "<div style='background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center'>" +
    "<div style='font-size:10px;color:#7f8c8d'>历史最低</div>" +
    "<div style='font-size:14px;font-weight:600;color:#2ecc71'>" +
    (low !== "--" ? "¥" + low : "--") +
    "</div>" +
    (lowDate !== "--"
      ? "<div style='font-size:9px;color:#5d6d7e'>" + lowDate + "</div>"
      : "") +
    "</div>" +
    "<div style='background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center'>" +
    "<div style='font-size:10px;color:#7f8c8d'>历史最高</div>" +
    "<div style='font-size:14px;font-weight:600;color:#e74c3c'>" +
    (high !== "--" ? "¥" + high : "--") +
    "</div></div>" +
    "<div style='background:rgba(255,255,255,.06);border-radius:8px;padding:8px;text-align:center'>" +
    "<div style='font-size:10px;color:#7f8c8d'>均价</div>" +
    "<div style='font-size:14px;font-weight:600;color:#ecf0f1'>" +
    (avg !== "--" ? "¥" + avg : "--") +
    "</div></div>" +
    "</div>" +
    "<div style='display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.08);padding-top:8px'>" +
    "<div style='font-size:9px;color:#5d6d7e'>慢慢买 · " +
    (updateDate || new Date().toLocaleDateString("zh-CN")) +
    "</div>" +
    "<div onclick=\"document.getElementById('hp-box').style.display='none'\" style='width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.1);text-align:center;line-height:24px;font-size:14px;color:#7f8c8d;cursor:pointer'>✕</div>" +
    "</div>" +
    "</div>";

  return html;
}

// ========== 日期格式化 ==========
function formatDate(s) {
  if (!s) return "--";
  s = String(s);
  if (s.length === 8) return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
  if (s.indexOf("T") > -1) return s.split("T")[0];
  return s;
}

// ========== 主流程 ==========
async function main() {
  var url = $request.url;
  var body = $response.body || "";

  $.log("请求URL: " + url);

  var skuId = getSkuId(url);
  if (!skuId) {
    $.log("未提取到SKU，跳过");
    $.done({});
    return;
  }
  $.log("SKU: " + skuId);

  var priceData = await getPriceData(skuId);
  if (!priceData) {
    $.log("所有数据源均失败，跳过注入");
    $.done({});
    return;
  }

  var cardHtml = buildCard(priceData);

  // 注入到页面
  if (body.indexOf("<body") !== -1) {
    body = body.replace(/<body([^>]*)>/i, "<body$1>" + cardHtml);
  } else if (body.indexOf("</head>") !== -1) {
    body = body.replace("</head>", cardHtml + "</head>");
  } else {
    body = cardHtml + body;
  }

  $.log("注入成功");
  $.done({ body: body });
}

// ========== Env ==========
function Env(name) {
  this.name = name;
  this.log = function () {
    var args = ["[" + name + "]"];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.log(args.join(" "));
  };
  this.done = function (v) {
    $done(v);
  };
}

main().catch(function (e) {
  console.log("[京东历史价格] 异常: " + (e.message || e));
  $done({});
});
