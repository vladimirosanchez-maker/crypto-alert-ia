const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const mimeTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript" };

http.createServer((request, response) => {
  const pathname = request.url === "/" ? "/index.html" : decodeURIComponent(request.url.split("?")[0]);
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404); response.end("Not found"); return; }
    response.writeHead(200, { "Content-Type": `${mimeTypes[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    response.end(content);
  });
}).listen(4173, "127.0.0.1");
