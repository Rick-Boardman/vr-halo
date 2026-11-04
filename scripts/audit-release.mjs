// Check the exact candidate files; findings print locations, never matched values.
import {execFileSync} from "node:child_process";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
const listed=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
const files=[...new Set(listed)].sort();const issues=[];let checked=0;
const rules=[
 ["private-key",/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
 ["credential",/(?:AKIA[A-Z0-9]{16}|github_pat_[A-Za-z0-9_]{30,}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{30,}|mat_[A-Za-z0-9_-]{25,})/],
 ["local-workspace",/(?:[A-Z]:\\(?:Users|projects)\\|nexus\/vr\/|nexus\/tools\/)/i],
 ["private-network",/https?:\/\/(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/],
 ["obsolete-proprietary",/\b(?:this is proprietary software|Halo is proprietary|no licence is granted|access to an artifact grants no rights)\b/i],
];
for(const file of files){
 let bytes;try{if(!(await stat(file)).isFile())continue;bytes=await readFile(file);}catch{continue;}
 checked++;
 if(/(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|.*\.(?:pem|key|token)$|credentials.*\.json$)/i.test(file)){issues.push(file+": forbidden configuration file");continue;}
 if(bytes.includes(0)||!/\.(?:js|mjs|json|md|txt|html|ya?ml)$/.test(file)&&!["LICENSE","NOTICE"].includes(file))continue;
 const source=bytes.toString("utf8");
 for(const [name,pattern]of rules)if(!(file==="scripts/audit-release.mjs"&&name==="obsolete-proprietary")&&pattern.test(source))issues.push(file+": "+name);
 if(file.endsWith(".md")){
  for(const match of source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)){
   const target=match[1];if(/^(?:[a-z]+:|#)/i.test(target))continue;
   const destination=path.resolve(path.dirname(file),decodeURIComponent(target.split("#")[0]));
   if(!destination.startsWith(process.cwd()+path.sep)){issues.push(file+": link escapes repository");continue;}
   try{await stat(destination);}catch{issues.push(file+": broken link "+target);}
  }
 }
}
const pkg=JSON.parse(await readFile("package.json","utf8"));
if(pkg.license!=="Apache-2.0")issues.push("package.json: license mismatch");
for(const file of ["LICENSE","NOTICE","THIRD_PARTY.md","CONTRIBUTING.md","SECURITY.md","AGENTS.md","docs/quick-start.md"]){try{await stat(file);}catch{issues.push(file+": missing");}}
if(!(await readFile("LICENSE","utf8")).includes("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"))issues.push("LICENSE: incomplete text");
if(issues.length){console.error(issues.join("\n"));process.exitCode=1;}
else console.log("PASS release candidate: "+checked+" files; credential patterns, private paths, local links, required release files");
