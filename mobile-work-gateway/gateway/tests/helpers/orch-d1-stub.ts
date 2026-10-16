export class FakeD1 {
  rows=new Map<string,{task_id:string;idempotency_key:string;request_sha256:string;status:'VALIDATED'|'REVIEW'}>();
  prepare(_query:string) {
    let values:unknown[]=[];
    const db=this;
    return {
      bind(...args:unknown[]) { values=args; return this; },
      async run() {
        const [task,owner,key,digest,,,status]=values as string[];
        const id=owner+':'+key;
        const exists=[...db.rows.values()].some(x=>x.task_id===task);
        if(db.rows.has(id)||exists)return {meta:{changes:0}};
        db.rows.set(id,{task_id:task,idempotency_key:key,request_sha256:digest,status:status as 'VALIDATED'|'REVIEW'});
        return {meta:{changes:1}};
      },
      async first<T>() {
        return (db.rows.get(values[0]+':'+values[1])??null) as T|null;
      }
    };
  }
}
export const owner='a'.repeat(64);
export const request={
  schema_version:'jev.orch.task/1',task_id:'task_20261015_a',
  idempotency_key:'idem_20261015_a',target:'github',action:'repo.inspect',dry_run:true,
  budget:{max_paid_amount:0,currency:'USD'}
} as const;
