/** Online knowledge edits: the owner page and the owner's agent change what the site assistant knows without a redeploy.
 * Live edits sit on top of the published release (or the repository files); drafts wait in a review queue until the owner approves them. */
import { randomBytes, randomUUID } from 'node:crypto';
import type { WorkbenchStore } from './workbench-store.ts';
import { buildKnowledge, coreSize, documentProblem, type Document } from './knowledge.ts';

export type EditValue = { title?: string; text?: string; urls?: string[]; tier?: 'core' | 'detail'; hidden?: boolean };
export type EditSource = 'owner' | 'agent' | 'upload';
export type KnowledgeEdit = { id: string; target: string; status: 'live' | 'draft'; value: EditValue; source: EditSource; note?: string | null; updated: string };
export interface KnowledgeEditStore {
  list(): Promise<KnowledgeEdit[]>;
  /** Replaces the live edit of a target. */
  put(target: string, value: EditValue, source: EditSource): Promise<KnowledgeEdit>;
  /** Deletes the live edit of a target: an original comes back, an added entry disappears. */
  remove(target: string): Promise<boolean>;
  draft(target: string, value: EditValue, source: EditSource, note?: string): Promise<KnowledgeEdit>;
  /** Makes a draft the live edit of its target, optionally with the owner's changes. */
  approve(id: string, value?: EditValue): Promise<KnowledgeEdit | undefined>;
  discard(id: string): Promise<boolean>;
}
export const promptTargets = ['persona', 'rules'] as const;
export const editLimits = { title: 400, text: 20000, prompt: 4000, note: 2000, urls: 32, drafts: 200 };
const isPrompt = (target: string) => (promptTargets as readonly string[]).includes(target);

/** Local SQLite twin of pai_knowledge, used by the dev servers and tests. */
export class LocalKnowledgeEdits implements KnowledgeEditStore {
  private store: WorkbenchStore;
  constructor(store: WorkbenchStore) {
    this.store = store;
    store.db.exec('CREATE TABLE IF NOT EXISTS knowledge_edits (id TEXT PRIMARY KEY, target TEXT NOT NULL, status TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, note TEXT, updated TEXT NOT NULL)');
  }
  private row = (r: any): KnowledgeEdit => ({ id: r.id, target: r.target, status: r.status, value: JSON.parse(r.value), source: r.source, note: r.note, updated: r.updated });
  async list() { return (this.store.db.prepare('SELECT * FROM knowledge_edits ORDER BY updated DESC').all()).map(this.row); }
  private insert(target: string, status: 'live' | 'draft', value: EditValue, source: EditSource, note?: string) {
    const e: KnowledgeEdit = { id: randomUUID(), target, status, value, source, note: note ?? null, updated: new Date().toISOString() };
    this.store.db.prepare('INSERT INTO knowledge_edits VALUES (?,?,?,?,?,?,?)').run(e.id, target, status, JSON.stringify(value), source, e.note ?? null, e.updated);
    return e;
  }
  async put(target: string, value: EditValue, source: EditSource) {
    this.store.db.exec('BEGIN IMMEDIATE');
    try { this.store.db.prepare("DELETE FROM knowledge_edits WHERE target=? AND status='live'").run(target); const e = this.insert(target, 'live', value, source); this.store.db.exec('COMMIT'); return e; }
    catch (e) { this.store.db.exec('ROLLBACK'); throw e; }
  }
  async remove(target: string) { return this.store.db.prepare("DELETE FROM knowledge_edits WHERE target=? AND status='live'").run(target).changes > 0; }
  async draft(target: string, value: EditValue, source: EditSource, note?: string) { return this.insert(target, 'draft', value, source, note); }
  async approve(id: string, value?: EditValue) {
    const r = this.store.db.prepare("SELECT * FROM knowledge_edits WHERE id=? AND status='draft'").get(id);
    if (!r) return undefined;
    const draft = this.row(r);
    this.store.db.prepare('DELETE FROM knowledge_edits WHERE id=?').run(id);
    return this.put(draft.target, value ?? draft.value, draft.source);
  }
  async discard(id: string) { return this.store.db.prepare("DELETE FROM knowledge_edits WHERE id=? AND status='draft'").run(id).changes > 0; }
}

