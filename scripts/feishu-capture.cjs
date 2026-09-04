const http = require("http");
const fs = require("fs");
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    fs.writeFileSync(".data/feishu-capture.json", body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"code":0}');
  });
}).listen(9876, () => console.log("capture on 9876"));
