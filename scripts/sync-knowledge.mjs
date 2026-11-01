/** Read only explicit public content; atomically replace only our generated snapshot. */
import { readFileSync, readdirSync, writeFileSync, renameSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Same resolution as server/owner.ts; this script runs without TypeScript.
const ownerConfig = () => JSON.parse(readFileSync(resolve(root, process.env.PAI_OWNER_CONFIG || 'owner.config.json'), 'utf8'));
const plain = value => typeof value === 'string' ? value : '';
const localized = value => typeof value === 'string' ? value : value && typeof value === 'object' ? [plain(value.zh), plain(value.en)].filter(Boolean).join('\n') : '';
const fields = (value, keys) => keys.map(key => Array.isArray(value?.[key]) ? value[key].map(localized).join('\n') : localized(value?.[key])).filter(Boolean).join('\n');
export function publicText(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
}
export function buildSnapshot(site, parseYaml, name = ownerConfig().name) {
  site = realpathSync(site);
  const read = path => {
    const full = realpathSync(join(site, path));
    if (relative(site, full).startsWith('..')) throw Error('Content path escapes the website: ' + path);
    if (lstatSync(full).size > 2_000_000) throw Error('Content file too large: ' + path);
    return readFileSync(full, 'utf8');
  };
  const json = path => JSON.parse(read(path));
  const origin = new URL(json('content/site/site.json').siteUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('Invalid public site origin');
  const documents = [], skipped = [];
  const add = (id, title, url, text, file, updated = '', summary = '', kind = 'website') => {
    text = publicText(text); if (!text) return;
    if (documents.some(d => d.id === id)) throw Error('Duplicate document id: ' + id);
    documents.push({ id, title, urls: [url], kind, updated, summary, text, file });
  };
  for (const [file, id] of [['content/site/home.json','profile'], ['content/site/home.en.json','profile-en']]) {
    const home = json(file);
    add(id, id === 'profile' ? name.zh + ' 个人介绍' : 'About ' + name.en, new URL(id === 'profile' ? '/' : '/en/', origin).href, fields(home, ['name','intro','about','interest','identity','now','work','writing']), file);
  }
  const contact=json('content/site/home.shared.json');
  if(typeof contact.email!=='string'||!/^\S+@\S+\.\S+$/.test(contact.email))throw Error('Invalid public contact');
  const social=new URL(contact.social.url);if(social.protocol!=='https:'||social.username||social.password)throw Error('Invalid public social URL');
  add('contact','公开联系渠道 / Public contact',origin.href,'公开邮箱：'+contact.email+'\n公开社交账号：'+plain(contact.social.label)+' '+social.href,'content/site/home.shared.json');
  documents.at(-1).urls.push(social.href);
  const keywords = json('content/site/home-keywords.json');
  add('practice', name.zh + ' 的公开实践与设计方法 / Design and AI practice', origin.href, Object.entries(keywords.zh ?? {}).map(([k,v]) => `${k}：${plain(v)}`).join('\n'), 'content/site/home-keywords.json');
  const catalog = json('content/site/catalog.json');
  const projects = [...catalog.projects.filter(s => s.presentation === 'projects').flatMap(s => s.items), ...(catalog.lab ?? []).flatMap(s => s.presentation === 'projects' ? s.items : s.presentation === 'list' ? s.projects ?? [] : [])];
  for (const item of projects) {
    if (!/^[a-z0-9-]+$/.test(item.id)) throw Error('Invalid project id');
    if (item.draft === true || item.private === true) {skipped.push({file:item.id,reason:'non-public project'});continue;}
    const text = [fields(item,['zh','en','description','year','role']), fields(item.detail,['problemLine','context','problems','goal','solution','design','workflow','strengths','limitations'])].filter(Boolean).join('\n\n');
    add('project:'+item.id, [item.zh,item.en].filter(Boolean).join(' / '), new URL('/projects/'+item.id,origin).href, text, 'content/site/catalog.json#'+item.id, '', localized(item.description));
  }
  add('projects-index', '作品与项目概览 / Projects portfolio work', new URL('/projects',origin).href, projects.filter(p => !p.draft && !p.private).map(p => `${p.zh} / ${p.en}: ${localized(p.description)}`).join('\n'), 'content/site/catalog.json');
  const walk = dir => {
    for (const entry of readdirSync(join(site,dir), {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw Error('Symlink content is not imported');
      const path = dir+'/'+entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'index.md') {
        const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(read(path));
        if (!match) throw Error('Missing metadata: '+path);
        const data = parseYaml(match[1]);
        if (!data || (data.draft !== undefined && typeof data.draft !== 'boolean')) throw Error('Invalid draft flag: '+path);
        if (data.draft === true) {skipped.push({file:path,reason:'draft'});continue;}
        if (data.contentStatus !== 'full') {skipped.push({file:path,reason:'index-only; no verified local full text'});continue;}
        const lang = data.contentLanguage ?? 'zh-Hans';
        if (!['zh-Hans','en'].includes(lang) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) throw Error('Invalid article route: '+path);
        const title = lang === 'en' ? data.titleEn : data.title;
        const summary = lang === 'en' ? data.descriptionEn : data.description;
        if (typeof title !== 'string' || typeof summary !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(String(data.pubDate))) throw Error('Invalid article metadata: '+path);
        const url = new URL((lang === 'en' ? '/en' : '')+'/blog/'+data.slug,origin).href;
        add('article:'+lang+':'+data.slug,title,url,summary+'\n\n'+match[2],path,String(data.updatedDate ?? data.pubDate).slice(0,10),summary);
      }
    }
  };
  walk('content/blog');
  add('articles-index', '文章与写作概览 / Articles blog writing', new URL('/blog',origin).href, documents.filter(d => d.id.startsWith('article:')).map(d => `${d.title}: ${d.summary}`).join('\n'), 'content/blog');
  const serialized = JSON.stringify(documents);
  if (serialized.length > 2_000_000) throw Error('Snapshot exceeds 2 MB; review scope before importing');
  return { schema:1, origin:origin.origin, syncedAt:new Date().toISOString(), revision:createHash('sha256').update(serialized).digest('hex'), documents, skipped };
}
export function syncWebsite(site) {
  // Reuse the YAML parser already used by the website's own content scripts.
  const require = createRequire(join(resolve(site),'package.json'));
  const { parse } = require('yaml');
  const snapshot = buildSnapshot(site, text => parse(text,{maxAliasCount:20}));
  const dir = join(resolve(root, process.env.PAI_KNOWLEDGE_DIR || 'knowledge'),'website'); mkdirSync(dir,{recursive:true});
  const output = join(dir,'snapshot.json'), temporary = output+'.tmp';
  writeFileSync(temporary,JSON.stringify(snapshot,null,2)+'\n','utf8'); renameSync(temporary,output);
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    if (args.length && (args[0] !== '--site' || args.length !== 2)) throw Error('Usage: npm run knowledge:sync -- [--site PATH]');
    const site=args[1] ?? process.env.PAI_SITE_DIR;
    if (!site) throw Error('Set PAI_SITE_DIR or pass --site PATH to your website source folder.');
    const result=syncWebsite(site);
    console.log(`Synced ${result.documents.length} public documents; skipped ${result.skipped.length}. Revision ${result.revision.slice(0,12)}. No model calls.`);
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
