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
