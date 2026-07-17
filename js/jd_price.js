/**
 * 京东商品页面历史价格显示 - QuantumultX 脚本
 * 拦截京东商品详情 API，在页面注入历史价格信息
 */

const url = $request.url;
const body = $response.body;

console.log("========== 京东比价脚本触发 ==========");
console.log("URL: " + url);

// ========== 1. 禁用 HTTPDNS ==========
try {
    if (url.indexOf("serverConfig") != -1) {
        console.log("[serverConfig] 匹配，禁用 httpdns");
        let obj = JSON.parse(body);
        delete obj.serverConfig.httpdns;
        delete obj.serverConfig.dnsvip;
        delete obj.serverConfig.dnsvip_v6;
        $done({ body: JSON.stringify(obj) });
    }
} catch (e) {
    console.log("[serverConfig] 异常: " + e.message);
    $done({ body });
}

try {
    if (url.indexOf("basicConfig") != -1) {
        console.log("[basicConfig] 匹配，禁用 httpdns");
        let obj = JSON.parse(body);
        let kit = obj.data && obj.data.JDHttpToolKit;
        if (kit) {
            delete kit.httpdns;
            delete kit.dnsvipV6;
        }
        $done({ body: JSON.stringify(obj) });
    }
} catch (e) {
    console.log("[basicConfig] 异常: " + e.message);
    $done({ body });
}

// ========== 2. 商品详情页 - 注入历史价格 ==========
if (url.indexOf("wareBusiness") != -1) {
    console.log("[wareBusiness] 匹配，开始处理商品详情");
    try {
        const obj = JSON.parse(body);
        const floors = obj.floors;

        if (!floors || floors.length === 0) {
            console.log("[wareBusiness] floors 为空，跳过");
            $done({ body });
            return;
        }
        console.log("[wareBusiness] floors 数量: " + floors.length);

        // 尝试多个位置获取商品 URL
        let shareUrl = null;

        // 方法1: 从最后一个 floor 的 property 中获取
        try {
            const lastFloor = floors[floors.length - 1];
            if (lastFloor && lastFloor.data && lastFloor.data.property) {
                shareUrl = lastFloor.data.property.shareUrl;
                console.log("[wareBusiness] 方法1获取 shareUrl: " + shareUrl);
            }
        } catch (e) {
            console.log("[wareBusiness] 方法1异常: " + e.message);
        }

        // 方法2: 遍历所有 floor 查找
        if (!shareUrl) {
            console.log("[wareBusiness] 方法1失败，尝试遍历所有 floor");
            for (let i = floors.length - 1; i >= 0; i--) {
                try {
                    const f = floors[i];
                    if (f && f.data && f.data.property && f.data.property.shareUrl) {
                        shareUrl = f.data.property.shareUrl;
                        console.log("[wareBusiness] 方法2获取 shareUrl: " + shareUrl);
                        break;
                    }
                } catch (e) {}
            }
        }

        if (!shareUrl) {
            console.log("[wareBusiness] 未找到 shareUrl，跳过");
            $done({ body });
            return;
        }

        console.log("[wareBusiness] shareUrl: " + shareUrl);
        console.log("[wareBusiness] 开始请求价格 API...");

        // 调用价格查询 API
        fetchPriceHistory(shareUrl, function (data) {
            if (!data) {
                console.log("[wareBusiness] API 返回 null，跳过");
                $done({ body });
                return;
            }

            console.log("[wareBusiness] API 返回 ok=" + data.ok);
            if (data.msg) {
                console.log("[wareBusiness] API msg: " + data.msg);
            }

            try {
                const lowerword = buildAdword();
                lowerword.data.ad.textColor = "#fe0000";

                // 找插入位置
                let insertIdx = findInsertIndex(floors, lowerword);
                console.log("[wareBusiness] 插入位置: " + insertIdx);

                if (data.ok == 1 && data.single) {
                    const lower = formatLowerPrice(data.single);
                    const detail = formatPriceSummary(data);
                    const tip = (data.PriceRemark && data.PriceRemark.Tip ? data.PriceRemark.Tip : "") + "（仅供参考）";
                    lowerword.data.ad.adword = lower + " " + tip + "\n" + detail;
                    console.log("[wareBusiness] 注入内容: " + lowerword.data.ad.adword);
                    floors.splice(insertIdx, 0, lowerword);
                    $done({ body: JSON.stringify(obj) });
                } else if (data.ok == 0 && data.msg) {
                    lowerword.data.ad.adword = data.msg;
                    console.log("[wareBusiness] 注入错误信息: " + data.msg);
                    floors.splice(insertIdx, 0, lowerword);
                    $done({ body: JSON.stringify(obj) });
                } else {
                    console.log("[wareBusiness] 数据格式异常，跳过注入");
                    $done({ body });
                }
            } catch (e) {
                console.log("[wareBusiness] 注入异常: " + e.message);
                $done({ body });
            }
        });

    } catch (e) {
        console.log("[wareBusiness] 解析异常: " + e.message);
        $done({ body });
    }
}

// ========== 工具函数 ==========

