/** Shared local SQLite store. No browser can select its path or issue SQL. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export type Asset = { key:string; title:string; content:string; kind:'persona'|'rules'|'website'|'personal'|'research'; urls:string[]; updated?:string; tier?:'core'|'detail'; enabled?:boolean; sourceHash?:string; sourceIds?:string[] };
export type Proposal = { id:string; target:string; base:string; before:Asset; content:string; instruction:string; status:string; created:string; error?:string;metrics?:Record<string,unknown> };
export const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class WorkbenchStore {
  db: DatabaseSync;
  constructor(directory:string) {
    mkdirSync(directory,{recursive:true});
    this.db=new DatabaseSync(join(directory,'workbench.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, target TEXT NOT NULL, created TEXT NOT NULL, before_value TEXT NOT NULL, after_value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, created TEXT NOT NULL, value TEXT NOT NULL, review TEXT NOT NULL DEFAULT '{}');`);
  }
  close(){this.db.close();}
  assets():Asset[]{return (this.db.prepare('SELECT value FROM assets').all() as {value:string}[]).map(r=>JSON.parse(r.value));}
  asset(key:string):Asset|undefined {const r=this.db.prepare('SELECT value FROM assets WHERE id=?').get(key) as {value:string}|undefined;return r?JSON.parse(r.value):undefined;}
  publish(after:Asset, fallback:Asset, expected:string, proposal?:Proposal) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before=this.asset(after.key)??fallback;
      if(hash(before)!==expected)throw Error('CONFLICT');
      after={...after,updated:new Date().toISOString().slice(0,10)};
      const id=randomUUID();
      this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?)').run(id,after.key,new Date().toISOString(),JSON.stringify(before),JSON.stringify(after));
      this.db.prepare('INSERT OR REPLACE INTO assets VALUES (?,?)').run(after.key,JSON.stringify(after));
      if(proposal){const current=this.proposal(proposal.id);if(current?.status!=='ready')throw Error('INVALID_PROPOSAL');this.saveProposal({...current,status:'applied'});}
      this.db.exec('COMMIT');return id;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  revisions(){return this.db.prepare('SELECT id,target,created,before_value,after_value FROM revisions ORDER BY created DESC LIMIT 100').all().map(r=>({id:r.id,target:r.target,created:r.created,before:JSON.parse(String(r.before_value)),after:JSON.parse(String(r.after_value))}));}
  saveProposal(p:Proposal){this.db.prepare('INSERT OR REPLACE INTO proposals VALUES (?,?)').run(p.id,JSON.stringify(p));}
  proposal(id:string):Proposal|undefined {const r=this.db.prepare('SELECT value FROM proposals WHERE id=?').get(id) as {value:string}|undefined;return r?JSON.parse(r.value):undefined;}
  proposals():Proposal[]{return (this.db.prepare('SELECT value FROM proposals ORDER BY rowid DESC LIMIT 100').all() as {value:string}[]).map(r=>JSON.parse(r.value));}
  startRun(value:Record<string,unknown>,conversation:string){const id=randomUUID();this.db.prepare('INSERT INTO runs (id,conversation,created,value) VALUES (?,?,?,?)').run(id,conversation,new Date().toISOString(),JSON.stringify(value));return id;}
  finishRun(id:string,value:unknown){this.db.prepare('UPDATE runs SET value=? WHERE id=?').run(JSON.stringify(value),id);}
  runs(){return this.db.prepare('SELECT * FROM runs ORDER BY created DESC LIMIT 200').all().map(r=>({id:String(r.id),conversation:r.conversation,created:r.created,...JSON.parse(String(r.value)),review:JSON.parse(String(r.review))}));}
  review(id:string,note:string,corrected:string,reviewed:boolean){const result=this.db.prepare('UPDATE runs SET review=? WHERE id=?').run(JSON.stringify({note,corrected,reviewed}),id);if(!result.changes)throw Error('NOT_FOUND');}
  deleteConversation(conversation:string){this.db.prepare('DELETE FROM runs WHERE conversation=?').run(conversation);}
  interruptProposals(){for(const p of this.proposals())if(p.status==='running')this.saveProposal({...p,status:'failed',error:'SERVER_RESTARTED'});}
  deleteRun(id:string){this.db.prepare('DELETE FROM runs WHERE id=?').run(id);}
}
let instance:WorkbenchStore|undefined;
export function getStore(){return instance??=new WorkbenchStore(resolve(process.env.PAI_DATA_DIR || '.local-data'));}
