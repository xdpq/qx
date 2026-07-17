/**
 * 测试脚本 - 验证QX是否能加载脚本
 * 
 * 这个脚本只做一件事：显示通知
 * 如果能看到通知，说明QX配置正确
 */

const title = "QX脚本测试";
const body = "如果你看到这条通知，说明脚本已成功加载！\n时间: " + new Date().toLocaleString();

if (typeof $notify !== "undefined") {
    $notify(title, "", body);
} else {
    console.log(title + ": " + body);
}

$done({});
