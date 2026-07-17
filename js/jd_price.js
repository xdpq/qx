/**
 * Quantumult X - 京东商品历史价格显示脚本
 * 
 * 功能：在京东APP商品页面显示该商品的历史价格走势
 * 数据源：慢慢买 (manmanbuy.com)
 * 
 * 使用方法：
 * 1. 将此脚本上传到 Quantumult X 的脚本目录
 * 2. 在 Quantumult X 配置中添加 rewrite 规则（见 jd_price.conf）
 * 3. 开启 MITM 并信任证书
 */

const $ = new Env("京东历史价格");

// ==================== 配置区 ====================
const CONFIG = {
    // 是否启用通知（关闭则只在页面注入显示）
    enableNotification: true,
    // 是否显示最低价提醒
    showLowestPrice: true,
    // 价格查询API（免费接口，无需API Key）
    api: {
        // 方法1: 使用公开的价格查询接口
        getHistory: (skuId) => `https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html`,
        // 方法2: 备用接口
        getHistoryV2: (skuId) => `https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx?methodName=getHistoryTrend&p_url=https://item.jd.com/${skuId}.html`
    }
};

// ==================== 工具函数 ====================

/**
 * 从URL中提取商品SKU ID
 */
function extractSkuId(url) {
    // 匹配京东商品URL的各种格式
    const patterns = [
        /item\.m\.jd\.com\/product\/(\d+)/,
        /item\.jd\.com\/(\d+)/,
        /product\/(\d+)\.html/,
        /wareId=(\d+)/,
        /sku=(\d+)/,
        /\/(\d{6,})\.html/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

/**
 * 格式化日期
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化价格
 */
function formatPrice(price) {
    if (price === null || price === undefined || price === 0) return "暂无";
    return `¥${price.toFixed(2)}`;
}

/**
 * 计算统计信息
 */
function calculateStats(priceData) {
    if (!priceData || priceData.length === 0) {
        return null;
    }
    
    const prices = priceData.map(item => item.price).filter(p => p > 0);
    if (prices.length === 0) return null;
    
    const currentPrice = prices[0]; // 最新价格
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // 找出最低价日期
    const lowestIndex = prices.indexOf(lowestPrice);
    const lowestDate = priceData[lowestIndex] ? formatDate(priceData[lowestIndex].date) : "未知";
    
    // 计算当前价格相比历史最低价的百分比
    const priceDiffPercent = ((currentPrice - lowestPrice) / lowestPrice * 100).toFixed(1);
    
    return {
        current: currentPrice,
        lowest: lowestPrice,
        lowestDate: lowestDate,
        highest: highestPrice,
        average: avgPrice.toFixed(2),
        diffPercent: priceDiffPercent
    };
}

/**
 * 生成价格走势图的文本描述
 */
function generatePriceTrend(priceData, days = 180) {
    if (!priceData || priceData.length === 0) {
        return "暂无历史价格数据";
    }
    
    // 只取最近N天的数据
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;
    const recentData = priceData.filter(item => item.date >= cutoffDate);
    
    if (recentData.length === 0) {
        return `最近${days}天暂无价格记录`;
    }
    
    // 按时间排序（从新到旧）
    recentData.sort((a, b) => b.date - a.date);
    
    // 计算统计
    const stats = calculateStats(recentData);
    if (!stats) return "无法计算价格统计";
    
    // 生成简化的ASCII走势图
    const prices = recentData.map(item => item.price).filter(p => p > 0);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    
    // 取关键时间点的价格（最多10个点）
    const step = Math.max(1, Math.floor(recentData.length / 10));
    const keyPoints = recentData.filter((_, i) => i % step === 0).slice(0, 10);
    
    let trend = "📈 价格走势（近" + days + "天）\n";
    trend += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    
    keyPoints.forEach(point => {
        const date = formatDate(point.date);
        const price = formatPrice(point.price);
        const barLength = Math.round(((point.price - minP) / range) * 15);
        const bar = "█".repeat(Math.max(1, barLength));
        trend += `${date} ${price} ${bar}\n`;
    });
    
    trend += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    
    return trend;
}

/**
 * 构建价格信息HTML（用于页面注入）
 */
function buildPriceHTML(productName, stats, priceTrend, skuId) {
    // 判断是否为历史低价
    const isLowest = stats && parseFloat(stats.diffPercent) < 5;
    const statusColor = isLowest ? "#4CAF50" : "#FF9800";
    const statusText = isLowest ? "🔥 历史低价" : "📊 价格正常";
    
    return `
<div id="jd-price-history" style="
    position: fixed;
    bottom: 80px;
    left: 10px;
    right: 10px;
    max-height: 60vh;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 16px;
    padding: 16px;
    z-index: 999999;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    overflow-y: auto;
    animation: slideUp 0.3s ease-out;
">
    <style>
        @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .price-history-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .price-history-title {
            font-size: 16px;
            font-weight: 600;
        }
        .price-history-close {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: none;
            color: #fff;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .price-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 12px;
        }
        .price-current {
            font-size: 36px;
            font-weight: 700;
            color: #e74c3c;
            margin: 8px 0;
        }
        .price-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin: 12px 0;
        }
        .stat-item {
            background: rgba(255,255,255,0.08);
            border-radius: 10px;
            padding: 10px 8px;
            text-align: center;
        }
        .stat-label {
            font-size: 11px;
            color: rgba(255,255,255,0.6);
            margin-bottom: 4px;
        }
        .stat-value {
            font-size: 14px;
            font-weight: 600;
            color: #fff;
        }
        .stat-value.lowest { color: #4CAF50; }
        .stat-value.highest { color: #e74c3c; }
        .price-trend {
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            padding: 12px;
            margin-top: 12px;
            font-size: 12px;
            line-height: 1.8;
            white-space: pre-line;
            font-family: 'SF Mono', 'Menlo', monospace;
        }
        .price-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
        .price-btn {
            flex: 1;
            padding: 10px;
            border-radius: 10px;
            border: none;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            text-align: center;
        }
        .price-btn-primary {
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            color: #fff;
        }
        .price-btn-secondary {
            background: rgba(255,255,255,0.1);
            color: #fff;
        }
    </style>
    
    <div class="price-history-header">
        <span class="price-history-title">📋 历史价格</span>
        <button class="price-history-close" onclick="document.getElementById('jd-price-history').remove()">×</button>
    </div>
    
    <div class="price-status" style="background: ${statusColor}20; color: ${statusColor}">
        ${statusText}
    </div>
    
    ${stats ? `
    <div class="price-current">${formatPrice(stats.current)}</div>
    
    <div class="price-stats">
        <div class="stat-item">
            <div class="stat-label">历史最低</div>
            <div class="stat-value lowest">${formatPrice(stats.lowest)}</div>
            <div class="stat-label" style="margin-top:2px">${stats.lowestDate}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">历史最高</div>
            <div class="stat-value highest">${formatPrice(stats.highest)}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">平均价格</div>
            <div class="stat-value">${formatPrice(parseFloat(stats.average))}</div>
        </div>
    </div>
    
    <div style="
        background: ${isLowest ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)'};
        border-radius: 8px;
        padding: 10px;
        text-align: center;
        font-size: 13px;
        margin-top: 8px;
    ">
        当前价格比历史最低 <b>${isLowest ? '高' : '高'}</b> <b style="color:${statusColor}">${stats.diffPercent}%</b>
    </div>
    ` : '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)">暂无价格数据</div>'}
    
    <div class="price-trend">${priceTrend}</div>
    
    <div class="price-actions">
        <button class="price-btn price-btn-primary" onclick="window.open('https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html')">查看完整走势</button>
        <button class="price-btn price-btn-secondary" onclick="document.getElementById('jd-price-history').remove()">关闭</button>
    </div>
</div>

<script>
// 自动关闭按钮
document.querySelector('.price-history-close').addEventListener('click', function() {
    document.getElementById('jd-price-history').remove();
});
</script>
`;
}

// ==================== 主逻辑 ====================

async function fetchPriceHistory(skuId) {
    console.log(`正在查询商品 ${skuId} 的历史价格...`);
    
    try {
        // 尝试主接口
        let url = CONFIG.api.getHistory(skuId);
        let response = await $.http.get({
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://apapia-history.manmanbuy.com/',
                'Accept': 'application/json, text/plain, */*'
            }
        });
        
        let data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        
        // 检查主接口返回
        if (data && data.data && data.data.length > 0) {
            console.log(`成功获取 ${data.data.length} 条价格记录`);
            return {
                success: true,
                data: data.data,
                name: data.name || '未知商品'
            };
        }
        
        // 尝试备用接口
        console.log('主接口数据为空，尝试备用接口...');
        url = CONFIG.api.getHistoryV2(skuId);
        response = await $.http.get({
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://apapia-history.manmanbuy.com/',
                'Accept': 'application/json, text/plain, */*'
            }
        });
        
        data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
        
        if (data && data.data && data.data.length > 0) {
            console.log(`备用接口获取 ${data.data.length} 条价格记录`);
            return {
                success: true,
                data: data.data,
                name: data.name || '未知商品'
            };
        }
        
        return { success: false, message: '未找到价格数据' };
        
    } catch (error) {
        console.error('查询价格失败:', error.message);
        return { success: false, message: error.message };
    }
}

