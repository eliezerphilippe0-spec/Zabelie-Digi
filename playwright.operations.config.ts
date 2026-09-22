import {defineConfig,devices} from "@playwright/test";
import {join} from "node:path";
import {tmpdir} from "node:os";
const stub="http://127.0.0.1:54329";
const port=process.env.OPERATIONS_APP_PORT||"3009";
const app="http://127.0.0.1:"+port;
const reuse=process.env.OPERATIONS_REUSE==="true";
export default defineConfig({
 testDir:"./e2e-operations",workers:1,retries:0,reporter:"list",outputDir:join(tmpdir(),"zabelie-operations-results"),
 use:{...devices["Desktop Chrome"],baseURL:app,trace:"retain-on-failure",
 launchOptions:process.env.PW_CHROMIUM_PATH?{executablePath:process.env.PW_CHROMIUM_PATH}:undefined},
 webServer:[
 {command:"node e2e/fixtures/stub-operations.mjs",url:stub+"/__health",reuseExistingServer:reuse,env:{STUB_PORT:"54329",APP_PORT:port}},
 {command:"npm run start",url:app,reuseExistingServer:reuse,timeout:120000,env:{NEXT_PUBLIC_SUPABASE_URL:stub,NEXT_PUBLIC_SUPABASE_ANON_KEY:"cle-anon-de-test",SUPABASE_SERVICE_ROLE_KEY:"cle-service-de-test",PORT:port,MONCASH_MODE:"sandbox"}},
 ],
});
