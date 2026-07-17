/**
 * Quantumult X - 京东历史价格 (调试版)
 * 
 * 这个版本会通过通知显示调试信息，帮助定位问题
 */

const $ = new Env("京东历史价格调试");

(async () => {
    try {
        const url = $request ? $request.url : "";
        console.log("1. 当前URL:", url);
        
        // 提取SKU
        const skuMatch = url.match(/product\/(\d+)/) || url.match(/item\.jd\.com\/(\d+)/);
        const skuId = skuMatch ? skuMatch[1] : null;
        console.log("2. SKU:", skuId);
        
        if (!skuId) {
            $.notify("调试", "未检测到SKU\nURL: " + url);
            $.done({});
            return;
        }
        
        // 测试API请求
        const apiUrl = `https://apapia-history.manmanbuy.com/ChromeExtension/getHistoryTrend.ashx?methodName=getHistoryTrend&p_url=https://item.m.jd.com/product/${skuId}.html`;
        console.log("3. 请求API:", apiUrl);
        
        const resp = await $.http.get({
            url: apiUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
                'Referer': 'https://apapia-history.manmanbuy.com/'
            }
        });
        
        console.log("4. 响应状态:", resp.response ? resp.response.statusCode : "无");
        console.log("5. 响应长度:", resp.body ? resp.body.length : 0);
        
        // 解析数据
        let data;
        try {
            data = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body;
        } catch(e) {
            $.notify("调试", "JSON解析失败\n" + (resp.body || "").substring(0, 200));
            $.done({});
            return;
        }
        
        console.log("6. 数据结构:", JSON.stringify(data).substring(0, 500));
        
        // 检查数据
        if (data && data.data && data.data.length > 0) {
            const firstPrice = data.data[0].price;
            const count = data.data.length;
            $.notify("✅ 成功", `商品: ${skuId}\n价格记录: ${count}条\n最新价: ¥${firstPrice}`);
        } else if (data && data.trend && data.trend.length > 0) {
            // 另一种数据格式
            const count = data.trend.length;
            $.notify("✅ 成功(格式2)", `商品: ${skuId}\n价格记录: ${count}条`);
        } else {
            $.notify("⚠️ 无数据", `SKU: ${skuId}\n返回: ${JSON.stringify(data).substring(0, 300)}`);
        }
        
        $.done({});
        
    } catch (e) {
        console.log("错误:", e.message || e);
        $.notify("❌ 错误", e.message || String(e));
        $.done({});
    }
})();

function Env(name) {
    this.name = name;
    this.request = typeof $request !== "undefined" ? $request : {};
    this.response = typeof $response !== "undefined" ? $response : {};
    this.notify = (t, s, b) => { if (typeof $notify !== "undefined") $notify(t, s, b); };
    this.http = {
        get: o => new Promise((r, j) => {
            $httpClient.get(o, (e, s, b) => e ? j(e) : r({ response: s, body: b }));
        })
    };
    this.done = v => { if (typeof $done !== "undefined") $done(v || {}); };
}
