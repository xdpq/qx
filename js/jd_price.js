/**
 * Quantumult X - 京东商品历史价格显示
 * 
 * 适配京东APP：api.m.jd.com/client.action
 * 数据源：慢慢买
 */

const $ = new Env("京东历史价格");

// ==================== 主逻辑 ====================
console.log('触发脚本');
(async () => {
    try {
        // 1. 获取请求信息
        const url = $request.url;
        const body = $request.body || "";
        console.log("请求URL:", url);
        console.log("请求体:", body.substring(0, 500));
        
        // 2. 提取SKU
        const skuId = extractSku(url, body);
        console.log("提取到SKU:", skuId);
        
        if (!skuId) {
            console.log("未提取到SKU，跳过");
            $.done({});
            return;
        }
        
        // 3. 查询历史价格
        const priceData = await fetchPrice(skuId);
        console.log("价格数据:", priceData ? priceData.length + "条" : "无");
        
        if (!priceData || priceData.length === 0) {
            console.log("无价格数据");
            $.done({});
            return;
        }
        
        // 4. 计算统计
        const stats = calcStats(priceData);
        console.log("统计:", JSON.stringify(stats));
        
        // 5. 生成HTML
        const html = buildHtml(stats, skuId);
        
        // 6. 发送通知
        const notifyTitle = stats.isLow ? "🔥 历史低价" : "📊 京东价格";
        const notifyBody = [
            `当前: ¥${stats.current}`,
            `最低: ¥${stats.lowest} (${stats.lowDate})`,
            `最高: ¥${stats.highest}`,
            stats.isLow ? "⚡ 建议入手" : `比最低高${stats.diff}%`
        ].join("\n");
        $.notify(notifyTitle, notifyBody);
        
        // 7. 注入页面
        let responseBody = $response.body || "";
        if (responseBody.includes("</body>")) {
            responseBody = responseBody.replace("</body>", html + "</body>");
        } else {
            responseBody += html;
        }
        
        console.log("注入完成");
        $.done({ body: responseBody });
        
    } catch (e) {
        console.log("错误:", e.message);
        $.done({});
    }
})();

// ==================== 提取SKU ====================

function extractSku(url, body) {
    // 从URL参数提取
    let m = url.match(/sku[=:](\d+)/i);
    if (m) return m[1];
    
    m = url.match(/wareId[=:](\d+)/i);
    if (m) return m[1];
    
    m = url.match(/productId[=:](\d+)/i);
    if (m) return m[1];
    
    // 从请求体提取
    if (body) {
        try {
            const json = JSON.parse(body);
            if (json.skuId) return String(json.skuId);
            if (json.wareId) return String(json.wareId);
            if (json.sku) return String(json.sku);
            if (json.productId) return String(json.productId);
        } catch(e) {
            m = body.match(/skuId[=:](\d+)/i);
            if (m) return m[1];
            
            m = body.match(/wareId[=:](\d+)/i);
            if (m) return m[1];
        }
    }
    
    return null;
}

// ==================== 获取价格 ====================

async function fetchPrice(skuId) {
    const apiUrl = "https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx";
    const fullUrl = `${apiUrl}?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html`;
    
    try {
        const resp = await httpGet(fullUrl);
        const data = JSON.parse(resp);
        
        // 适配不同数据格式
        if (data.data && Array.isArray(data.data)) {
            return data.data;
        }
        if (data.trend && Array.isArray(data.trend)) {
            return data.trend;
        }
        
        return null;
    } catch(e) {
        console.log("请求失败:", e.message);
        return null;
    }
}

// ==================== 计算统计 ====================

function calcStats(data) {
    const prices = data.map(i => i.price).filter(p => p > 0);
    if (prices.length === 0) {
        return { current: 0, lowest: 0, highest: 0, avg: 0, diff: "0", isLow: false, lowDate: "" };
    }
    
    const current = prices[0];
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const diff = ((current - lowest) / lowest * 100).toFixed(1);
    const isLow = parseFloat(diff) < 5;
    
    // 最低价日期
    const lowIdx = prices.indexOf(lowest);
    const lowTs = data[lowIdx] ? data[lowIdx].date : 0;
    const lowDate = lowTs ? fmtDate(lowTs) : "";
    
    return { current, lowest, highest, avg, diff, isLow, lowDate, prices, data };
}

function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ==================== 构建HTML ====================

function buildHtml(stats, skuId) {
    const { current, lowest, highest, avg, diff, isLow, lowDate } = stats;
    const color = isLow ? "#4CAF50" : "#FF9800";
    const label = isLow ? "🔥 历史低价" : "📊 价格正常";
    
    return `
<div id="jq-ph" style="position:fixed;bottom:90px;left:10px;right:10px;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:16px;border-radius:16px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:jq-fadein .3s">
<style>@keyframes jq-fadein{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.1)">
<span style="font-size:16px;font-weight:600">📋 历史价格</span>
<button onclick="this.closest('#jq-ph').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:18px;cursor:pointer">×</button>
</div>
<div style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;background:${color}20;color:${color};margin-bottom:10px">${label}</div>
<div style="font-size:32px;font-weight:700;color:#e74c3c;margin-bottom:12px"><span style="font-size:18px">¥</span>${current}</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
<div style="background:rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,.5)">历史最低</div>
<div style="font-size:14px;font-weight:600;color:#4CAF50;margin:4px 0">¥${lowest}</div>
<div style="font-size:10px;color:rgba(255,255,255,.4)">${lowDate}</div>
</div>
<div style="background:rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,.5)">历史最高</div>
<div style="font-size:14px;font-weight:600;color:#e74c3c;margin:4px 0">¥${highest}</div>
</div>
<div style="background:rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,.5)">平均价格</div>
<div style="font-size:14px;font-weight:600;margin:4px 0">¥${avg}</div>
</div>
</div>
<div style="background:${isLow ? 'rgba(76,175,80,.15)' : 'rgba(255,152,0,.15)'};border-radius:8px;padding:8px;text-align:center;font-size:13px">
${isLow ? '⚡ 当前接近历史最低价，建议入手' : `当前比历史最低高 <b style="color:${color}">${diff}%</b>`}
</div>
</div>`;
}

// ==================== HTTP请求 ====================

function httpGet(url) {
    return new Promise((resolve, reject) => {
        $httpClient.get({
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
                'Referer': 'https://apapia-history.manmanbuy.com/'
            }
        }, (err, resp, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

// ==================== Env类 ====================

function Env(name) {
    this.name = name;
    this.request = typeof $request !== "undefined" ? $request : {};
    this.response = typeof $response !== "undefined" ? $response : {};
    this.notify = (t, s, b) => {
        if (typeof $notify !== "undefined") $notify(t, s, b);
    };
    this.log = console.log;
    this.done = (v) => {
        if (typeof $done !== "undefined") $done(v || {});
    };
}
