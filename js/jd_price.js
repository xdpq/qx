/**
 * 调试版 - 显示所有JD API请求的详细信息
 */

const $ = new Env("JD调试");

(async () => {
    const url = $request.url;
    const body = $request.body || "";
    
    // 提取functionId
    const funcMatch = url.match(/functionId=([^&]+)/);
    const funcId = funcMatch ? funcMatch[1] : "未知";
    
    // 找所有数字
    const allNums = (url + body).match(/\d{6,}/g) || [];
    
    let info = [
        `函数: ${funcId}`,
        ``,
        `URL完整:`,
        url,
        ``,
        `Body完整:`,
        body || "(空)",
        ``,
        `找到的数字ID:`,
        ...allNums.slice(0, 15)
    ].join("\n");
    
    console.log("========== JD API ==========");
    console.log(info);
    console.log("============================");
    
    // 只在可能是商品时弹通知
    if (allNums.some(n => n.length >= 8 && n.length <= 12)) {
        $.notify("找到长数字ID", info.substring(0, 800));
    }
    
    $.done({});
})();

function Env(n){
    this.name=n;
    this.request=typeof $request!=="undefined"?$request:{};
    this.response=typeof $response!=="undefined"?$response:{};
    this.notify=(t,s,b)=>{if(typeof $notify!=="undefined")$notify(t,s,b||"")};
    this.done=v=>{if(typeof $done!=="undefined")$done(v||{})};
}
