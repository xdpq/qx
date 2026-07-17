/**
 * Quantumult X - 京东商品历史价格显示脚本
 * 
 * 使用方法：
 * 1. 将此脚本放到 Quantumult X 脚本目录
 * 2. 添加 rewrite 规则（见配置文件）
 * 3. 开启 MITM 并信任证书
 * 
 * 注意：此脚本使用 script-response-body 模式
 */

// ==================== 京东历史价格 ====================

const $ = new Env("京东历史价格");

// ==================== 配置 ====================
const CONFIG = {
    enableNotification: true,
    api: "https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx"
};

// ==================== 工具函数 ====================

function extractSkuId(url) {
    const patterns = [
        /item\.m\.jd\.com\/product\/(\d+)/,
        /item\.jd\.com\/(\d+)/,
        /wareId=(\d+)/,
        /sku=(\d+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatPrice(price) {
    if (!price || price === 0) return "暂无";
    return `¥${price.toFixed(2)}`;
}

function calculateStats(priceData) {
    if (!priceData || priceData.length === 0) return null;
    
    const prices = priceData.map(item => item.price).filter(p => p > 0);
    if (prices.length === 0) return null;
    
    const current = prices[0];
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    const lowestIdx = prices.indexOf(lowest);
    const lowestDate = priceData[lowestIdx] ? formatDate(priceData[lowestIdx].date) : "未知";
    
    return {
        current, lowest, highest,
        avg: avg.toFixed(2),
        lowestDate,
        diff: ((current - lowest) / lowest * 100).toFixed(1)
    };
}

function generateTrend(priceData, days = 180) {
    if (!priceData || priceData.length === 0) return "暂无历史数据";
    
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = priceData.filter(i => i.date >= cutoff).sort((a, b) => b.date - a.date);
    
    if (recent.length === 0) return `近${days}天暂无记录`;
    
    const prices = recent.map(i => i.price).filter(p => p > 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const step = Math.max(1, Math.floor(recent.length / 7));
    const points = recent.filter((_, i) => i % step === 0).slice(0, 7);
    
    let trend = `📈 近${days}天走势\n`;
    trend += "━━━━━━━━━━━━━━━━━━━━━\n";
    
    points.forEach(p => {
        const date = formatDate(p.date);
        const price = formatPrice(p.price);
        const barLen = Math.round(((p.price - min) / range) * 12);
        const bar = "█".repeat(Math.max(1, barLen));
        trend += `${date} ${price} ${bar}\n`;
    });
    
    trend += "━━━━━━━━━━━━━━━━━━━━━";
    return trend;
}

// ==================== 构建注入HTML ====================

function buildHTML(stats, trend, skuId) {
    const isLowest = stats && parseFloat(stats.diff) < 5;
    const color = isLowest ? "#4CAF50" : "#FF9800";
    const label = isLowest ? "🔥 历史低价" : "📊 价格正常";
    
    return `<div id="jq-price-history" style="
position:fixed;bottom:90px;left:10px;right:10px;
max-height:55vh;overflow-y:auto;
background:linear-gradient(135deg,#1a1a2e,#16213e);
border-radius:16px;padding:16px;z-index:999999;
box-shadow:0 8px 32px rgba(0,0,0,.5);color:#fff;
font-family:-apple-system,sans-serif;
animation:jq-slide-up .3s ease-out">
<style>@keyframes jq-slide-up{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}</style>

<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:12px">
<span style="font-size:16px;font-weight:600">📋 历史价格</span>
<button onclick="this.closest('#jq-price-history').remove()" style="
width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);
border:none;color:#fff;font-size:18px;cursor:pointer">×</button>
</div>

<div style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;background:${color}20;color:${color};margin-bottom:12px">${label}</div>

${stats ? `
<div style="font-size:36px;font-weight:700;color:#e74c3c;margin:8px 0">
<span style="font-size:18px">¥</span>${stats.current.toFixed(0)}
</div>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0">
<div style="background:rgba(255,255,255,.08);border-radius:10px;padding:12px 8px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,.6)">历史最低</div>
<div style="font-size:14px;font-weight:600;color:#4CAF50">${formatPrice(stats.lowest)}</div>
<div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:2px">${stats.lowestDate}</div>
</div>
<div style="background:rgba(255,255,255,.08);border-radius:10px;padding:12px 8px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,.6)">历史最高</div>
<div style="font-size:14px;font-weight:600;color:#e74c3c">${formatPrice(stats.highest)}</div>
</div>
<div style="background:rgba(255,255,255,.08);border-radius:10px;padding:12px 8px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,.6)">平均价格</div>
<div style="font-size:14px;font-weight:600">${formatPrice(parseFloat(stats.avg))}</div>
</div>
</div>

<div style="background:${isLowest?'rgba(76,175,80,.15)':'rgba(255,152,0,.15)'};border-radius:8px;padding:10px;text-align:center;font-size:13px;margin-top:8px">
当前比历史最低 <b style="color:${color}">${stats.diff}%</b>
</div>

<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:12px;margin-top:12px;font-size:12px;line-height:1.8;white-space:pre-line;font-family:monospace">${trend}</div>
` : '<div style="text-align:center;padding:20px;color:rgba(255,255,255,.5)">暂无价格数据</div>'}

<div style="display:flex;gap:8px;margin-top:12px">
<button onclick="window.open('https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html')" style="flex:1;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;font-size:13px;font-weight:500">查看完整走势</button>
<button onclick="this.closest('#jq-price-history').remove()" style="flex:1;padding:10px;border-radius:10px;border:none;background:rgba(255,255,255,.1);color:#fff;font-size:13px">关闭</button>
</div>
</div>`;
}

// ==================== 主逻辑 ====================

(async () => {
    const url = $request.url;
    console.log("当前URL:", url);
    
    const skuId = extractSkuId(url);
    if (!skuId) {
        console.log("非京东商品页，跳过");
        $.done({});
        return;
    }
    
    console.log("商品SKU:", skuId);
    
    try {
        // 请求慢慢买API
        const apiUrl = `${CONFIG.api}?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html`;
        
        const resp = await $.http.get({
            url: apiUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://apapia-history.manmanbuy.com/'
            }
        });
        
        let data = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body;
        
        if (data && data.data && data.data.length > 0) {
            console.log(`获取到 ${data.data.length} 条价格记录`);
            
            const stats = calculateStats(data.data);
            const trend = generateTrend(data.data, 180);
            const html = buildHTML(stats, trend, skuId);
            
            // 通知
            if (CONFIG.enableNotification && stats) {
                const isLow = parseFloat(stats.diff) < 5;
                $.notify(
                    isLow ? "🔥 历史低价" : "📊 京东价格",
                    `当前${formatPrice(stats.current)}\n最低${formatPrice(stats.lowest)} (${stats.lowestDate})`
                );
            }
            
            // 修改响应体：注入HTML
            let body = $.response.body;
            if (body) {
                body = body.replace('</body>', html + '</body>');
            }
            
            $.done({ body: body });
        } else {
            console.log("未获取到价格数据");
            $.done({});
        }
        
    } catch (e) {
        console.log("请求失败:", e.message || e);
        $.done({});
    }
})();

// ==================== Env ====================
function Env(name) {
    this.name = name;
    this.request = typeof $request !== "undefined" ? $request : {};
    this.response = typeof $response !== "undefined" ? $response : {};
    this.notify = (t, s, b) => { if (typeof $notify !== "undefined") $notify(t, s, b); };
    this.http = {
        get: o => new Promise((r, j) => {
            $httpClient.get(o, (e, s, b) => e ? j(e) : r({ response: s, body: b }));
        }),
        post: o => new Promise((r, j) => {
            $httpClient.post(o, (e, s, b) => e ? j(e) : r({ response: s, body: b }));
        })
    };
    this.done = v => { if (typeof $done !== "undefined") $done(v || {}); };
}
