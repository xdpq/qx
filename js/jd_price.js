/**
 * 京东商品历史价格显示 v3
 * 重写规则:
 *   匹配地址: https://item\.m\.jd\.com/product/\d+\.html
 *   mitm: item.m.jd.com
 */

var $ = new Env("京东历史价格");

function getSkuId(url) {
  var m = url.match(/\/product\/(\d+)\.html/);
  if (m) return m[1];
  m = url.match(/[?&](?:sku|wareId)=(\d+)/);
  if (m) return m[1];
  return null;
}

function httpPost(url, body, headers) {
  return new Promise(function (resolve, reject) {
    $.http
      .post({ url: url, method: "POST", headers: headers || {}, body: body })
      .then(function (r) {
        resolve(r);
      })
      .catch(function (e) {
        reject(e);
      });
  });
}

function httpGet(url, headers) {
  return new Promise(function (resolve, reject) {
    $.http
      .get({
        url: url,
        method: "GET",
        headers: Object.assign(
          {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
          },
          headers || {}
        ),
      })
      .then(function (r) {
        resolve(r);
      })
      .catch(function (e) {
        reject(e);
      });
  });
}

// ========== 慢慢买API ==========
async function fetchFromManManBuy(skuId) {
  var url =
    "https://apapia-history.maijiabang.com/ManmanbuyComHistoryTrend.ashx";
  var body =
    "methodName=getHistoryTrend&p_url=" +
    encodeURIComponent("https://item.m.jd.com/product/" + skuId + ".html");

  try {
    var resp = await httpPost(url, body, {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://tool.manmanbuy.com/",
    });
    var data = JSON.parse(resp.body);
    $.log("[慢慢买] " + JSON.stringify(data).substring(0, 500));
    return data;
  } catch (e) {
    $.log("[慢慢买] 失败: " + (e.message || e));
    return null;
  }
}

// ========== 购物党API（备用）==========
async function fetchFromGwdang(skuId) {
  try {
    var url =
      "https://www.gwdang.com/trend/" + skuId + "?platform=jd&type=trend";
    var resp = await httpGet(url, {
      Referer: "https://www.gwdang.com/",
    });
    var body = resp.body;
    // 尝试从HTML中提取JSON数据
    var m = body.match(/var\s+chartData\s*=\s*(\{[\s\S]*?\});/);
    if (m) {
      var chartData = JSON.parse(m[1]);
      return chartData;
    }
    return null;
  } catch (e) {
    $.log("[购物党] 失败: " + (e.message || e));
    return null;
  }
}

// ========== 多源聚合 ==========
async function getAllPriceData(skuId) {
  var result = {
    skuId: skuId,
    current: null,
    lowest: null,
    highest: null,
    avg: null,
    lowestDate: null,
    trend: null,
    source: null,
  };

  // 来源1: 慢慢买
  var data1 = await fetchFromManManBuy(skuId);
  if (data1) {
    result.current =
      data1.currentPrice || data1.price || data1.nowPrice || null;
    result.lowest = data1.lower || data1.lowestPrice || null;
    result.highest = data1.upper || data1.highestPrice || null;
    result.avg = data1.avgPrice || null;
    result.lowestDate = data1.lowerDate || null;
    result.trend = data1.trend || null;
    result.source = "慢慢买";
  }

  // 如果主要接口没返回当前价格，用京东API补
  if (!result.current) {
    try {
      var jdUrl =
        "https://item-soa.jd.com/getWareBusiness?skuId=" + skuId;
      var jdResp = await httpGet(jdUrl, {
        Referer: "https://item.m.jd.com/product/" + skuId + ".html",
      });
      var jdData = JSON.parse(jdResp.body);
      if (jdData.price) {
        result.current = jdData.price.p || jdData.price.op || null;
        result.source = result.source ? result.source + "+京东" : "京东";
      }
    } catch (e) {}
  }

  return result;
}

