import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {exportStorage,verifyStorage,restoreStorage,localTarget} from "../scripts/storage-recovery.mjs";
function fake(buckets=["private"],files:Map<string,Buffer>=new Map([["private/a/file.txt",Buffer.from("private deliverable")]])){
 const calls:string[]=[];return {calls,files,storage:{
  listBuckets:async()=>({data:buckets.map(id=>({id,name:id,public:false})),error:null}),
  createBucket:async(id:string)=>{buckets.push(id);calls.push("bucket");return{data:{id},error:null};},
  from:(id:string)=>({
   list:async(folder:string)=>({data:folder?[{id:"object",name:"file.txt"}]:[{id:null,name:"a"}],error:null}),
   download:async(path:string)=>({data:files.has(id+"/"+path)?new Blob([new Uint8Array(files.get(id+"/"+path)!)]):null,error:null}),
   upload:async(path:string,b:Buffer,options:{upsert:boolean})=>{assert.equal(options.upsert,false);calls.push("upload");files.set(id+"/"+path,b);return{data:{path},error:null};},
  }),
 }};
}
test("private Storage export, verification and isolated restore preserve bytes",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const dir=join(root,"snapshot");const source=fake();await exportStorage(source,dir,"https://source.example");
 const target=fake([],new Map());const report=await restoreStorage(target,dir,"http://127.0.0.1:54321");
 assert.equal(report.verifiedDownloads,1);assert.deepEqual(target.files.get("private/a/file.txt"),Buffer.from("private deliverable"));
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"),/already exist/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("corrupted backup cannot perform any restore writes",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const dir=join(root,"snapshot");await exportStorage(fake(),dir,"https://source.example");const m=await verifyStorage(dir);
 await writeFile(join(dir,"objects",m.objects[0].file),"corrupted");const target=fake([],new Map());
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));assert.deepEqual(target.calls,[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("manifest traversal and duplicate object entries are refused",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const dir=join(root,"snapshot");await exportStorage(fake(),dir,"https://source.example");const file=join(dir,"manifest.json");const m=JSON.parse(await readFile(file,"utf8"));
 const original=m.objects[0].file;m.objects[0].file="../secrets";await writeFile(file,JSON.stringify(m));await assert.rejects(()=>verifyStorage(dir));
 m.objects[0].file=original;m.objects.push({...m.objects[0]});await writeFile(file,JSON.stringify(m));await assert.rejects(()=>verifyStorage(dir));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("restoration is refused for a remote, credentialed or ambiguous host",()=>{
 for(const u of ["https://production.supabase.co","http://127.0.0.1.evil","http://u:p@localhost:54321","http://localhost:54321/path"])assert.throws(()=>localTarget(u));
 assert.equal(localTarget("http://localhost:54321"),"http://localhost:54321");
});
type BucketOptions={public:boolean;fileSizeLimit?:number|null;allowedMimeTypes?:string[]|null};
type Failure="upload"|"upload-throws"|"download"|"hash"|"reset"|"create-throws"|"create-race"|"widen-throws";
function limitedTarget(failure?:Failure,failedBucket="private",globalLimit=1000){
 const settings=new Map<string,BucketOptions>();const files=new Map<string,Buffer>();
 const calls:{op:string;id:string;options?:BucketOptions}[]=[];
 const result=(data:unknown,error:unknown=null)=>({data,error});
 return {settings,files,calls,storage:{
  listBuckets:async()=>result([...settings.keys()].map(id=>({id}))),
  createBucket:async(id:string,options:BucketOptions)=>{
   calls.push({op:"create",id,options:{...options}});
   if(failure==="create-race"&&id===failedBucket){
    settings.set(id,{public:false,fileSizeLimit:3,allowedMimeTypes:["text/plain"]});return result(null,Error("already exists"));
   }
   if(settings.has(id)||(options.fileSizeLimit!=null&&options.fileSizeLimit>globalLimit))return result(null,Error("create refused"));
   settings.set(id,{...options});if(failure==="create-throws"&&id===failedBucket)throw Error("create response lost");return result({id});
  },
  updateBucket:async(id:string,options:BucketOptions)=>{
   assert.ok(settings.has(id));const widened=options.fileSizeLimit!=null&&options.fileSizeLimit>(settings.get(id)?.fileSizeLimit??Infinity);
   calls.push({op:widened?"widen":"reset",id,options:{...options}});
   if(options.fileSizeLimit!=null&&options.fileSizeLimit>globalLimit)return result(null,Error("global limit refused"));
   if(!widened&&failure==="reset"&&id===failedBucket)return result(null,Error("reset refused"));
   settings.set(id,{...options});if(widened&&failure==="widen-throws"&&id===failedBucket)throw Error("widen response lost");
   return result({message:"updated"});
  },
  from:(id:string)=>({
   upload:async(path:string,body:Buffer,options:{upsert:boolean;contentType:string})=>{
    assert.equal(options.upsert,false);calls.push({op:"upload",id});const bucket=settings.get(id)!;
    if(failure==="upload-throws"&&id===failedBucket)throw Error("upload interrupted");
    if(body.length>globalLimit||(bucket.fileSizeLimit!=null&&body.length>bucket.fileSizeLimit)||
       (bucket.allowedMimeTypes&&!bucket.allowedMimeTypes.includes(options.contentType))||
       (failure==="upload"&&id===failedBucket))return result(null,Error("upload refused"));
    assert.ok(!files.has(id+"/"+path));files.set(id+"/"+path,body);return result({path});
   },
   download:async(path:string)=>{
    calls.push({op:"download",id});if(failure==="download"&&id===failedBucket)return result(null,Error("download refused"));
    const body=failure==="hash"&&id===failedBucket?Buffer.from("wrong bytes"):files.get(id+"/"+path)!;
    return result(new Blob([new Uint8Array(body)]));
   },
  }),
 }};
}
async function historicalSnapshot(root:string,limits:(number|null)[]=[8]){
 const buckets=limits.map((_,i)=>i?"second":"private");
 const files=new Map(buckets.map(id=>[id+"/a/file.txt",Buffer.from("historical file data")]));
 const dir=join(root,"snapshot");await exportStorage(fake(buckets,files),dir,"https://source.example");
 const manifestFile=join(dir,"manifest.json");const m=JSON.parse(await readFile(manifestFile,"utf8"));
 m.buckets.forEach((b:BucketOptions,i:number)=>Object.assign(b,{public:true,fileSizeLimit:limits[i],allowedMimeTypes:["application/octet-stream"]}));
 await writeFile(manifestFile,JSON.stringify(m));return {dir,m,manifestFile,files};
}
test("historical objects larger than the saved bucket limit restore before the exact settings are reapplied",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir,files}=await historicalSnapshot(root);const target=limitedTarget();
 const report=await restoreStorage(target,dir,"http://127.0.0.1:54321");
 assert.deepEqual(report,{buckets:1,objects:1,verifiedDownloads:1});assert.deepEqual(target.files,files);
 assert.deepEqual(target.calls.map(c=>c.op),["create","widen","upload","download","reset"]);
 assert.deepEqual(target.calls[0].options,{public:true,fileSizeLimit:8,allowedMimeTypes:["application/octet-stream"]});
 assert.deepEqual(target.calls[1].options,{public:true,fileSizeLimit:20,allowedMimeTypes:["application/octet-stream"]});
 assert.deepEqual(target.settings.get("private"),{public:true,fileSizeLimit:8,allowedMimeTypes:["application/octet-stream"]});
 }finally{await rm(root,{recursive:true,force:true});}
});
for(const failure of ["upload","upload-throws","download","hash"] as const)test(`historical bucket settings are reapplied after ${failure} failure`,async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir}=await historicalSnapshot(root,[8,8]);const target=limitedTarget(failure,"second");
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));
 for(const id of ["private","second"])assert.deepEqual(target.settings.get(id),{public:true,fileSizeLimit:8,allowedMimeTypes:["application/octet-stream"]});
 assert.deepEqual(target.calls.filter(c=>c.op==="reset").map(c=>c.id),["private","second"]);
 assert.ok(target.calls.findIndex(c=>c.op==="reset"&&c.id==="private")<target.calls.findIndex(c=>c.op==="create"&&c.id==="second"));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("a failed limit reset cannot certify successful historical recovery",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir}=await historicalSnapshot(root);const target=limitedTarget("reset");
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));
 assert.deepEqual(target.calls.map(c=>c.op),["create","widen","upload","download","reset"]);
 assert.equal(target.settings.get("private")?.fileSizeLimit,20);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("historical restoration never raises the Storage server global file limit",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir}=await historicalSnapshot(root);const target=limitedTarget(undefined,"private",16);
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));
 assert.equal(target.settings.get("private")?.fileSizeLimit,8);assert.equal(target.files.size,0);
 assert.deepEqual(target.calls.map(c=>c.op),["create","widen","reset"]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("unlimited and sufficient bucket limits need no temporary update",async()=>{
 for(const limit of [null,20,30]){
  const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
  try{const {dir}=await historicalSnapshot(root,[limit]);const target=limitedTarget();
  await restoreStorage(target,dir,"http://127.0.0.1:54321");assert.equal(target.settings.get("private")?.fileSizeLimit,limit);
  assert.deepEqual(target.calls.map(c=>c.op),["create","upload","download"]);
  }finally{await rm(root,{recursive:true,force:true});}
 }
});
test("invalid saved bucket limits are refused before any target write",async()=>{
 for(const invalid of [-1,1.5,"8",Number.MAX_SAFE_INTEGER+1]){
  const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
  try{const {dir,m,manifestFile}=await historicalSnapshot(root,[30]);m.buckets[0].fileSizeLimit=invalid;await writeFile(manifestFile,JSON.stringify(m));
  const target=limitedTarget();await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));assert.deepEqual(target.calls,[]);
  }finally{await rm(root,{recursive:true,force:true});}
 }
});
test("a lost create response leaves only the original restrictions without an unconfirmed update",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir}=await historicalSnapshot(root);const target=limitedTarget("create-throws");
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));
 assert.deepEqual(target.calls.map(c=>c.op),["create"]);assert.equal(target.files.size,0);
 assert.deepEqual(target.settings.get("private"),{public:true,fileSizeLimit:8,allowedMimeTypes:["application/octet-stream"]});
 }finally{await rm(root,{recursive:true,force:true});}
});
test("a bucket created concurrently is never updated after create refuses it",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir}=await historicalSnapshot(root);const target=limitedTarget("create-race");
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));
 assert.deepEqual(target.calls.map(c=>c.op),["create"]);assert.equal(target.files.size,0);
 assert.deepEqual(target.settings.get("private"),{public:false,fileSizeLimit:3,allowedMimeTypes:["text/plain"]});
 }finally{await rm(root,{recursive:true,force:true});}
});
test("a lost widen response still reapplies the exact original restrictions",async()=>{
 const root=await mkdtemp(join(tmpdir(),"zabelie-recovery-"));
 try{const {dir}=await historicalSnapshot(root);const target=limitedTarget("widen-throws");
 await assert.rejects(()=>restoreStorage(target,dir,"http://127.0.0.1:54321"));
 assert.deepEqual(target.calls.map(c=>c.op),["create","widen","reset"]);assert.equal(target.files.size,0);
 assert.deepEqual(target.settings.get("private"),{public:true,fileSizeLimit:8,allowedMimeTypes:["application/octet-stream"]});
 }finally{await rm(root,{recursive:true,force:true});}
});
