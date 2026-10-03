import {readFileSync,writeFileSync} from 'node:fs';
const {D1_ID,KV_ID,PUBLIC_URL,REVIEWED_SHA}=process.env;
if(!D1_ID||!KV_ID||!PUBLIC_URL||!REVIEWED_SHA)throw Error('Provisioned D1, OAuth KV, public URL and reviewed SHA required');
if(!/^[a-f0-9]{40}$/.test(REVIEWED_SHA)||new URL(PUBLIC_URL).protocol!=='https:')throw Error('Invalid reviewed SHA or public URL');
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
config.vars.PUBLIC_URL=PUBLIC_URL;config.vars.REVIEWED_SHA=REVIEWED_SHA;
config.d1_databases=[{binding:'DB',database_name:'mobile-work-gateway',database_id:D1_ID,migrations_dir:'migrations'}];
config.kv_namespaces=[{binding:'OAUTH_KV',id:KV_ID}];
writeFileSync('wrangler.deploy.json',JSON.stringify(config,null,2));