/**
 * 向页面注入价格信息
 */
function injectPriceInfo(priceInfo, skuId) {
    const stats = calculateStats(priceInfo.data);
    const trend = generatePriceTrend(priceInfo.data, 180);
    const html = buildPriceHTML(priceInfo.name, stats, trend, skuId);
    
    // 使用 QX 的 notify 显示通知
    if (CONFIG.enableNotification && stats) {
        const isLowest = parseFloat(stats.diffPercent) < 5;
        const notifyTitle = isLowest ? "🔥 历史低价提醒" : "📊 京东历史价格";
        const notifyBody = [
            `当前: ${formatPrice(stats.current)}`,
            `最低: ${formatPrice(stats.lowest)} (${stats.lowestDate})`,
            `最高: ${formatPrice(stats.highest)}`,
            `平均: ${formatPrice(parseFloat(stats.average))}`,
            isLowest ? "⚡ 当前接近历史最低价！" : `比最低价高 ${stats.diffPercent}%`
        ].join("\n");
        
        $.notify(notifyTitle, notifyBody);
    }
    
    return html;
}

/**
 * 注入CSS和HTML到页面
 */
function injectToPage(html) {
    // 方案1: 使用 QX 的 response-body-modify 功能
    // 在响应体中注入我们的HTML
    const injectScript = `
    <script>
    (function() {
        // 移除旧的（如果存在）
        var old = document.getElementById('jd-price-history');
        if (old) old.remove();
        
        // 注入新的
        var div = document.createElement('div');
        div.innerHTML = \`${html.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`;
        document.body.appendChild(div.firstElementChild);
    })();
    </script>
    `;
    
    return injectScript;
}

// ==================== QX 脚本入口 ====================

(async () => {
    // 获取当前请求URL
    const url = $.request.url;
    console.log("当前URL:", url);
    
    // 提取商品SKU
    const skuId = extractSkuId(url);
    if (!skuId) {
        console.log("未检测到京东商品页面，跳过");
        $.done({});
        return;
    }
    
    console.log("检测到商品SKU:", skuId);
    
    // 查询历史价格
    const priceInfo = await fetchPriceHistory(skuId);
    
    if (priceInfo.success) {
        // 注入到页面
        const html = injectPriceInfo(priceInfo, skuId);
        console.log("价格信息已准备就绪");
        
        // 如果是响应体修改模式，这里会将html注入到body
        // 如果是通知模式，上面已经发送了通知
    } else {
        console.log("查询失败:", priceInfo.message);
        if (CONFIG.enableNotification) {
            $.notify("京东历史价格", `查询失败: ${priceInfo.message}`);
        }
    }
    
    $.done({});
})();

// ==================== Env 类（QX环境兼容） ====================
function Env(name) {
    this.name = name;
    this.request = (typeof $request !== "undefined") ? $request : null;
    this.notify = (title, subtitle, message, options) => {
        if (typeof $notify !== "undefined") {
            $notify(title, subtitle, message, options);
        }
    };
    this.log = console.log;
    this.http = {
        get: (options) => {
            return new Promise((resolve, reject) => {
                $httpClient.get(options, (error, response, body) => {
                    if (error) reject(error);
                    else resolve({ response, body });
                });
            });
        },
        post: (options) => {
            return new Promise((resolve, reject) => {
                $httpClient.post(options, (error, response, body) => {
                    if (error) reject(error);
                    else resolve({ response, body });
                });
            });
        }
    };
    this.done = (value) => {
        if (typeof $done !== "undefined") {
            $done(value);
        }
    };
}
