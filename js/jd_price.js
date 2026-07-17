/**
 * 京东商品历史价格显示 - QuantumultX 脚本
 * 数据来源：慢慢买历史价格查询
 *
 * 使用方式：
 * 1. 量子X App → 重写 → 添加重写
 * 2. 类型：脚本 | 常规表达式（regex）
 * 3. 匹配地址：^https?://item\.m\.jd\.com/product/\d+\.html
 * 4. 脚本路径：选择本文件
 * 5. 打开mitm，添加 hostname = item.m.jd.com
 */

const $ = new Env("京东历史价格");

// ========== 配置 ==========
const CONFIG = {
  // 慢慢买API地址（请自行申请或使用公益接口）
  apiBase: "https://apapia-history.maijiabang.com/ManmanbuyComHistoryTrend.ashx",
  // 淘系比价备用地址
  apiBackup: "https://apapia-history.maijiabang.com/MobileNew.aspx",
  // 请求超时
  timeout: 8000,
};

// ========== 主逻辑 ==========
async function main() {
  const url = $request.url;
  let body = $response.body;

  // 从URL提取SKU ID
  const skuId = extractSkuId(url);
  if (!skuId) {
    $.log("未找到SKU ID，跳过");
    $.done({});
    return;
  }

  $.log(`SKU ID: ${skuId}`);

  // 获取历史价格数据
  const priceData = await fetchHistoryPrice(skuId);
  if (!priceData) {
    $.log("获取历史价格失败");
    $.done({});
    return;
  }

  // 生成注入HTML
  const infoHtml = buildInfoHtml(priceData);

  // 注入到页面
  if (body.includes("<body")) {
    body = body.replace(/<body([^>]*)>/i, `<body$1>${infoHtml}`);
  } else {
    body = infoHtml + body;
  }

  $.done({ body });
}

// ========== 提取SKU ID ==========
function extractSkuId(url) {
  // 方式1: URL路径 /product/100012345.html
  let match = url.match(/\/product\/(\d+)\.html/);
  if (match) return match[1];

  // 方式2: query参数 sku=xxx
  match = url.match(/[?&]sku=(\d+)/);
  if (match) return match[1];

  // 方式3: query参数 wareId=xxx
  match = url.match(/[?&]wareId=(\d+)/);
  if (match) return match[1];

  // 方式4: 从referrer获取（如果有的话）
  try {
    const referer = $request.headers?.["Referer"] || $request.headers?.["referer"] || "";
    match = referer.match(/\/product\/(\d+)\.html/);
    if (match) return match[1];
  } catch (e) {}

  return null;
}

// ========== 获取历史价格 ==========
function fetchHistoryPrice(skuId) {
  return new Promise((resolve) => {
    // 构造商品URL
    const productUrl = `https://item.m.jd.com/product/${skuId}.html`;

    const body = `methodName=getHistoryTrend&p_url=${encodeURIComponent(productUrl)}`;

    const opts = {
      url: CONFIG.apiBase,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        "Referer": "https://tool.manmanbuy.com/",
      },
      body: body,
    };

    $.http.post(opts)
      .then((resp) => {
        const data = JSON.parse(resp.body);
        $.log("API返回:", JSON.stringify(data));

        if (data && data.ok) {
          resolve(data);
        } else {
          $.log("API返回异常");
          resolve(null);
        }
      })
      .catch((err) => {
        $.log("请求失败:", err.message || err);
        resolve(null);
      });
  });
}

