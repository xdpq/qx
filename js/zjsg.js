var body = $response.body; 
var obj = JSON.parse(body); 

obj.data.VIP = 1,

body = JSON.stringify(obj);
$done({body});
