#!/usr/bin/env node
/** Manual folder indexer. No network, scheduler, moves, or source-content editing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const START='<!-- techistack:index:start -->', END='<!-- techistack:index:end -->';
const SCHEMA='techistack-local-index/v1';
const SKIP=new Set(['node_modules','__pycache__','venv','.venv','dist','build']);
const generated=/^(?:_scan_|_curate_|contactsheet_|selection_)/;
const clean=s=>String(s).replace(/[\r\n|]/g,' ').replace(/`/g,"'").replace(/</g,'&lt;');
const href=s=>s.split('/').map(encodeURIComponent).join('/');
const inside=(a,b)=>a===b || a.startsWith(b+path.sep);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function text(p){try{const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Expected regular file: '+p);return await fs.readFile(p,'utf8');}catch(e){if(e.code==='ENOENT')return '';throw e;}}
function field(note,key){const fm=note.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]||'';const v=fm.match(new RegExp('^'+key+': *(.*)$','m'))?.[1]?.trim();if(!v)return '';try{return JSON.parse(v);}catch{return v;}}
const CREDIT_START='<!-- techistack:credit:start -->', CREDIT_END='<!-- techistack:credit:end -->';
const CREDIT=`${CREDIT_START}\n---\n\nCreated with [TechiStack /index](https://github.com/alexbeltechi/techistack).\n${CREDIT_END}`;
function stripCredit(note){
 const clean=note.replace(/<!-- techistack:credit:start -->[\s\S]*?<!-- techistack:credit:end -->/g,'');
 if(clean.includes(CREDIT_START)||clean.includes(CREDIT_END))throw Error('Malformed Index credit block; repair it before refreshing');
 return clean;
}
function ownContext(note){const outside=stripCredit(note).replace(new RegExp(START+'[\\s\\S]*?'+END),'');return outside.match(/^## Context\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim()||'';}
function metadata(note,values){
 if(note && !note.startsWith('---\n')&&!note.startsWith('---\r\n'))return note; // never reinterpret arbitrary prose as YAML
 const match=note.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(note&&!match)throw Error('Unclosed frontmatter');
 let fm=match?.[1]||'';
 for(const [k,v] of Object.entries(values)){const line=k+': '+JSON.stringify(v);const re=new RegExp('^'+k+':.*$','m');fm=re.test(fm)?fm.replace(re,()=>line):fm+'\n'+line;}
 return '---\n'+fm.trim()+'\n---\n'+(match?note.slice(match[0].length):'');
}
function mountLabel(root){const parts=root.split(path.sep);return parts[1]==='Volumes'?parts[2]:os.hostname();}
function fileSummary(files){const c={};for(const f of files)c[f.extension||'(no extension)']=(c[f.extension||'(no extension)']||0)+1;return Object.entries(c).map(([x,n])=>`${n} ${x}`).join(', ')||'No files directly here';}
function tree(rec,byPath,depth=2,limit=80){const lines=[rec.name+'/'];let clipped=false;function visit(r,prefix,d){if(d>=depth){if(r.children.length)lines.push(prefix+'└── … deeper folders; use the links below');return;}r.children.forEach((name,i)=>{if(lines.length>=limit){clipped=true;return;}const last=i===r.children.length-1;lines.push(prefix+(last?'└── ':'├── ')+clean(name)+'/');const child=byPath.get(r.path==='.'?name:r.path+'/'+name);if(child)visit(child,prefix+(last?'    ':'│   '),d+1);});}visit(rec,'',0);if(clipped)lines.push('… overview shortened; full directory is in the local snapshot');return lines.join('\n');}

// Controlled vocabulary and privacy helpers
const VOCAB_FILE='vocab.json'; // store-relative
const PRIVACY_APPROVALS_FILE=path.join('privacy','approvals.json'); // { schema, approvals: { [source_id]: [relative paths] } }
async function readJsonIfExists(p){const raw=await text(p);return raw?JSON.parse(raw):null;}
async function readVocab(store){
 const p=path.join(store,VOCAB_FILE);const j=await readJsonIfExists(p);
 if(!j)return {schema:'techistack-vocabulary/v1',subjects:[],places:[]};
 const norm=list=>Array.isArray(list)?list:list&&typeof list==='object'?Object.entries(list).map(([tag,aliases])=>({tag,aliases:Array.isArray(aliases)?aliases:[]})):[];return {schema:j.schema||'techistack-vocabulary/v1',subjects:norm(j.subjects),places:norm(j.places)};
}
async function readPrivacyApprovals(store){const p=path.join(store,PRIVACY_APPROVALS_FILE);const j=await readJsonIfExists(p);return j&&j.schema==='techistack-privacy-approvals/v1'?j:{schema:'techistack-privacy-approvals/v1',approvals:{}};}
async function writePrivacyApprovals(store,data){const p=path.join(store,PRIVACY_APPROVALS_FILE);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,json(data),{flag:'w'});}
function tagsFromVocab(vocab,words){
 const out={subject:[],place:[]};
 for(const {tag,aliases=[]} of vocab.subjects){const all=[tag,...aliases].map(x=>x.toLowerCase());if(words.some(w=>all.includes(w)))out.subject.push(tag);}
 for(const {tag,aliases=[]} of vocab.places){const all=[tag,...aliases].map(x=>x.toLowerCase());if(words.some(w=>all.includes(w)))out.place.push(tag);}
 out.subject=[...new Set(out.subject)].sort();out.place=[...new Set(out.place)].sort();return out;
}
const SENSITIVE_FOLDER_WORDS=['finance','bank','statement','statements','tax','medical','health','id','ids','identity','password','passwords','contracts','legal','payroll'];
function looksSensitiveFolder(name){const w=name.toLowerCase().replace(/[-_]/g,' ');return SENSITIVE_FOLDER_WORDS.some(x=>w.split(/\s+/).includes(x));}
const RE_CARD=/\b(?:\d[ -]*?){13,19}\b/; // loose
const RE_IBAN=/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/;
const RE_ACCOUNT_HINTS=/\b(iban|sort\s*code|account\s*no?\.?|card|cc)\b/i;
const RE_PASSWORD_HINTS=/\b(pass(word|code)?|login|secret)\b/i;
const RE_ID_HINTS=/\b(ssn|ein|nid|cnp|passport|id|nino)\b/i;
function isNameSensitive(name){return RE_CARD.test(name)||RE_ACCOUNT_HINTS.test(name)||RE_PASSWORD_HINTS.test(name)||RE_ID_HINTS.test(name)||RE_IBAN.test(name);}
function redactFilename(name){const ext=path.extname(name);return {name:`REDACTED${ext}`,redacted:true,reason:'bank-or-identity-sensitive'};}
function recognizeBankStatement(name){
 const base=path.basename(name).toLowerCase();
 const banks=['monzo','revolut','wise','chase','barclays','hsbc','lloyds','natwest','santander','ing','unicredit','bofa','boa','citibank','citi'];
 const bank=banks.find(b=>base.includes(b));
 const m=base.match(/(20\d{2})(?:[-_ ](\d{2}))?(?:[-_ ](\d{2}))?/);
 if(!bank||!m)return null;const [ ,y,mo,dy]=m;const part=[y,mo,dy].filter(Boolean).join('-');return {kind:'bank_statement',bank,period:part};
}
function recognizeInvoice(name){
 const base=path.basename(name);
 const m=base.match(/(?:INV(?:OICE)?[-_ ]?)?(\d{4}-\d{2}-\d{2})[-_ ]+([A-Za-z][A-Za-z0-9 &'.-]{1,40})[-_ ]+(\d{1,6}(?:[.,]\d{2})?)[-_ ]*([A-Z]{3})/);
 if(!m)return null;const [,date,client,amount,currency]=m;const val=parseFloat(amount.replace(',','.'));if(!isFinite(val))return null;return {kind:'invoice',client:client.trim(),date,currency,amount:val};
}
function inferDateFromNames(folderName,files){
 const src=[folderName,...files.map(f=>f.name||'')].join(' ');
 const iso=src.match(/(20\d{2})[-_ /.]?(\d{2})?[-_ /.]?(\d{2})?/);
 if(iso){const y=iso[1],m=iso[2],d=iso[3];const date=[y,m,d].filter(Boolean).join('-');return {date,confidence:'inferred'};}return null;
}
function classifyLevel(rec,byPath){
 if(rec.path==='.')return {level:'collection',type:'Collection'};
 if(rec.children&&rec.children.length)return {level:'series',type:'Collection'};
 return {level:'item',type:'Collection'};
}
function wikiPathForFolder(rel){return (rel==='.'?'':rel.replace(/\\/g,'/'))+(rel==='.'?'':'/')+'_INDEX';}
function managed(rec,byPath,at){
 const folders=[...byPath.values()], total=folders.reduce((n,r)=>n+r.files.length,0);
 let s=`${START}\n\n## Archive map\n\n\`\`\`text\n${tree(rec,byPath,3,120)}\n\`\`\`\n\nChecked: **${at}** · recursively observed folders: **${folders.length}** · files: **${total}**. Only this selected root receives a note. The tree is shortened for readability; the local JSON contains the full recursive inventory.\n\n`;
 s+='### Folder directory\n\n| Folder | Description / direct file types |\n|---|---|\n';
 const display=folders.filter(r=>r.path!=='.'&&r.path.split('/').length<=3).slice(0,200);
 for(const r of display)s+=`| [${clean(r.path)}](${href(r.path)}/) | ${clean(r.description||fileSummary(r.files))} |\n`;
 if(display.length<folders.length-1)s+=`\n${folders.length-1-display.length} deeper/additional folders are listed in the local inventory.\n`;
 s+='\n### Files directly at this root\n\n'+fileSummary(rec.files)+'.\n\n';
 for(const f of rec.files.slice(0,100))s+=`- [${clean(f.name)}](${href(f.name)}) — ${f.size_bytes} bytes\n`;
 if(rec.files.length>100)s+='\nDirect-file list shortened; all filenames are in the local inventory.\n';
 const skipped=folders.reduce((n,r)=>n+r.skipped.length,0);
 s+=`\nExcluded entries: ${skipped}; individual exclusions and scan errors are recorded in the local JSON. Keep source notes and inventories local unless deliberately reviewed for sharing.\n\n`;
 // Wiki graph: link only notes (folders/topics/places/periods), never files
 const childLinks=(rec.children||[]).slice(0,200).map(name=>`- [[${(rec.path==='.'?name:rec.path+'/'+name).replace(/\\/g,'/')}/_INDEX]]`).join('\n');
 const topicLinks=(rec.subject||[]).map(t=>`[[topic/${t}]]`).join(' ');
 const placeLinks=(rec.place||[]).map(t=>`[[place/${t}]]`).join(' ');
 const periodLink=rec.date?`[[period/${rec.date.slice(0,7)}]]`:'';
 s+='### Wiki graph\n\n';
 if(childLinks)s+=`Children notes:\n\n${childLinks}\n\n`;
 if(topicLinks||placeLinks||periodLink)s+=`Topics: ${[topicLinks,placeLinks,periodLink].filter(Boolean).join(' ')}\n\n`;
 s+=`${END}`;
 return s;
}
function noteBodyFor(rec,byPath,at){
 let n=rec.original_note;
 // Dublin Core + minimal IPTC-friendly fields, preserving any existing values
 const existing={subject:field(n||'','subject'),place:field(n||'','place'),status:field(n||'','status'),date:field(n||'','date'),date_confidence:field(n||'','date_confidence'),type:field(n||'','type')};
 const classified=classifyLevel(rec,byPath);
 const values={id:rec.id,index_updated_at:at,generated_inventory_at:at,title:rec.name,type:existing.type||classified.type,status:existing.status||rec.status||'raw'};
 if(rec.subject?.length && !existing.subject)values.subject=rec.subject;
 if(rec.place?.length && !existing.place)values.place=rec.place;
 if(rec.date && !existing.date){values.date=rec.date;values.date_confidence=rec.date_confidence||'inferred';}
 if(!n){n=metadata('',{schema:'techistack-index/v3',id:rec.id,index_created_at:at,title:rec.name,type:values.type,status:values.status})+`\n# ${clean(rec.name)}\n\n## Context\n\n## Folder context\n\n## Notes\n\n`;}
 else if(!field(n,'id')){
   if(n.startsWith('---'))n=metadata(n,{id:rec.id});
   else n=`---\nschema: techistack-index/v3\nid: ${JSON.stringify(rec.id)}\nindex_created_at: ${JSON.stringify(at)}\n---\n\n`+n;
 }
 n=metadata(n,values);
 const block=managed(rec,byPath,at), a=n.indexOf(START), b=n.indexOf(END);
 if((a<0)!==(b<0)||a>=0&&b<a||a>=0&&n.indexOf(START,a+1)>=0)throw Error('Ambiguous generated block: '+rec.path);
 if(a>=0)return n.slice(0,a)+block+n.slice(b+END.length);
 // New notes show the map before human-editable sections. Existing prose stays intact.
 if(!rec.original_note){const pos=n.indexOf('\n## Context');return n.slice(0,pos)+'\n\n'+block+'\n'+n.slice(pos);}
 return n.trimEnd()+'\n\n'+block+'\n';
}
function noteFor(rec,byPath,at){
 const body=noteBodyFor({...rec,original_note:stripCredit(rec.original_note)},byPath,at);
 return body.trimEnd()+'\n\n'+CREDIT+'\n';
}
async function digest(p){const h=crypto.createHash('sha256');const f=await fs.open(p,'r');try{for await(const chunk of f.createReadStream())h.update(chunk);return h.digest('hex');}finally{await f.close().catch(()=>{});}}
async function atomic(p,body){if(await exists(p)){const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Refuse to replace non-regular file: '+p);}const tmp=p+'.index-tmp-'+crypto.randomUUID();await fs.writeFile(tmp,body,{flag:'wx'});await fs.rename(tmp,p);}
async function outsideGit(store,label='Local index store'){for(let p=store;;p=path.dirname(p)){if(await exists(path.join(p,'.git')))throw Error(label+' must be outside a Git working tree: '+store);if(path.dirname(p)===p)break;}}
function candidates(sources){const groups=new Map();for(const s of sources)for(const r of s.folders)for(const f of r.files){if(f.kind!=='file'||f.size_bytes==null)continue;const k=f.name.toLowerCase()+'\0'+f.size_bytes;if(!groups.has(k))groups.set(k,[]);groups.get(k).push({source_id:s.source_id,folder_id:r.id,path:path.join(s.last_known_location,r.path,f.name),sha256:f.sha256||null});}return [...groups.values()].map(g=>[...new Map(g.map(x=>[x.path,x])).values()]).filter(x=>x.length>1);}
function hashMatches(sources){const groups=new Map();for(const s of sources)for(const r of s.folders)for(const f of r.files){if(!f.sha256)continue;const entry={source_id:s.source_id,path:path.join(s.last_known_location,r.path,f.name)};if(!groups.has(f.sha256))groups.set(f.sha256,[]);groups.get(f.sha256).push(entry);}return [...groups.entries()].map(([sha256,g])=>({sha256,locations:[...new Map(g.map(x=>[x.path,x])).values()]})).filter(g=>g.locations.length>1);}

const MANIFEST='techistack-local-index/v2';
const SOURCE='techistack-source-index/v2';
const CHUNK='techistack-folder-chunk/v2';
const CHUNK_BYTES=5*1024*1024;
const FILES_PER_PART=1000;
function refPath(store,ref){
 if(typeof ref!=='string'||path.isAbsolute(ref)||ref.split('/').includes('..'))throw Error('Invalid local-store reference');
 const p=path.resolve(store,ref);if(!inside(p,store))throw Error('Reference escapes local store');return p;
}
async function readStore(store){
 const raw=await text(path.join(store,'index.json'));
 if(!raw)return {schema:MANIFEST,sources:[]};
 const d=JSON.parse(raw);
 if(![SCHEMA,MANIFEST].includes(d.schema)||!Array.isArray(d.sources))throw Error('Unknown index.json schema; refusing to overwrite');
 return d;
}
async function descriptor(store,entry){
 if(entry.folders)return entry; // legacy v1 aggregate
 const d=JSON.parse(await text(refPath(store,entry.latest)));
 if(d.schema!==SOURCE||d.source_id!==entry.source_id)throw Error('Invalid source descriptor');return d;
}
async function* parts(store,entry){
 const d=await descriptor(store,entry);
 if(d.folders){for(const r of [...d.folders,...(d.unobserved_folders||[])])yield {...r,file_part:0,file_parts:1};return;}
 for(const ref of d.folder_chunks){const c=JSON.parse(await text(refPath(store,ref.path)));if(c.schema!==CHUNK||c.source_id!==d.source_id)throw Error('Invalid folder chunk');for(const r of c.folders)yield r;}
}
async function loadFolders(store,entry){
 if(!entry)return [];
 const rows=[];let last;
 for await(const r of parts(store,entry)){
  if(r.file_part===0){last={...r,files:[...r.files]};delete last.file_part;delete last.file_parts;rows.push(last);}
  else {if(!last||last.id!==r.id||last.path!==r.path)throw Error('Unordered folder parts');last.files.push(...r.files);}
 }
 return rows;
}
async function immutable(store,dir,data){
 const body=json(data),digest=sha(body),ref=dir+'/'+digest+'.json',p=refPath(store,ref);
 await fs.mkdir(path.dirname(p),{recursive:true});
 if(await exists(p)){if(await text(p)!==body)throw Error('Content-addressed file conflict: '+ref);}
 else await fs.writeFile(p,body,{flag:'wx'});
 return {path:ref,bytes:Buffer.byteLength(body)};
}
function sourceSummary(s,latest,previous=null){return {
 source_id:s.source_id,root_folder_id:s.root_folder_id,label:s.label,
 last_known_location:s.last_known_location,last_location_verified_at:s.last_location_verified_at,
 snapshot_at:s.snapshot_at,coverage:s.coverage,folder_count:s.folder_count,
 file_count:s.file_count,unobserved_folder_count:s.unobserved_folder_count,
 error_count:s.error_count,latest,previous
};}
async function writeSource(store,source,rows,previous=null){
 const refs=[];let batch=[],size=0;
 async function flush(){if(!batch.length)return;refs.push(await immutable(store,'sources/'+source.source_id+'/chunks',{schema:CHUNK,source_id:source.source_id,folders:batch}));batch=[];size=0;}
 const parents=new Map(rows.map(r=>[r.path,r.id]));
 for(const raw of rows){
  const r={...raw,kind:'folder',parent_id:raw.parent_id??(raw.path==='.'?null:parents.get(path.posix.dirname(raw.path))??null)};
  const sigInput=r.files.map(f=>[f.size_bytes||0,f.sha256||null]);r.signature={method:'file-sizes-hashes/v1',sha256:sha(JSON.stringify(sigInput))};
  const n=Math.max(1,Math.ceil(r.files.length/FILES_PER_PART));for(let i=0;i<n;i++){
   const part={...r,files:r.files.slice(i*FILES_PER_PART,(i+1)*FILES_PER_PART),file_part:i,file_parts:n};
   const bytes=Buffer.byteLength(json(part));if(batch.length&&size+bytes>CHUNK_BYTES)await flush();batch.push(part);size+=bytes;
 }}
 await flush();
 const {folders,unobserved_folders,original_note,...meta}=source;
 const observed=rows.filter(r=>!r.location_status?.startsWith('not-observed'));
 const d={...meta,schema:SOURCE,folder_count:observed.length,file_count:observed.reduce((n,r)=>n+r.files.length,0),unobserved_folder_count:rows.length-observed.length,error_count:source.error_count??source.errors?.length??0,folder_chunks:refs};
 const out=await immutable(store,'sources/'+source.source_id,d);
 return sourceSummary(d,out.path,previous);
}
async function prune(store,entry){
 const keep=new Set([entry.latest,entry.previous].filter(Boolean));
 for(const ref of [...keep]){const d=JSON.parse(await text(refPath(store,ref)));for(const c of d.folder_chunks)keep.add(c.path);}
 const base=path.join(store,'sources',entry.source_id);
 for(const dir of [base,path.join(base,'chunks')])for(const name of await fs.readdir(dir)){
  if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
  const p=path.join(dir,name),rel=path.relative(store,p).split(path.sep).join('/');if(keep.has(rel))continue;
  const body=await text(p);if(sha(body)+'.json'!==name)continue; // retain modified or unknown files
  const d=JSON.parse(body);if(d.source_id===entry.source_id&&[SOURCE,CHUNK].includes(d.schema))await fs.unlink(p);
 }
}
// --- Obsidian minimal config: merge-only helper ---
async function ensureObsidianConfig(store){
 const dir=path.join(store,'.obsidian');await fs.mkdir(dir,{recursive:true});
 // app.json: userIgnoreFilters merge
 const appPath=path.join(dir,'app.json');let app={};
 try{const raw=await fs.readFile(appPath,'utf8');app=JSON.parse(raw);}catch{}
 const desiredIgnores=['migrations/','sources/','privacy/','snapshots/','reviews/'];
 const existingIgnores=Array.isArray(app.userIgnoreFilters)?app.userIgnoreFilters:[];
 const mergedIgnores=[...new Set([...existingIgnores,...desiredIgnores])];
 if(mergedIgnores.length)app.userIgnoreFilters=mergedIgnores;
 await fs.writeFile(appPath,json(app),{flag:'w'});
 // graph.json: color groups merge
 const graphPath=path.join(dir,'graph.json');let graph={};
 try{const raw=await fs.readFile(graphPath,'utf8');graph=JSON.parse(raw);}catch{}
 const wantGroups=[
  {query:'file: "_INDEX.md"',color:'#6aa84f'},
  {query:'path:topic/',color:'#3d85c6'},
  {query:'path:place/',color:'#674ea7'},
  {query:'path:period/',color:'#e69138'}
 ];
 const groups=Array.isArray(graph.groups)?graph.groups:[];
 for(const g of wantGroups){if(!groups.some(x=>String(x.query)===g.query))groups.push(g);}
 if(groups.length)graph.groups=groups;
 await fs.writeFile(graphPath,json(graph),{flag:'w'});
}
async function migrate(store,db){
 if(db.schema===MANIFEST)return db;
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=path.join(store,'migrations','v1-'+stamp);await fs.mkdir(backup,{recursive:true});
 await fs.writeFile(path.join(backup,'index.json'),json(db),{flag:'wx'});
 const overview=await text(path.join(store,'INDEX.md'));
 if(overview.includes('<!-- techistack:local-index -->')){
  await fs.writeFile(path.join(backup,'INDEX.md'),overview,{flag:'wx'});await fs.unlink(path.join(store,'INDEX.md'));
 }
 // v1 snapshots remain untouched as a one-time local archive, never extended by v2.
 const out={schema:MANIFEST,updated_at:db.updated_at||stamp,sources:[],legacy_snapshot_directory:await exists(path.join(store,'snapshots'))?'snapshots':null};
 for(const s of db.sources){const rows=[...s.folders,...(s.unobserved_folders||[])];out.sources.push(await writeSource(store,s,rows));}
 return out;
}
function annotations(note){
 const outside=stripCredit(note).replace(new RegExp(START+'[\\s\\S]*?'+END),'');
 const block=outside.match(/^## Folder context[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]||'';
 const result=new Map();for(const m of block.matchAll(/^### (.+)\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm))result.set(m[1].trim().replace(/\/$/,''),m[2].trim());return result;
}
function changeReport(previous,rows){
 const byPath=new Map(previous.map(r=>[r.path,r]));const report={};
 const add=(kind,value)=>{const x=report[kind]??={count:0,examples:[]};x.count++;if(x.examples.length<100)x.examples.push(value);};
 for(const r of rows){const old=byPath.get(r.path);if(!old)add('new_folders',r.path);else{
   const files=new Map(old.files.map(f=>[f.name,f]));for(const f of r.files){const o=files.get(f.name);if(!o||o.size_bytes!==f.size_bytes||o.modified_at!==f.modified_at||o.sha256&&f.sha256&&o.sha256!==f.sha256)add('changed_files',path.posix.join(r.path,f.name));files.delete(f.name);}for(const f of files.keys())add('not_observed_files',path.posix.join(r.path,f));
 }byPath.delete(r.path);}
 for(const r of byPath.values())add('not_observed_folders',r.path);
 return report;
}
async function run(rootArg,storeArg,{dryRun=false,hash=false,label}={}){
 const root=await fs.realpath(rootArg);let store=path.resolve(storeArg),ancestor=store,tail=[];
 while(!await exists(ancestor)){tail.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}store=path.join(await fs.realpath(ancestor),...tail);
 if(!(await fs.stat(root)).isDirectory())throw Error('Source must be a directory');
 if(inside(root,store))throw Error('Source cannot be inside the local store');
 await outsideGit(store);await outsideGit(root,'Selected root');
 const db=await readStore(store),at=new Date().toISOString(),folders=[],errors=[];let errorCount=0;
 const error=(p,op,e)=>{errorCount++;if(errors.length<100)errors.push({path:p,operation:op,error:e.code||e.message});};
 const original=await text(path.join(root,'_INDEX.md'));
 const existing=db.sources.find(s=>s.last_known_location===root);
 const rootId=field(original,'id')||existing?.root_folder_id||crypto.randomUUID();
 if(typeof rootId!=='string')throw Error('Invalid root folder ID');
 const sourceId=sha(rootId+'\0'+root).slice(0,20),prevEntry=db.sources.find(s=>s.source_id===sourceId);
 const previous=await loadFolders(store,prevEntry),prevByPath=new Map(previous.map(r=>[r.path,r]));
 const scopedContext=annotations(original);
 const vocab=await readVocab(store);
 const approvals=await readPrivacyApprovals(store);
 const approvedSet=new Set((approvals.approvals[sourceId]||[]));
 async function walk(abs,rel,parentId,inherited,labels){
  let entries;try{entries=await fs.readdir(abs,{withFileTypes:true});}catch(e){error(rel,'list',e);return;}
  entries.sort((a,b)=>a.name.localeCompare(b.name));
  let legacy='';try{legacy=rel==='.'?original:await text(path.join(abs,'_INDEX.md'));}catch(e){error(rel,'read-existing-note',e);}
  const old=prevByPath.get(rel),id=rel==='.'?rootId:field(legacy,'id')||old?.id||crypto.randomUUID();
  const context=scopedContext.has(rel)?scopedContext.get(rel):ownContext(legacy)||old?.context||'';
  const carried={origin_labels:old?.carried_context?.origin_labels||[...labels,path.basename(abs)],confirmed_context:[...inherited]};
  const chain=[...inherited];if(context)chain.push({source_id:id,source_title:path.basename(abs),text:context});
  const rec={id,kind:'folder',parent_id:parentId,path:rel,name:path.basename(abs),description:scopedContext.has(rel)?context:field(legacy,'summary')||context.split('\n\n')[0]||old?.description||'',context,carried_context:carried,children:[],files:[],skipped:[]};
  // tags from controlled vocabulary and status/date inference
  const words=[...new Set([...(rel==='.'?[]:rel.split('/')),path.basename(abs)].map(s=>s.toLowerCase()))];
  const tagPick=tagsFromVocab(vocab,words);
  if(tagPick.subject.length)rec.subject=tagPick.subject;
  if(tagPick.place.length)rec.place=tagPick.place;
  rec.status=field(legacy,'status')||old?.status||'raw';
  const dateGuess=inferDateFromNames(path.basename(abs),[]);
  if(dateGuess){rec.date=dateGuess.date;rec.date_confidence=dateGuess.confidence;}
  folders.push(rec);
  for(const ent of entries){if(ent.name==='_INDEX.md')continue;const dest=path.join(abs,ent.name);
   if(ent.name.startsWith('.')||SKIP.has(ent.name)||generated.test(ent.name)||/\.(?:app|photoslibrary|lrdata|lrlibrary)$/i.test(ent.name)||inside(dest,store)){rec.skipped.push({name:ent.name,reason:'system, dependency, generated output, package, or local store'});continue;}
   if(ent.isSymbolicLink()){rec.skipped.push({name:ent.name,reason:'symbolic link; not followed'});continue;}
   if(ent.isDirectory()){
     const relative=rel==='.'?ent.name:rel+'/'+ent.name;
     const sensitive=looksSensitiveFolder(ent.name)&&!approvedSet.has(relative);
     if(sensitive){rec.skipped.push({name:ent.name,reason:'privacy-sensitive; requires approval'});continue;}
     rec.children.push(ent.name);await walk(dest,relative,id,chain,carried.origin_labels);
   }
   else if(ent.isFile()){
     try{
       const st=await fs.lstat(dest);if(!st.isFile()||st.isSymbolicLink())throw Error('Entry changed during scan');
       let fileRec={name:ent.name,kind:'file',extension:path.extname(ent.name).toLowerCase(),size_bytes:st.size,modified_at:st.mtime.toISOString()};
       const sensitiveName=isNameSensitive(ent.name);
       const bank=recognizeBankStatement(ent.name);
       const inv=recognizeInvoice(ent.name);
       if(sensitiveName||bank){const r=redactFilename(ent.name);fileRec={...fileRec,name:r.name,redacted:true};if(bank)fileRec.observed_as=bank;}
       else if(inv){fileRec.observed_as=inv;}
       rec.files.push(fileRec);
     }catch(e){error(path.posix.join(rel,ent.name),'stat',e);}
   }
  }
 }
 await walk(root,'.',null,[],[]);if(!folders.length)throw Error('Root could not be indexed');
 if(hash){const sizes=new Map();for(const r of folders)for(const f of r.files){if(!sizes.has(f.size_bytes))sizes.set(f.size_bytes,[]);sizes.get(f.size_bytes).push([r,f]);}for(const group of sizes.values())if(group.length>1)for(const [r,f]of group)try{f.sha256=await digest(path.join(root,r.path,f.name));}catch(e){error(path.posix.join(r.path,f.name),'hash',e);}}
 const present=new Set(folders.map(r=>r.path));
 const unobserved=previous.filter(r=>!present.has(r.path)).map(r=>({...r,last_location_verified_at:r.last_location_verified_at||prevEntry.snapshot_at,location_status:'not-observed; last-known only'}));
 const changes=changeReport(previous,folders);
 const source={source_id:sourceId,root_folder_id:rootId,label:label||mountLabel(root)+' / '+path.basename(root),last_known_location:root,last_location_verified_at:at,location_status:'verified',snapshot_at:at,coverage:errorCount?'partial':'complete-with-exclusions',errors,error_count:errorCount,changes,conflicts:[]};
 const byID=new Map();for(const r of folders){if(!byID.has(r.id))byID.set(r.id,[]);byID.get(r.id).push(r.path);}source.conflicts=[...byID.entries()].filter(([,p])=>p.length>1).slice(0,100).map(([id,paths])=>({type:'shared-folder-id',id,paths:paths.slice(0,100)}));
 const summary={root,store,source_id:sourceId,folders:folders.length,files:folders.reduce((n,r)=>n+r.files.length,0),errors,error_count:errorCount,changes,dry_run:dryRun};
 const rootRec={...folders[0],original_note:original};const rootBody=noteFor(rootRec,new Map(folders.map(r=>[r.path,r])),at);
 if(dryRun)return summary;
 await fs.mkdir(store,{recursive:true});const lock=path.join(store,'.index-lock');await fs.mkdir(lock).catch(()=>{throw Error('Index store is locked; inspect .index-lock before retrying');});
 try{
  const current=await readStore(store);if(JSON.stringify(current)!==JSON.stringify(db))throw Error('Store changed during scan; rerun');
  if(await text(path.join(root,'_INDEX.md'))!==original)throw Error('Root note changed during scan; rerun');
  const manifest=await migrate(store,current);
  await atomic(path.join(root,'_INDEX.md'),rootBody);
  const prior=manifest.sources.find(s=>s.source_id===sourceId);
  const entry=await writeSource(store,source,[...folders,...unobserved],prior?.latest||null);
  manifest.sources=manifest.sources.filter(s=>s.source_id!==sourceId);manifest.sources.push(entry);manifest.updated_at=at;
  await atomic(path.join(store,'index.json'),json(manifest));
  await ensureObsidianConfig(store);
  await prune(store,entry);
  if(!await exists(path.join(store,'.gitignore')))await fs.writeFile(path.join(store,'.gitignore'),'*\n',{flag:'wx'});
  summary.coverage=source.coverage;summary.latest=refPath(store,entry.latest);summary.previous=entry.previous?refPath(store,entry.previous):null;
 }finally{await fs.rmdir(lock);}
 return summary;
}
async function find(store,terms){
 const db=await readStore(store),matches=[];
 for(const entry of db.sources){let match;
  for await(const r of parts(store,entry)){
   if(r.file_part===0)match={source:entry.label,path:path.join(entry.last_known_location,r.path),folder_id:r.id,last_location_verified_at:r.last_location_verified_at||entry.last_location_verified_at,status:r.location_status||'last-known; check availability',description:r.description,matching_files:[],hits:terms.map(()=>false)};
   const hay=JSON.stringify(r).toLowerCase();match.hits=match.hits.map((h,i)=>h||hay.includes(terms[i]));
   for(const f of r.files)if(terms.some(t=>f.name.toLowerCase().includes(t))&&match.matching_files.length<100)match.matching_files.push(f.name);
   if(r.file_part===r.file_parts-1&&match.hits.every(Boolean)){const {hits,...result}=match;matches.push(result);}
  }
 }
 return {matches,scope:'All recorded sources; last-known locations require live verification.'};
}
async function review(store){
 const db=await readStore(store),sources=[];
 // Optional cross-source review holds the selected inventories in memory; normal search is chunked.
 for(const e of db.sources){const d=await descriptor(store,e);sources.push({...e,conflicts:d.conflicts||[],folders:(await loadFolders(store,e)).filter(r=>!r.location_status?.startsWith('not-observed'))});}
 // Folder-signature matches (potential moves or duplicates across sources)
 const bySig=new Map();
 for(const s of sources)for(const r of s.folders){const k=r.signature?.sha256; if(!k)continue; const row={source:s.label,source_id:s.source_id,path:path.join(s.last_known_location,r.path),folder_id:r.id,signature:k}; if(!bySig.has(k))bySig.set(k,[]); bySig.get(k).push(row);}
 const identical_folders=[...bySig.values()].filter(g=>g.length>1);
 return {candidate_duplicates:candidates(sources),identical_content:hashMatches(sources),identical_folders,conflicts:sources.flatMap(s=>(s.conflicts||[]).map(c=>({source:s.label,...c}))),note:'Candidates only; verify live locations, dependencies, and backup intent before proposing changes.'};
}
export {run,readStore,loadFolders,find,review,writeSource};
async function main(){
 const args=process.argv.slice(2),cmd=args.shift(),opts={},rest=[];
 let store=process.env.TECHISTACK_INDEX_STORE||path.join(os.homedir(),'Documents','Index');
 for(let i=0;i<args.length;i++){const a=args[i];if(a==='--store'||a==='--label'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+a);if(a==='--store')store=path.resolve(args[++i]);else opts.label=args[++i];}else if(a==='--dry-run')opts.dryRun=true;else if(a==='--hash')opts.hash=true;else if(a.startsWith('--'))throw Error('Unknown option '+a);else rest.push(a);}
 store=path.resolve(store);
 if(cmd==='run'){if(rest.length!==1)throw Error('run requires one folder');console.log(json(await run(path.resolve(rest[0]),store,opts)));}
 else if(cmd==='find'){if(!rest.length)throw Error('find requires search terms');console.log(json(await find(store,rest.map(x=>x.toLowerCase()))));}
 else if(cmd==='review')console.log(json(await review(store)));
 else if(cmd==='privacy'){
   const sub=rest.shift();
   if(sub==='approve'){
     if(rest.length<2)throw Error('privacy approve requires <root> <relative-path>');
     const root=path.resolve(rest[0]);const real=await fs.realpath(root);
     const original=await text(path.join(real,'_INDEX.md'));
     const rootId=field(original,'id')||crypto.randomUUID();
     const sourceId=sha(rootId+'\0'+real).slice(0,20);
     const approvals=await readPrivacyApprovals(store);approvals.approvals[sourceId]=approvals.approvals[sourceId]||[];
     const rel=rest[1];if(path.isAbsolute(rel))throw Error('relative-path must be relative to the selected root');
     if(!approvals.approvals[sourceId].includes(rel))approvals.approvals[sourceId].push(rel);
     await writePrivacyApprovals(store,approvals);console.log(json({ok:true,approved:{source_id:sourceId,path:rel}}));
   }else if(sub==='list'){
     console.log(json(await readPrivacyApprovals(store)));
   }else throw Error('Usage: privacy approve <root> <relative-path> | privacy list');
 }
 else throw Error('Usage: index.mjs run <root> [--store <local folder>] [--dry-run] [--hash] [--label <name>] | find <terms...> [--store <folder>] | review [--store <folder>] | privacy approve <root> <relative-path> [--store <folder>] | privacy list [--store <folder>]');
}
const invokedPath=process.argv[1]?await fs.realpath(process.argv[1]).catch(()=>null):null;
if(invokedPath&&invokedPath===await fs.realpath(fileURLToPath(import.meta.url)))main().catch(e=>{console.error('index: '+e.message);process.exitCode=1;});
