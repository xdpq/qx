/**
 * 调试版 - 显示完整的请求信息
 */

const $ = new Env("京东调试");

(async () => {
    const url = $request.url;
    const body = $request.body || "";
    
    // 显示完整信息
    let info = "=== URL ===\n" + url + "\n\n=== Body ===\n" + body.substring(0, 800);
    
    // 尝试找所有数字ID
    const ids = [];
    
    // 从URL找
    const urlNums = url.match(/\d{5,}/g);
    if (urlNums) ids.push(...urlNums.map(n => "URL: " + n));
    
    // 从body找
    const bodyNums = body.match(/\d{5,}/g);
    if (bodyNums) ids.push(...bodyNums.map(n => "Body: " + n));
    
    // 尝试JSON解析
    let jsonData = "";
    try {
        const json = JSON.parse(body);
        jsonData = "\n\n=== JSON Keys ===\n" + Object.keys(json).join(", ");
        
        // 查找可能的SKU字段
        for (const key of Object.keys(json)) {
            if (key.toLowerCase().includes("sku") || 
                key.toLowerCase().includes("ware") || 
                key.toLowerCase().includes("product") ||
                key.toLowerCase().includes("id")) {
                jsonData += `\n${key}: ${json[key]}`;
            }
        }
    } catch(e) {
        jsonData = "\n\n=== 非JSON格式 ===";
    }
    
    let msg = info + jsonData + "\n\n=== 找到的ID ===\n" + ids.join("\n");
    
    // 通知显示
    $.notify("京东调试", msg.substring(0, 1000));
    
    console.log(msg);
    $.done({});
})();

function Env(n){
    this.name=n;
    this.request=typeof $request!=="undefined"?$request:{};
    this.response=typeof $response!=="undefined"?$response:{};
    this.notify=(t,s,b)=>{if(typeof $notify!=="undefined")$notify(t,s,b||"")};
    this.done=v=>{if(typeof $done!=="undefined")$done(v||{})};
}