/** The documents the assistant answers from: the base with live edits applied. Hidden entries drop out. */
export function applyEdits(base: Document[], edits: KnowledgeEdit[]): Document[] {
  const live = new Map(edits.filter(e => e.status === 'live' && !isPrompt(e.target)).map(e => [e.target, e]));
  const docs: Document[] = [];
  for (const d of base) {
    const e = live.get(d.id);
    if (!e) { docs.push(d); continue; }
    live.delete(d.id);
    if (!e.value.hidden) docs.push(editedDocument(d.id, e, d));
  }
  for (const [target, e] of live) if (!e.value.hidden) docs.push(editedDocument(target, e));
  // A broken row never takes the assistant down: it is skipped, and the page shows the problem when it is saved.
  return docs.filter(d => !documentProblem(d));
}
function editedDocument(id: string, e: KnowledgeEdit, original?: Document): Document {
  const urls = e.value.urls ?? original?.urls ?? [];
  const kind = urls.length || original?.kind === 'personal' ? original?.kind ?? 'personal' : 'personal';
  return { id, title: e.value.title ?? original?.title ?? id, kind, urls, text: e.value.text ?? original?.text ?? '', updated: e.updated.slice(0, 10), file: 'online', tier: e.value.tier ?? original?.tier ?? 'detail' };
}
export const promptOverrides = (edits: KnowledgeEdit[]) => Object.fromEntries(edits.filter(e => e.status === 'live' && isPrompt(e.target) && e.value.text).map(e => [e.target, e.value.text!])) as { persona?: string; rules?: string };

export type EntryView = { id: string; title: string; text: string; urls: string[]; tier: 'core' | 'detail'; origin: 'base' | 'edited' | 'added'; hidden: boolean; updated: string };
export type DraftView = { id: string; target: string; title: string; text: string; urls: string[]; tier: 'core' | 'detail'; source: EditSource; note?: string | null; updated: string; replaces?: string };
type Input = { title?: unknown; text?: unknown; urls?: unknown; tier?: unknown; hidden?: unknown };
type ServiceConfig = { edits: KnowledgeEditStore; base: () => Document[]; basePrompt: (name: 'persona' | 'rules') => string; contextLimit: number; onChange: () => void };

