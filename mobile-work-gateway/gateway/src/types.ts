export interface Env {DB:D1Database;OAUTH_KV:KVNamespace;OAUTH_PROVIDER:any;GITHUB_TOKEN?:string;GITHUB_APP_ID?:string;GITHUB_APP_INSTALLATION_ID?:string;GITHUB_APP_PRIVATE_KEY?:string;GITHUB_CLIENT_ID:string;GITHUB_CLIENT_SECRET:string;OWNER_ID:string;REPOSITORY:string;REPOSITORY_ID:string;WORKFLOW:string;REVIEWED_REF:string;REVIEWED_SHA:string;PUBLIC_URL:string;BROWSER?:Fetcher;BROWSER_PROFILE_KEY?:string;POWER_CAD_FREE_DXF_ENABLED?:string;ORCH_LEDGER_ENABLED?:string;ORCH_DB?:D1Database;REA_BRIDGE_ENABLED?:string;REA_BRIDGE?:Fetcher;REA_BRIDGE_TOKEN?:string;}
export interface Task{task_id:string;owner_id:string;request_key:string;digest:string;task_type:string;ref:string;sha:string;dispatch_state:string;run_id:string|null;created_at:number;}


