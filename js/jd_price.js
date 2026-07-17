/**
 * 调试版2 - 捕获所有JD API请求
 */

const $ = new Env("JD调试");

(async () => {
    const url = $request.url;
    const body = $request.body || "";
    
    // 提取functionId
    const funcMatch = url.match(/functionId=([^&]+)/);
    const funcId = funcMatch ? funcMatch[1] : "未知";
    
    // 收集所有数字
    const allNums = (url + body).match(/\d{6,}/g) || [];
    
    let info = `函数: ${funcId}\n\n`;
    info += `URL:\n${url.substring(0, 300)}\n\n`;
    
    if (body) {
        info += `Body:\n${body.substring(0, 300)}\n\n`;
    }
    
    info += `可能的ID:\n${allNums.slice(0, 10).join("\n")}`;
    
    // 只在可能是商品请求时显示通知
    if (url.includes("wareId") || url.includes("skuId") || 
        body.includes("skuId") || body.includes("wareId") ||
        funcId.includes("ware") || funcId.includes("product") || 
        funcId.includes("sku") || funcId.includes("detail")) {
        $.notify("✅ 疑似商品请求", info.substring(0, 500));
    }
    
    // 始终输出到控制台
    console.log("=== JD API ===");
    console.log(info);
    
    $.done({});
})();

function Env(n){
    this.name=n;
    this.request=typeof $request!=="undefined"?$request:{};
    this.response=typeof $response!=="undefined"?$response:{};
    this.notify=(t,s,b)=>{if(typeof $notify!=="undefined")$notify(t,s,b||"")};
    this.done=v=>{if(typeof $done!=="undefined")$done(v||{})};
}