// ========== 注入JS到页面（DOM方式，更可靠）==========
function getInjectScript(priceData) {
  var cur = priceData.current || "--";
  var low = priceData.lowest || "--";
  var high = priceData.highest || "--";
  var avg = priceData.avg || "--";
  var lowDate = priceData.lowestDate || "--";
  var trend = priceData.trend || "";
  var source = priceData.source || "慢慢买";

  // 格式化日期
  function fmtDate(s) {
    if (!s) return "--";
    s = String(s);
    if (s.length === 8)
      return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
    return s;
  }
  lowDate = fmtDate(lowDate);

  // 价格状态
  var status = "";
  var statusColor = "";
  if (cur !== "--" && low !== "--") {
    var pct = ((Number(cur) - Number(low)) / Number(low)) * 100;
    if (pct <= 2) {
      status = "历史最低";
      statusColor = "#e74c3c";
    } else if (pct <= 10) {
      status = "价格较低";
      statusColor = "#f39c12";
    } else {
      status = "价格偏高";
      statusColor = "#3498db";
    }
  }

  // 价差
  var diffText = "";
  if (cur !== "--" && low !== "--") {
    var diff = (Number(cur) - Number(low)).toFixed(2);
    var diffPct = (((Number(cur) - Number(low)) / Number(low)) * 100).toFixed(1);
    diffText = "比最低价高 ¥" + diff + " (" + diffTextPct + "%)";
  }

  // 趋势文字
  var trendText = "";
  if (trend === "up") trendText = "📈 上涨趋势";
  else if (trend === "down") trendText = "📉 下跌趋势";
  else if (trend === "flat") trendText = "➡️ 价格平稳";

  // HTML卡片
  var cardHtml =
    '<div id="__jd_hp_box" style="background:#fff;border:1px solid #eee;border-radius:12px;margin:12px 16px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
    '<span style="font-size:13px;font-weight:600;color:#333">📊 历史价格</span>' +
    '<span style="font-size:11px;color:#999">' +
    source +
    "</span>" +
    "</div>" +
    '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">' +
    '<span style="font-size:24px;font-weight:700;color:#e74c3c">¥' +
    cur +
    "</span>" +
    (status
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:' +
        statusColor +
        '">' +
        status +
        "</span>"
      : "") +
    "</div>" +
    (trendText
      ? '<div style="font-size:12px;color:#666;margin-bottom:8px">' +
        trendText +
        "</div>"
      : "") +
    (diffText
      ? '<div style="font-size:12px;color:#999;margin-bottom:10px">' +
        diffText +
        "</div>"
      : "") +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
    '<div style="text-align:center;padding:8px 0;background:#f8f8f8;border-radius:8px">' +
    '<div style="font-size:11px;color:#999">历史最低</div>' +
    '<div style="font-size:15px;font-weight:600;color:#27ae60">' +
    (low !== "--" ? "¥" + low : "--") +
    "</div>" +
    (lowDate !== "--"
      ? '<div style="font-size:10px;color:#bbb">' + lowDate + "</div>"
      : "") +
    "</div>" +
    '<div style="text-align:center;padding:8px 0;background:#f8f8f8;border-radius:8px">' +
    '<div style="font-size:11px;color:#999">历史最高</div>' +
    '<div style="font-size:15px;font-weight:600;color:#e74c3c">' +
    (high !== "--" ? "¥" + high : "--") +
    "</div></div>" +
    '<div style="text-align:center;padding:8px 0;background:#f8f8f8;border-radius:8px">' +
    '<div style="font-size:11px;color:#999">均价</div>' +
    '<div style="font-size:15px;font-weight:600;color:#333">' +
    (avg !== "--" ? "¥" + avg : "--") +
    "</div></div>" +
    "</div>" +
    "</div>";

  // 注入脚本：在DOM加载后插入到商品名下方
  var script =
    "(function(){" +
    "function insertCard(){" +
    "  var box=document.getElementById('__jd_hp_box');" +
    "  if(box) return;" +
    "  var card='" +
    cardHtml.replace(/'/g, "\\'").replace(/\n/g, "") +
    "';" +
    "  var target=null;" +
    "  /* 尝试多种定位方式 */" +
    "  /* 1. 商品名称元素 */" +
    "  target=document.querySelector('.sku-name,.item-name,.product-name,.goods-title,.sku-title-text');" +
    "  if(target){target.insertAdjacentHTML('afterend',card);return;}" +
    "  /* 2. 价格元素 */" +
    "  target=document.querySelector('.price,.item-price,.sku-price,.p-price');" +
    "  if(target){target.parentElement.insertAdjacentHTML('afterend',card);return;}" +
    "  /* 3. 主图后面 */" +
    "  target=document.querySelector('.preview,.thumb,.sku-gallery,.item-gallery');" +
    "  if(target){target.insertAdjacentHTML('afterend',card);return;}" +
    "  /* 4. body最前面 */" +
    "  document.body.insertAdjacentHTML('afterbegin',card);" +
    "}" +
    "if(document.body){insertCard();}" +
    "else{document.addEventListener('DOMContentLoaded',insertCard);}" +
    "setTimeout(insertCard,2000);" +
    "setTimeout(insertCard,5000);" +
    "})();";

  return script;
}

// ========== 主流程 ==========
async function main() {
  var url = $request.url;
  var body = $response.body || "";

  $.log("URL: " + url);

  var skuId = getSkuId(url);
  if (!skuId) {
    $.log("无SKU，跳过");
    $.done({});
    return;
  }
  $.log("SKU: " + skuId);

  var priceData = await getAllPriceData(skuId);
  $.log("数据: " + JSON.stringify(priceData));

  if (!priceData.current && !priceData.lowest) {
    $.log("无有效价格数据，跳过");
    $.done({});
    return;
  }

  var injectScript = getInjectScript(priceData);

  // 注入方式：在</head>前插入JS
  if (body.indexOf("</head>") !== -1) {
    body = body.replace("</head>", "<script>" + injectScript + "</script></head>");
  } else if (body.indexOf("</body>") !== -1) {
    body = body.replace("</body>", "<script>" + injectScript + "</script></body>");
  } else {
    body += "<script>" + injectScript + "</script>";
  }

  $.log("注入完成");
  $.done({ body: body });
}

function Env(name) {
  this.name = name;
  this.log = function () {
    var a = ["[" + name + "]"];
    for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
    console.log(a.join(" "));
  };
  this.done = function (v) {
    $done(v);
  };
}

main().catch(function (e) {
  console.log("[京东历史价格] 异常: " + (e.message || e));
  $done({});
});
