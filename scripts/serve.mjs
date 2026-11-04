import {createServer} from "node:http";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
export async function serve(root,port=0){
 const types={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".json":"application/json",".css":"text/css",".woff":"font/woff",".png":"image/png",".wasm":"application/wasm"};
 const server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
   if(pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403).end();return;}
   let file=path.resolve(root,"."+pathname);
   if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
   if((await stat(file)).isDirectory())file=path.join(file,"index.html");
   res.writeHead(200,{"content-type":types[path.extname(file)]??"application/octet-stream"});
   createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end("Not found");}
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});
 return {server,origin:"http://127.0.0.1:"+server.address().port};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
 const {origin}=await serve(root,Number(process.env.PORT??8080));
 console.log(origin+"/examples/"+(root.endsWith("lattice")?"graph":"chat-panel")+"/");
}