// ========== 构建注入HTML ==========
function buildInfoHtml(data) {
  // 解析价格数据
  let currentPrice = "--";
  let lowestPrice = "--";
  let highestPrice = "--";
  let lowestDate = "--";
  let avgPrice = "--";
  let priceDiff = "--";
  let priceDiffPct = "--";
  let updateDate = "";
  let trendEmoji = "";
  let trendColor = "";

  try {
    // 慢慢买返回的数据结构
    if (data.currentPrice !== undefined) {
      currentPrice = Number(data.currentPrice).toFixed(2);
    } else if (data.price !== undefined) {
      currentPrice = Number(data.price).toFixed(2);
    }

    if (data.lower !== undefined) {
      lowestPrice = Number(data.lower).toFixed(2);
    }

    if (data.upper !== undefined) {
      highestPrice = Number(data.upper).toFixed(2);
    }

    if (data.lowerDate) {
      lowestDate = formatDate(data.lowerDate);
    }

    if (data.avgPrice !== undefined) {
      avgPrice = Number(data.avgPrice).toFixed(2);
    }

    if (data.trend) {
      trendEmoji = data.trend === "up" ? "📈" : data.trend === "down" ? "📉" : "➡️";
      trendColor = data.trend === "up" ? "#e74c3c" : data.trend === "down" ? "#27ae60" : "#95a5a6";
    }

    if (data.date) {
      updateDate = formatDate(data.date);
    }

    // 计算价差
    if (currentPrice !== "--" && lowestPrice !== "--") {
      const diff = Number(currentPrice) - Number(lowestPrice);
      priceDiff = diff.toFixed(2);
      const pct = (diff / Number(lowestPrice)) * 100;
      priceDiffPct = pct.toFixed(1);
    }
  } catch (e) {
    $.log("数据解析失败:", e.message);
  }

  // 确定当前价格状态
  let statusText = "";
  let statusColor = "";
  if (currentPrice !== "--" && lowestPrice !== "--") {
    if (Number(currentPrice) <= Number(lowestPrice) * 1.02) {
      statusText = "历史低价";
      statusColor = "#e74c3c";
    } else if (Number(currentPrice) <= Number(lowestPrice) * 1.10) {
      statusText = "价格较低";
      statusColor = "#f39c12";
    } else {
      statusText = "价格偏高";
      statusColor = "#3498db";
    }
  }

  const html = `
    <div id="historyPriceBox" style="
      position: fixed;
      top: 50px;
      left: 10px;
      right: 10px;
      z-index: 99999;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      padding: 20px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
      animation: slideDown 0.3s ease-out;
    ">
      <style>
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        #historyPriceBox .hp-title {
          font-size: 11px;
          color: #8e99a4;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        #historyPriceBox .hp-current {
          font-size: 28px;
          font-weight: 700;
          color: #e74c3c;
          margin-bottom: 4px;
        }
        #historyPriceBox .hp-current::before {
          content: '¥';
          font-size: 18px;
          font-weight: 400;
        }
        #historyPriceBox .hp-status {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 12px;
        }
        #historyPriceBox .hp-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        #historyPriceBox .hp-item {
          flex: 1;
          min-width: 45%;
          background: rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 10px;
          text-align: center;
        }
        #historyPriceBox .hp-item-label {
          font-size: 11px;
          color: #8e99a4;
          margin-bottom: 4px;
        }
        #historyPriceBox .hp-item-value {
          font-size: 16px;
          font-weight: 600;
          color: #ecf0f1;
        }
        #historyPriceBox .hp-item-value.red { color: #e74c3c; }
        #historyPriceBox .hp-item-value.green { color: #2ecc71; }
        #historyPriceBox .hp-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 10px;
          margin-top: 4px;
        }
        #historyPriceBox .hp-close {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          border: none;
          color: #8e99a4;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #historyPriceBox .hp-update {
          font-size: 10px;
          color: #5d6d7e;
        }
        #historyPriceBox .hp-price-tag {
          font-size: 13px;
          color: #8e99a4;
          margin-bottom: 16px;
        }
        #historyPriceBox .hp-price-tag span {
          color: #ecf0f1;
          font-weight: 600;
        }
        #historyPriceBox .hp-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }
      </style>

      <!-- 标题 -->
      <div class="hp-title">历史价格走势</div>

      <!-- 当前价格 -->
      <div class="hp-current">${currentPrice}</div>

      <!-- 价格状态标签 -->
      ${statusText ? `<div class="hp-status" style="background:${statusColor}; animation: pulse 2s infinite;">${statusText}</div>` : ""}

      <!-- 价格区间 -->
      <div class="hp-price-tag">
        ${trendEmoji ? `价格趋势 ${trendEmoji} <span style="color:${trendColor}">${trendEmoji}</span>` : ""}
        ${priceDiff !== "--" ? `比历史最低<span style="color:#e74c3c">高¥${priceDiff}</span> (${priceDiffPct}%)` : ""}
      </div>

      <!-- 详细数据 -->
      <div class="hp-bottom-grid">
        <div class="hp-item">
          <div class="hp-item-label">历史最低</div>
          <div class="hp-item-value green">${lowestPrice !== "--" ? "¥" + lowestPrice : "--"}</div>
          ${lowestDate !== "--" ? `<div class="hp-item-label" style="font-size:10px">${lowestDate}</div>` : ""}
        </div>
        <div class="hp-item">
          <div class="hp-item-label">历史最高</div>
          <div class="hp-item-value red">${highestPrice !== "--" ? "¥" + highestPrice : "--"}</div>
        </div>
        <div class="hp-item">
          <div class="hp-item-label">均价</div>
          <div class="hp-item-value">${avgPrice !== "--" ? "¥" + avgPrice : "--"}</div>
        </div>
      </div>

      <!-- 底部 -->
      <div class="hp-footer">
        <div class="hp-update">数据来源：慢慢买 · ${updateDate || new Date().toLocaleDateString("zh-CN")}</div>
        <button class="hp-close" onclick="document.getElementById('historyPriceBox').style.display='none'">✕</button>
      </div>
    </div>
  `;

  return html;
}

// ========== 工具函数 ==========
function formatDate(dateStr) {
  if (!dateStr) return "--";
  try {
    // 支持多种日期格式
    if (dateStr.length === 8) {
      // 20231025 → 2023-10-25
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    if (dateStr.includes("T") || dateStr.includes("-")) {
      return dateStr.split("T")[0];
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

// ========== QuantumultX Env ==========
function Env(name) {
  this.name = name;
  this.log = (...args) => console.log(`[${this.name}]`, ...args);
  this.done = (value) => $done(value);
}

// 启动
main().catch((e) => {
  $.log("脚本异常:", e.message || e);
  $.done({});
});