function fetchPriceHistory(shareUrl, callback) {
    const opts = {
        url: "https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
            "Referer": "https://tool.manmanbuy.com/",
            "Origin": "https://tool.manmanbuy.com"
        },
        body: "methodName=getHistoryTrend&p_url=" + encodeURIComponent(shareUrl)
    };

    console.log("[API] 请求价格接口...");
    $task.fetch(opts).then(function (resp) {
        console.log("[API] 响应状态码: " + resp.statusCode);
        console.log("[API] 响应内容: " + (resp.body ? resp.body.substring(0, 200) : "空"));
        try {
            callback(JSON.parse(resp.body));
        } catch (e) {
            console.log("[API] JSON 解析失败: " + e.message);
            callback(null);
        }
    }, function (err) {
        console.log("[API] 请求失败: " + JSON.stringify(err));
        callback(null);
    });
}

function findInsertIndex(floors, lowerword) {
    let idx = 0;
    for (let i = 0; i < floors.length; i++) {
        const el = floors[i];
        if (el.mId == lowerword.mId) {
            idx = i + 1;
            break;
        } else if (el.sortId > lowerword.sortId) {
            idx = i;
            break;
        }
    }
    return idx;
}

function formatLowerPrice(single) {
    const price = single.lowerPriceyh;
    const date = formatJsonDate(single.lowerDateyh);
    return "历史最低价：¥" + String(price) + " (" + date + ")";
}

function formatPriceSummary(data) {
    let result = "";
    let listItems = data.PriceRemark && data.PriceRemark.ListPriceDetail
        ? data.PriceRemark.ListPriceDetail.slice(0, 4)
        : [];
    let allItems = listItems.concat(calcPeriodLows(data.single));

    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        if (item.Name == "双11价格") item.Name = "双十一价格";
        else if (item.Name == "618价格") item.Name = "六一八价格";
        result += "\n" + item.Name + pad(8) + item.Price + pad(8) + item.Date + pad(8) + item.Difference;
    }
    return result;
}

function calcPeriodLows(single) {
    const pattern = /\[.*?\]/g;
    const extract = /\[(.*),(.*),"(.*)".*\]/;
    let current, low30, low90, low180, low360;
    let matches = single.jiagequshiyh.match(pattern);
    if (!matches) return [];

    matches = matches.reverse().slice(0, 360);
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (m.length == 0) continue;
        const r = extract.exec(m);
        if (!r) continue;
        const dt = fmtDate(new Date(parseInt(r[1])));
        const p = parseFloat(r[2]);

        if (i == 0) {
            current = p;
            low30  = { Name: "三十天最低", Price: "¥" + p, Date: dt, Difference: calcDiff(current, p), price: p };
            low90  = { Name: "九十天最低", Price: "¥" + p, Date: dt, Difference: calcDiff(current, p), price: p };
            low180 = { Name: "一百八最低", Price: "¥" + p, Date: dt, Difference: calcDiff(current, p), price: p };
            low360 = { Name: "三百六最低", Price: "¥" + p, Date: dt, Difference: calcDiff(current, p), price: p };
        }
        if (i < 30  && p < low30.price)  { low30.price = p;  low30.Price = "¥" + p;  low30.Date = dt;  low30.Difference = calcDiff(current, p); }
        if (i < 90  && p < low90.price)  { low90.price = p;  low90.Price = "¥" + p;  low90.Date = dt;  low90.Difference = calcDiff(current, p); }
        if (i < 180 && p < low180.price) { low180.price = p; low180.Price = "¥" + p; low180.Date = dt; low180.Difference = calcDiff(current, p); }
        if (i < 360 && p < low360.price) { low360.price = p; low360.Price = "¥" + p; low360.Date = dt; low360.Difference = calcDiff(current, p); }
    }
    return [low30, low90, low180, low360];
}

function calcDiff(cur, low) {
    const d = floatSub(cur, low);
    if (d == 0) return "-";
    return (d > 0 ? "↑" : "↓") + String(Math.abs(d));
}

function floatSub(a, b) {
    return floatAdd(a, -Number(b));
}

function floatAdd(a, b) {
    a = a.toString(); b = b.toString();
    var A = a.split("."), B = b.split(".");
    var d1 = A.length == 2 ? A[1] : "", d2 = B.length == 2 ? B[1] : "";
    var max = Math.max(d1.length, d2.length);
    var m = Math.pow(10, max);
    return Number(((a * m + b * m) / m).toFixed(max));
}

function formatJsonDate(val) {
    if (!val) return "未知";
    const d = new Date(parseInt(val.replace("/Date(", "").replace(")/", ""), 10));
    const M = d.getMonth() + 1 < 10 ? "0" + (d.getMonth() + 1) : d.getMonth() + 1;
    const D = d.getDate() < 10 ? "0" + d.getDate() : d.getDate();
    return d.getFullYear() + "-" + M + "-" + D;
}

function fmtDate(d) {
    const M = d.getMonth() + 1 < 10 ? "0" + (d.getMonth() + 1) : d.getMonth() + 1;
    const D = d.getDate() < 10 ? "0" + d.getDate() : d.getDate();
    return d.getFullYear() + "-" + M + "-" + D;
}

function pad(n) {
    let s = "";
    for (let i = 0; i < n; i++) s += " ";
    return s;
}

function buildAdword() {
    return {
        "bId": "eCustom_flo_199",
        "cf": { "bgc": "#ffffff", "spl": "empty" },
        "data": {
            "ad": {
                "adword": "",
                "textColor": "#8C8C8C",
                "color": "#f23030",
                "newALContent": true,
                "hasFold": true,
                "class": "com.jd.app.server.warecoresoa.domain.AdWordInfo.AdWordInfo",
                "adLinkContent": "",
                "adLink": ""
            }
        },
        "mId": "bpAdword",
        "refId": "eAdword_0000000028",
        "sortId": 13
    };
}
