/**
 * Quantumult X - 京东商品历史价格显示
 * 
 * 匹配: wareBusiness / serverConfig / basicConfig
 */

const $ = new Env("京东历史价格");

const API = "https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx";

(async () => {
    try {
        const url = $request.url;
        const body = $request.body || "";
        
        // 提取 functionId
        const funcMatch = url.match(/functionId=([^&]+)/);
        const funcId = funcMatch ? funcMatch[1] : "";
        console.log("functionId:", funcId);
        
        // 只处理商品相关请求
        if (!["wareBusiness", "serverConfig", "basicConfig"].includes(funcId)) {
            console.log("非商品请求，跳过");
            $.done({});
            return;
        }
        
        // 提取SKU
        const skuId = extractSku(url, body);
        console.log("SKU:", skuId);
        
        if (!skuId) {
            console.log("未找到SKU，跳过");
            $.done({});
            return;
        }
        
        // 查询历史价格
        const priceData = await fetchPrice(skuId);
        
        if (!priceData || priceData.length === 0) {
            console.log("无价格数据");
            $.done({});
            return;
        }
        
        // 计算统计
        const prices = priceData.map(i => i.price).filter(p => p > 0);
        if (prices.length === 0) {
            $.done({});
            return;
        }
        
        const current = prices[0];
        const lowest = Math.min(...prices);
        const highest = Math.max(...prices);
        const avg = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
        const diff = ((current - lowest) / lowest * 100).toFixed(1);
        const isLow = parseFloat(diff) < 5;
        
        const lowIdx = prices.indexOf(lowest);
        const lowDate = priceData[lowIdx] ? fmtDate(priceData[lowIdx].date) : "";
        
        // 发送通知
        const title = isLow ? "🔥 历史低价" : "📊 京东价格";
        const msg = [
            `当前: ¥${current}`,
            `最低: ¥${lowest} (${lowDate})`,
            `最高: ¥${highest}`,
            `均价: ¥${avg}`,
            "",
            isLow ? "⚡ 建议入手！" : `比最低高 ${diff}%`
        ].join("\n");
        
        $.notify(title, msg);
        
        // 注入页面（如果响应是HTML）
        let responseBody = $response.body || "";
        if (responseBody.includes("</body>")) {
            const html = buildHtml(current, lowest, highest, avg, diff, isLow, lowDate);
            responseBody = responseBody.replace("</body>", html + "</body>");
            $.done({ body: responseBody });
        } else {
            $.done({});
        }
        
    } catch(e) {
        console.log("错误:", e.message);
        $.done({});
    }
})();

// ==================== 提取SKU ====================

function extractSku(url, body) {
    // URL参数
    let m = url.match(/sku[=:](\d+)/i);
    if (m) return m[1];
    
    m = url.match(/wareId[=:](\d+)/i);
    if (m) return m[1];
    
    m = url.match(/productId[=:](\d+)/i);
    if (m) return m[1];
    
    // 从URL中提取长数字（可能是SKU）
    m = url.match(/[?&]\w+=(\d{8,})/);
    if (m) return m[1];
    
    // body
    if (body) {
        try {
            const json = JSON.parse(body);
            if (json.skuId) return String(json.skuId);
            if (json.wareId) return String(json.wareId);
            if (json.sku) return String(json.sku);
            if (json.productId) return String(json.productId);
            
            // 遍历所有字段找数字ID
            for (const key of Object.keys(json)) {
                if (typeof json[key] === 'string' && /^\d{8,}$/.test(json[key])) {
                    return json[key];
                }
            }
        } catch(e) {
            m = body.match(/skuId[=:]["']?(\d+)/i);
            if (m) return m[1];
        }
    }
    
    return null;
}

// ==================== 获取价格 ====================

async function fetchPrice(skuId) {
    try {
        const url = `${API}?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html`;
        const resp = await httpGet(url);
        const data = JSON.parse(resp);
        return data.data || data.trend || [];
    } catch(e) {
        console.log("请求失败:", e.message);
        return [];
    }
}

// ==================== 工具函数 ====================

function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth()+1}月${d.getDate()}日`;
}

function httpGet(url) {
    return new Promise((r, j) => {
        $httpClient.get({
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
                'Referer': 'https://apapia-history.manmanbuy.com/'
            }
        }, (e, s, d) => e ? j(e) : r(d));
    });
}

function buildHtml(current, lowest, highest, avg, diff, isLow, lowDate) {
    const color = isLow ? "#4CAF50" : "#FF9800";
    const label = isLow ? "🔥 历史低价" : "📊 价格正常";
    
    return `
<div id="jq-ph" style="position:fixed;bottom:90px;left:10px;right:10px;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:16px;border-radius:16px;z-index:99999;font-family:-apple-system,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.1)">
<span style="font-size:16px;font-weight:600">📋 历史价格</span>
<button onclick="this.closest('#jq-ph').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:18px">×</button>
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
<div style="background:${isLow?'rgba(76,175,80,.15)':'rgba(255,152,0,.15)'};border-radius:8px;padding:8px;text-align:center;font-size:13px">
${isLow?'⚡ 建议入手！':'比最低价高 '+diff+'%'}
</div>
</div>`;
}

// ==================== Env ====================

function Env(n){
    this.name=n;
    this.request=typeof $request!=="undefined"?$request:{};
    this.response=typeof $response!=="undefined"?$response:{};
    this.notify=(t,s,b)=>{if(typeof $notify!=="undefined")$notify(t,s,b||"")};
    this.done=v=>{if(typeof $done!=="undefined")$done(v||{})};
}