/** One set of rules for every writer: the owner page, the owner's agent and uploads. Returns readable errors, never half-saved state. */
export function createKnowledgeService(config: ServiceConfig) {
  const fail = (message: string): never => { throw Object.assign(Error(message), { owner: true }); };
  /** Shape checks shared by live edits and drafts; names the field at fault. */
  const shape = (target: string, input: Input, current?: EditValue): EditValue => {
    if (isPrompt(target)) {
      const text = typeof input.text === 'string' ? input.text.trim() : '';
      if (!text || text.length > editLimits.prompt) fail(`${target === 'persona' ? '语气' : '规则'}需要 1–${editLimits.prompt} 字`);
      return { text };
    }
    const value: EditValue = { ...current };
    const str = (v: unknown, max: number, message: string) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail(message);
    if (input.title !== undefined) value.title = str(input.title, editLimits.title, `标题需要 1–${editLimits.title} 字`);
    if (input.text !== undefined) value.text = str(input.text, editLimits.text, `正文需要 1–${editLimits.text} 字`);
    if (input.urls !== undefined) {
      const urls = Array.isArray(input.urls) && input.urls.length <= editLimits.urls && input.urls.every(u => typeof u === 'string') ? input.urls as string[] : fail(`链接最多 ${editLimits.urls} 个`);
      value.urls = [...new Set(urls.map(u => u.trim()).filter(Boolean))];
    }
    if (input.tier !== undefined) value.tier = input.tier === 'core' || input.tier === 'detail' ? input.tier : fail('tier 只能是 core 或 detail');
    if (input.hidden !== undefined) value.hidden = typeof input.hidden === 'boolean' ? input.hidden : fail('hidden 只能是 true 或 false');
    return value;
  };
  const baseDoc = (target: string) => config.base().find(d => d.id === target);
  /** The entry as it would read, checked like any knowledge document. */
  const checkDocument = (target: string, value: EditValue, edits: KnowledgeEdit[]) => {
    if (isPrompt(target)) return;
    const previous = edits.find(e => e.status === 'live' && e.target === target);
    const doc = editedDocument(target, { ...(previous ?? { id: '', status: 'live', source: 'owner', updated: new Date().toISOString() }), target, value }, baseDoc(target));
    if (!baseDoc(target) && !previous && (!value.title || !value.text)) fail('新资料需要标题和正文');
    const problem = documentProblem(doc);
    if (problem) fail('这条资料有问题：' + problem.replace(/"urls" has an invalid link (".*?"): use a full https:\/\/ address/, '链接 $1 不是完整的 https:// 地址'));
  };
  /** The whole library after this change must still fit the per-question budget. */
  const checkLibrary = (target: string, value: EditValue, edits: KnowledgeEdit[]) => {
    if (isPrompt(target)) return;
    const next = [...edits.filter(e => !(e.status === 'live' && e.target === target)), { id: 'pending', target, status: 'live' as const, value, source: 'owner' as const, updated: new Date().toISOString() }];
    const docs = applyEdits(config.base(), next);
    const core = coreSize(docs);
    if (core > 4000) fail(`「每次都带上」的资料合计会有 ${core} 字，超过 4000 字。先把别的条目改成「需要时读取」，或缩短这一条`);
    try { buildKnowledge([{ role: 'user', content: '检查' }], config.contextLimit, docs); } catch { fail('资料目录太大，单次提问放不下。缩短一些标题，或隐藏不常用的条目'); }
  };
  const newTarget = () => 'note:' + randomBytes(5).toString('hex');
  const knownTarget = (target: string, edits: KnowledgeEdit[]) => isPrompt(target) || !!baseDoc(target) || edits.some(e => e.status === 'live' && e.target === target);
  const save = async (targetInput: unknown, input: Input, source: EditSource) => {
    const edits = await config.edits.list();
    const target = typeof targetInput === 'string' && targetInput ? targetInput : newTarget();
    if (typeof targetInput === 'string' && targetInput && !knownTarget(target, edits)) fail('找不到这条资料：' + target);
    const value = shape(target, input, edits.find(e => e.status === 'live' && e.target === target)?.value);
    checkDocument(target, value, edits); checkLibrary(target, value, edits);
    const saved = await config.edits.put(target, value, source); config.onChange(); return saved;
  };

  return {
    async view() {
      const edits = await config.edits.list(), base = config.base();
      const live = new Map(edits.filter(e => e.status === 'live').map(e => [e.target, e]));
      const entry = (id: string, original?: Document): EntryView => {
        const e = live.get(id), d = e ? editedDocument(id, e, original) : original!;
        return { id, title: d.title, text: d.text, urls: d.urls, tier: d.tier === 'core' ? 'core' : 'detail', origin: !e ? 'base' : original ? 'edited' : 'added', hidden: !!e?.value.hidden, updated: e ? e.updated : d.updated };
      };
      const entries = [...base.map(d => entry(d.id, d)), ...[...live.keys()].filter(id => !isPrompt(id) && !base.some(d => d.id === id)).map(id => entry(id))];
      const prompt = (name: 'persona' | 'rules') => ({ text: live.get(name)?.value.text ?? config.basePrompt(name), edited: live.has(name) });
      const drafts: DraftView[] = edits.filter(e => e.status === 'draft').map(e => {
        const original = base.find(d => d.id === e.target), d = isPrompt(e.target) ? undefined : editedDocument(e.target, e, original);
        return { id: e.id, target: e.target, title: d?.title ?? (e.target === 'persona' ? '语气' : '规则'), text: d?.text ?? e.value.text ?? '', urls: d?.urls ?? [], tier: d?.tier === 'core' ? 'core' : 'detail', source: e.source, note: e.note, updated: e.updated, ...(knownTarget(e.target, edits) ? { replaces: e.target } : {}) };
      });
      return { entries, persona: prompt('persona'), rules: prompt('rules'), drafts, coreUsed: coreSize(applyEdits(base, edits)), coreLimit: 4000 };
    },
    save,
    async restore(target: unknown) {
      if (typeof target !== 'string' || !(await config.edits.remove(target))) fail('这条资料没有在线修改，不需要恢复');
      config.onChange();
    },
    async draft(targetInput: unknown, input: Input, source: EditSource, note?: unknown) {
      const edits = await config.edits.list();
      if (edits.filter(e => e.status === 'draft').length >= editLimits.drafts) fail(`待确认的资料已经有 ${editLimits.drafts} 条，先处理一些`);
      const target = typeof targetInput === 'string' && targetInput && knownTarget(targetInput, edits) ? targetInput : newTarget();
      const value = shape(target, input, isPrompt(target) ? undefined : edits.find(e => e.status === 'live' && e.target === target)?.value);
      checkDocument(target, value, edits);
      const text = typeof note === 'string' ? note.trim().slice(0, editLimits.note) : undefined;
      return config.edits.draft(target, value, source, text || undefined);
    },
    async approve(id: unknown, input?: Input) {
      const edits = await config.edits.list(), draft = edits.find(e => e.id === id && e.status === 'draft');
      if (!draft) fail('这条待确认的资料已经处理过了');
      const value = input ? shape(draft!.target, input, draft!.value) : draft!.value;
      checkDocument(draft!.target, value, edits); checkLibrary(draft!.target, value, edits);
      const saved = await config.edits.approve(draft!.id, value); config.onChange(); return saved;
    },
    async discard(id: unknown) { if (typeof id !== 'string' || !(await config.edits.discard(id))) fail('这条待确认的资料已经处理过了'); },
  };
}
export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
/** Errors meant for the owner carry a readable message; anything else is a storage failure. */
export const ownerMessage = (e: unknown) => e instanceof Error && (e as Error & { owner?: boolean }).owner ? e.message : undefined;
