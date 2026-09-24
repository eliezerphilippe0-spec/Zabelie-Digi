/**
 * Export all Storage buckets to a NEW private directory; restore only to loopback.
 * Database dumps are separate: see docs/operations-haiti.md.
 * Usage: node scripts/storage-recovery.mjs export|verify|restore-local DIRECTORY
 * SOURCE_SUPABASE_URL/SOURCE_SERVICE_ROLE_KEY for export.
 * TARGET_SUPABASE_URL/TARGET_SERVICE_ROLE_KEY for isolated local restore.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const hash = b => createHash("sha256").update(b).digest("hex");
const fail = () => { throw new Error("Storage recovery check failed; no successful recovery certified."); };
const check = r => { if (r.error || r.data == null) fail(); return r.data; };
export function localTarget(value) {
 const u=new URL(value);
 if(u.protocol!=="http:" || !["localhost","127.0.0.1","[::1]"].includes(u.hostname) || u.username || u.password || u.pathname!=="/") throw Error("Restore requires an isolated loopback Supabase URL.");
 return u.origin;
}
export async function exportStorage(client, directory, source) {
 const dir=resolve(directory);await mkdir(dir,{mode:0o700});await mkdir(join(dir,"objects"),{mode:0o700});
 const manifest={version:1,source:new URL(source).origin,startedAt:new Date().toISOString(),buckets:[],objects:[]};
 const buckets=check(await client.storage.listBuckets());let bytes=0;
 for(const bucket of buckets) {
  manifest.buckets.push({id:bucket.id,name:bucket.name,public:bucket.public,fileSizeLimit:bucket.file_size_limit,allowedMimeTypes:bucket.allowed_mime_types});
  const folders=[""];const seen=new Set();
  while(folders.length) {
   const folder=folders.pop();if(seen.has(folder)) fail();seen.add(folder);
   for(let offset=0;;offset+=100){
    const rows=check(await client.storage.from(bucket.id).list(folder,{limit:100,offset,sortBy:{column:"name",order:"asc"}}));
    for(const row of rows){
     if(typeof row.name!=="string" || row.name.includes("/") || row.name==="." || row.name==="..") fail();
     const path=folder?folder+"/"+row.name:row.name;
     if(!row.id){folders.push(path);continue;}
     const data=check(await client.storage.from(bucket.id).download(path));const buffer=Buffer.from(await data.arrayBuffer());
     bytes+=buffer.length;if(bytes>10*1024**3 || manifest.objects.length>=100000) throw Error("Export exceeds the documented 10 GiB / 100000 object safety limit.");
     const sha256=hash(buffer);const file=hash(bucket.id+"\0"+path);
     await writeFile(join(dir,"objects",file),buffer,{flag:"wx",mode:0o600});
     manifest.objects.push({bucket:bucket.id,path,file,sha256,size:buffer.length,contentType:data.type||"application/octet-stream"});
    }
    if(rows.length<100)break;
   }
  }
 }
 manifest.completedAt=new Date().toISOString();
 // The manifest exists only after every object has been exported successfully.
 await writeFile(join(dir,"manifest.json"),JSON.stringify(manifest,null,2),{flag:"wx",mode:0o600});
 return {buckets:manifest.buckets.length,objects:manifest.objects.length,bytes};
}
export async function verifyStorage(directory) {
 const dir=resolve(directory);
 const manifest=JSON.parse(await readFile(join(dir,"manifest.json"),"utf8"));
 if(manifest.version!==1 || !manifest.completedAt || !Array.isArray(manifest.buckets)||!Array.isArray(manifest.objects)) fail();
 const buckets=new Set(manifest.buckets.map(b=>b.id));const keys=new Set();
 if(buckets.size!==manifest.buckets.length)fail();
 for(const o of manifest.objects){
  if(typeof o.bucket!=="string" || typeof o.path!=="string" || !buckets.has(o.bucket) || !/^[a-f0-9]{64}$/.test(o.file) || o.file!==hash(o.bucket+"\0"+o.path)) fail();
  const key=o.bucket+"\0"+o.path;if(keys.has(key))fail();keys.add(key);
  const p=join(dir,"objects",o.file);const stat=await lstat(p);if(!stat.isFile()||stat.isSymbolicLink())fail();
  const data=await readFile(p);if(data.length!==o.size||hash(data)!==o.sha256)fail();
 }
 return manifest;
}
export async function restoreStorage(client,directory,target) {
 const destination=localTarget(target);
 const m=await verifyStorage(directory);
 if(new URL(m.source).origin===destination) throw Error("Source and restore target must differ.");
 // No overwrites: an isolated target must not already contain these buckets.
 const existing=check(await client.storage.listBuckets());
 if(existing.some(b=>m.buckets.some(saved=>saved.id===b.id))) throw Error("Target buckets already exist; restore refused.");
 for(const b of m.buckets)check(await client.storage.createBucket(b.id,{public:b.public,fileSizeLimit:b.fileSizeLimit,allowedMimeTypes:b.allowedMimeTypes}));
 for(const o of m.objects){
  const body=await readFile(join(resolve(directory),"objects",o.file));
  check(await client.storage.from(o.bucket).upload(o.path,body,{contentType:o.contentType,upsert:false}));
  const restored=check(await client.storage.from(o.bucket).download(o.path));
  if(hash(Buffer.from(await restored.arrayBuffer()))!==o.sha256)fail();
 }
 return {buckets:m.buckets.length,objects:m.objects.length,verifiedDownloads:m.objects.length};
}
async function main(){
 const [mode,dir]=process.argv.slice(2);if(!dir||!["export","verify","restore-local"].includes(mode))throw Error("Usage: storage-recovery.mjs export|verify|restore-local DIRECTORY");
 if(mode==="verify"){const m=await verifyStorage(dir);return {verifiedObjects:m.objects.length};}
 const prefix=mode==="export"?"SOURCE":"TARGET";const url=process.env[prefix+"_SUPABASE_URL"],key=process.env[prefix+"_SERVICE_ROLE_KEY"];
 if(!url||!key)throw Error(prefix+" Supabase environment missing.");
 if(mode==="restore-local")localTarget(url);
 const {createClient}=await import("@supabase/supabase-js");const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(60000)})}});
 return mode==="export"?exportStorage(client,dir,url):restoreStorage(client,dir,url);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().then(result=>console.log(JSON.stringify({ok:true,...result}))).catch(()=>{console.error("Recovery failed. Inspect the isolated environment; no secrets or object names are printed.");process.exitCode=1;});
}
