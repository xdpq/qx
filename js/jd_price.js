/**
 * 京东比价脚本 - 探测版
 * 捕获所有京东 API 请求，找出商品详情接口
 */

const url = $request.url;
const body = $response.body;

// 提取 functionId
const match = url.match(/functionId=([^&]+)/);
const functionId = match ? match[1] : "unknown";

console.log("========== 京东 API 请求 ==========");
console.log("functionId: " + functionId);
console.log("URL 完整: " + url);

// 尝试解析 body，看看有没有商品相关信息
try {
    const obj = JSON.parse(body);
    const keys = Object.keys(obj);
    console.log("响应顶层字段: " + keys.join(", "));

    // 检查是否有商品相关字段
    if (obj.floors) console.log(">>> 发现 floors 字段!");
    if (obj.wareInfo) console.log(">>> 发现 wareInfo 字段!");
    if (obj.productInfo) console.log(">>> 发现 productInfo 字段!");
    if (obj.itemInfo) console.log(">>> 发现 itemInfo 字段!");
    if (obj.skuId) console.log(">>> 发现 skuId 字段!");
    if (obj.shareUrl) console.log(">>> 发现 shareUrl 字段!");
    if (obj.data) {
        const dataKeys = Object.keys(obj.data);
        console.log("data 字段: " + dataKeys.join(", "));
        // 深入检查 data 下的商品字段
        for (const k of dataKeys) {
            if (typeof obj.data[k] === "object" && obj.data[k] !== null) {
                const subKeys = Object.keys(obj.data[k]);
                if (subKeys.length > 0) {
                    console.log("  data." + k + " 字段: " + subKeys.join(", "));
                }
            }
        }
    }
} catch (e) {
    console.log("解析失败或非 JSON: " + e.message);
}

console.log("========== 结束 ==========");

// 原始处理逻辑
try {
    if (url.indexOf("serverConfig") != -1) {
        let obj = JSON.parse(body);
        delete obj.serverConfig.httpdns;
        delete obj.serverConfig.dnsvip;
        delete obj.serverConfig.dnsvip_v6;
        $done({ body: JSON.stringify(obj) });
    }
} catch (e) { $done({ body }); }

try {
    if (url.indexOf("basicConfig") != -1) {
        let obj = JSON.parse(body);
        let kit = obj.data && obj.data.JDHttpToolKit;
        if (kit) { delete kit.httpdns; delete kit.dnsvipV6; }
        $done({ body: JSON.stringify(obj) });
    }
} catch (e) { $done({ body }); }

// 如果找到新接口，在这里添加处理逻辑
// TODO: 根据日志中的 functionId 和响应字段，确定新的商品详情接口

$done({ body });
