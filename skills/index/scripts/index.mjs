#!/usr/bin/env node
/** Manual folder indexer. No network, scheduler, moves, or source-content editing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const START='<!-- techistack:index:start -->', END='<!-- techistack:index:end -->';
const CARRY=/<!-- techistack:carry (.*?) -->/;
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
function ownContext(note){const outside=note.replace(new RegExp(START+'[\\s\\S]*?'+END),'');return outside.match(/^## Context\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim()||'';}
function metadata(note,values){
 if(note && !note.startsWith('---\n')&&!note.startsWith('---\r\n'))return note; // never reinterpret arbitrary prose as YAML
 const match=note.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(note&&!match)throw Error('Unclosed frontmatter');
 let fm=match?.[1]||'';
 for(const [k,v] of Object.entries(values)){const line=k+': '+JSON.stringify(v);const re=new RegExp('^'+k+':.*$','m');fm=re.test(fm)?fm.replace(re,()=>line):fm+'\n'+line;}
 return '---\n'+fm.trim()+'\n---\n'+(match?note.slice(match[0].length):'');
}
function carryOf(note){const m=note.match(CARRY);if(!m)return null;try{return JSON.parse(m[1]);}catch{throw Error('Invalid portable context marker; preserve and repair before indexing');}}
function mountLabel(root){const parts=root.split(path.sep);return parts[1]==='Volumes'?parts[2]:os.hostname();}
function fileSummary(files){const c={};for(const f of files)c[f.extension||'(no extension)']=(c[f.extension||'(no extension)']||0)+1;return Object.entries(c).map(([x,n])=>`${n} ${x}`).join(', ')||'No files directly here';}
function tree(rec,byPath,depth=2,limit=80){const lines=[rec.name+'/'];let clipped=false;function visit(r,prefix,d){if(d>=depth){if(r.children.length)lines.push(prefix+'└── … deeper folders; use the links below');return;}r.children.forEach((name,i)=>{if(lines.length>=limit){clipped=true;return;}const last=i===r.children.length-1;lines.push(prefix+(last?'└── ':'├── ')+clean(name)+'/');const child=byPath.get(r.path==='.'?name:r.path+'/'+name);if(child)visit(child,prefix+(last?'    ':'│   '),d+1);});}visit(rec,'',0);if(clipped)lines.push('… overview shortened; full directory is in the local snapshot');return lines.join('\n');}
function managed(rec,byPath,at){
 const carry=JSON.stringify(rec.carried_context).replace(/</g,'\\u003c');
 let s=`${START}\n<!-- techistack:carry ${carry} -->\n\n## Folder map\n\n\`\`\`text\n${tree(rec,byPath)}\n\`\`\`\n\nChecked: **${at}** · files listed directly here: **${rec.files.length}** · subfolders: **${rec.children.length}**.\n\n`;
 s+='### Context that travels with this folder\n\n';
 s+='Folder-name clues from its original hierarchy: '+rec.carried_context.origin_labels.map(clean).join(' → ')+'. These labels are clues, not verified subject descriptions.\n\n';
 for(const c of rec.carried_context.confirmed_context)s+=`- Context recorded in ${clean(c.source_title)}: ${c.text}\n`;
 s+='\n';
 if(rec.children.length){s+='### Subfolders\n\n| Folder | Recorded summary / direct file types |\n|---|---|\n';for(const name of rec.children){const c=byPath.get(rec.path==='.'?name:rec.path+'/'+name);s+=`| [${clean(name)}](${href(name)}/_INDEX.md) | ${clean(c?.description||fileSummary(c?.files||[]))} |\n`;}}
 s+='\n### Files\n\n'+fileSummary(rec.files)+'.\n\n';
 if(rec.files.length){s+='<details>\n<summary>All direct filenames and sizes</summary>\n\n| File | Type | Bytes |\n|---|---|---|\n';for(const f of rec.files)s+=`| [${clean(f.name)}](${href(f.name)}) | ${clean(f.extension||'unknown')} | ${f.size_bytes??'unreadable'} |\n`;s+='\n</details>\n';}
 if(rec.skipped.length){const counts={};for(const x of rec.skipped)counts[x.reason]=(counts[x.reason]||0)+1;s+='\nExcluded entries: '+Object.entries(counts).map(([reason,n])=>`${n} (${clean(reason)})`).join('; ')+'. The local JSON records individual excluded names.\n';}
 return s+'\n'+END;
}
function noteFor(rec,byPath,at){
 let n=rec.original_note;
 const values={id:rec.id,index_updated_at:at,generated_inventory_at:at};
 if(!n){n=metadata('',{schema:'techistack-index/v2',id:rec.id,index_created_at:at,title:rec.name})+`\n# ${clean(rec.name)}\n\n## Context\n\n## Notes\n\n`;}
 else if(!field(n,'id')){
   if(n.startsWith('---'))n=metadata(n,{id:rec.id});
   else n=`---\nschema: techistack-index/v2\nid: ${JSON.stringify(rec.id)}\nindex_created_at: ${JSON.stringify(at)}\n---\n\n`+n;
 }
 n=metadata(n,values);
 const block=managed(rec,byPath,at), a=n.indexOf(START), b=n.indexOf(END);
 if((a<0)!==(b<0)||a>=0&&b<a||a>=0&&n.indexOf(START,a+1)>=0)throw Error('Ambiguous generated block: '+rec.path);
 if(a>=0)return n.slice(0,a)+block+n.slice(b+END.length);
 // New notes show the map before human-editable sections. Existing prose stays intact.
 if(!rec.original_note){const pos=n.indexOf('\n## Context');return n.slice(0,pos)+'\n\n'+block+'\n'+n.slice(pos);}
 return n.trimEnd()+'\n\n'+block+'\n';
}
async function digest(p){const h=crypto.createHash('sha256');const f=await fs.open(p,'r');try{for await(const chunk of f.createReadStream())h.update(chunk);return h.digest('hex');}finally{await f.close().catch(()=>{});}}
async function atomic(p,body){if(await exists(p)){const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Refuse to replace non-regular file: '+p);}const tmp=p+'.index-tmp-'+crypto.randomUUID();await fs.writeFile(tmp,body,{flag:'wx'});await fs.rename(tmp,p);}
async function outsideGit(store){for(let p=store;;p=path.dirname(p)){if(await exists(path.join(p,'.git')))throw Error('Local index store must be outside a Git working tree: '+store);if(path.dirname(p)===p)break;}}
async function readStore(store){const s=await text(path.join(store,'index.json'));if(!s)return {schema:SCHEMA,sources:[]};const d=JSON.parse(s);if(d.schema!==SCHEMA||!Array.isArray(d.sources))throw Error('Unrecognized index.json; refusing to overwrite');return d;}
function candidates(sources){const groups=new Map();for(const s of sources)for(const r of s.folders)for(const f of r.files){if(f.kind!=='file'||f.size_bytes==null)continue;const k=f.name.toLowerCase()+'\0'+f.size_bytes;if(!groups.has(k))groups.set(k,[]);groups.get(k).push({source_id:s.source_id,folder_id:r.id,path:path.join(s.last_known_location,r.path,f.name),sha256:f.sha256||null});}return [...groups.values()].map(g=>[...new Map(g.map(x=>[x.path,x])).values()]).filter(x=>x.length>1);}
function hashMatches(sources){const groups=new Map();for(const s of sources)for(const r of s.folders)for(const f of r.files){if(!f.sha256)continue;const entry={source_id:s.source_id,path:path.join(s.last_known_location,r.path,f.name)};if(!groups.has(f.sha256))groups.set(f.sha256,[]);groups.get(f.sha256).push(entry);}return [...groups.entries()].map(([sha256,g])=>({sha256,locations:[...new Map(g.map(x=>[x.path,x])).values()]})).filter(g=>g.locations.length>1);}
function snapshotMD(source){let s=`# ${clean(source.label)} — index snapshot\n\nTaken: ${source.snapshot_at}\n\nLast-known root: ${source.last_known_location}\n\nCoverage: ${source.coverage}; ${source.folders.length} folders; ${source.errors.length} errors. Availability must be checked again when answering a later query.\n\n`;
 const byPath=new Map(source.folders.map(r=>[r.path,r]));s+='```text\n'+tree(source.folders[0],byPath,3,120)+'\n```\n\n## Folder directory\n\n';
 for(const r of source.folders){s+=`### ${clean(r.path)}\n\n${r.description||fileSummary(r.files)}\n\nFolder ID: ${r.id}\n\n[Open folder note](${pathToFileURL(path.join(source.last_known_location,r.path,'_INDEX.md')).href})\n\n`;
 s+='Original hierarchy: '+r.carried_context.origin_labels.map(clean).join(' → ')+'.\n\n';for(const c of r.carried_context.confirmed_context)s+=`${c.text}\n\n`;if(r.context)s+=r.context+'\n\n';
 for(const f of r.files)s+=`- ${clean(f.name)} — ${f.extension||'unknown type'}, ${f.size_bytes??'unknown'} bytes\n`;s+='\n';}
 if(source.unobserved_folders?.length){s+='\n## Previously recorded, not observed in this pass\n\n';for(const r of source.unobserved_folders)s+=`- ${clean(r.path)} — last verified ${r.last_location_verified_at}; ${clean(r.description||r.context||r.carried_context.origin_labels.join(' / '))}\n`;}
 return s;
}
async function run(rootArg,storeArg,{dryRun=false,hash=false,label}={}){
 const root=await fs.realpath(rootArg);
 let store=path.resolve(storeArg), ancestor=store, tail=[];
 while(!await exists(ancestor)){tail.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}
 store=path.join(await fs.realpath(ancestor),...tail);
 if(!(await fs.stat(root)).isDirectory())throw Error('Source must be a directory');
 if(inside(root,store))throw Error('Source cannot be the local index store or a folder inside it');
 await outsideGit(store);
 if(await exists(path.join(root,'.git')))throw Error('Source is a Git working tree; use a plain archive copy to keep personal notes out of commits');
 const at=new Date().toISOString(), folders=[], errors=[];
 async function walk(abs,rel,inherited,labels){
  let entries;try{entries=await fs.readdir(abs,{withFileTypes:true});}catch(e){errors.push({path:rel,operation:'list',error:e.code});return;}
  entries.sort((a,b)=>a.name.localeCompare(b.name));
  let original='';try{original=await text(path.join(abs,'_INDEX.md'));}catch(e){errors.push({path:rel,operation:'read-note',error:e.message});return;}
  const id=field(original,'id')||crypto.randomUUID();if(typeof id!=='string')throw Error('Invalid folder ID: '+rel);
  const context=ownContext(original), contextChain=[...inherited];if(context)contextChain.push({source_id:id,source_title:path.basename(abs),text:context});
  const oldCarry=carryOf(original);
  const carried={origin_labels:oldCarry?.origin_labels||[...labels,path.basename(abs)],confirmed_context:[...(oldCarry?.confirmed_context||[])]};
  // Refresh context from still-present ancestors; preserve earlier context after moves.
  for(const c of inherited){const i=carried.confirmed_context.findIndex(x=>x.source_id===c.source_id);if(i<0)carried.confirmed_context.push(c);else carried.confirmed_context[i]=c;}
  const rec={id,path:rel,name:path.basename(abs),description:field(original,'summary')||context.split('\n\n')[0]||'',context,carried_context:carried,children:[],files:[],skipped:[],original_note:original};folders.push(rec);
  for(const ent of entries){if(ent.name==='_INDEX.md')continue;const dest=path.join(abs,ent.name);
   if(ent.name.startsWith('.')||SKIP.has(ent.name)||generated.test(ent.name)||/\.(?:app|photoslibrary|lrdata|lrlibrary)$/i.test(ent.name)||inside(dest,store)){rec.skipped.push({name:ent.name,reason:'system, dependency, generated output, package, or local store'});continue;}
   if(ent.isSymbolicLink()){rec.skipped.push({name:ent.name,reason:'symbolic link; not followed'});continue;}
   if(ent.isDirectory()){if(await exists(path.join(dest,'.git'))){rec.skipped.push({name:ent.name,reason:'Git working tree; personal notes are excluded by default'});continue;}rec.children.push(ent.name);await walk(dest,rel==='.'?ent.name:rel+'/'+ent.name,contextChain,carried.origin_labels);}
   else if(ent.isFile()){try{const st=await fs.lstat(dest);if(!st.isFile()||st.isSymbolicLink())throw Error('Entry changed during scan');rec.files.push({name:ent.name,kind:'file',extension:path.extname(ent.name).toLowerCase(),size_bytes:st.size,modified_at:st.mtime.toISOString()});}catch(e){errors.push({path:path.join(rel,ent.name),operation:'stat',error:e.code||e.message});}}
  }
 }
 await walk(root,'.',[],[]);if(!folders.length)throw Error('Root could not be indexed');
 const sourceId=sha(folders[0].id+'\0'+root).slice(0,20);
 if(hash){const sizes=new Map();for(const r of folders)for(const f of r.files){if(!sizes.has(f.size_bytes))sizes.set(f.size_bytes,[]);sizes.get(f.size_bytes).push([r,f]);}for(const group of sizes.values())if(group.length>1)for(const [r,f]of group){try{f.sha256=await digest(path.join(root,r.path,f.name));}catch(e){errors.push({path:path.join(r.path,f.name),operation:'hash',error:e.code||e.message});}}}
 const db=await readStore(store), previous=db.sources.find(s=>s.source_id===sourceId);
 const oldFolders=new Map([...(previous?.unobserved_folders||[]),...(previous?.folders||[])].map(r=>[r.id,r]));
 const changes={new_folders:[],relocated_or_copied_folders:[],not_observed_folders:[],changed_files:[],not_observed_files:[]};
 for(const r of folders){const before=oldFolders.get(r.id);if(!before)changes.new_folders.push(r.path);else{if(before.path!==r.path)changes.relocated_or_copied_folders.push({id:r.id,from:before.path,to:r.path});const oldFiles=new Map(before.files.map(f=>[f.name,f]));for(const f of r.files){const old=oldFiles.get(f.name);if(!old||old.size_bytes!==f.size_bytes||old.modified_at!==f.modified_at||old.sha256&&f.sha256&&old.sha256!==f.sha256)changes.changed_files.push(path.join(r.path,f.name));oldFiles.delete(f.name);}for(const name of oldFiles.keys())changes.not_observed_files.push(path.join(before.path,name));}oldFolders.delete(r.id);}
 for(const r of oldFolders.values())changes.not_observed_folders.push({id:r.id,path:r.path});
 const byPath=new Map(folders.map(r=>[r.path,r])), writes=[];
 for(const r of folders){try{writes.push({r,body:noteFor(r,byPath,at)});}catch(e){errors.push({path:r.path,operation:'prepare-note',error:e.message});}}
 const unobserved=[...oldFolders.values()].map(r=>({...r,last_location_verified_at:r.last_location_verified_at||previous?.snapshot_at,location_status:'not-observed; last-known only'}));
 const source={unobserved_folders:unobserved,previous_snapshot:previous?.snapshot_file||null,source_id:sourceId,root_folder_id:folders[0].id,label:label||mountLabel(root)+' / '+path.basename(root),last_known_location:root,last_location_verified_at:at,location_status:'verified',snapshot_at:at,coverage:errors.length?'partial':'complete-with-exclusions',errors,changes,folders:folders.map(({original_note,...r})=>r)};
 const summary={root,store,source_id:sourceId,folders:folders.length,files:folders.reduce((n,r)=>n+r.files.length,0),errors,changes,dry_run:dryRun};
 if(dryRun)return summary;
 await fs.mkdir(store,{recursive:true});
 // Serialize writers; no forced recovery of an existing lock.
 const lock=path.join(store,'.index-lock');await fs.mkdir(lock).catch(()=>{throw Error('Index store is locked; inspect .index-lock before retrying');});
 try{
  const current=await readStore(store);if(JSON.stringify(current)!==JSON.stringify(db))throw Error('Store changed during scan; rerun');
  if(await exists(path.join(store,'INDEX.md'))){const old=await text(path.join(store,'INDEX.md'));if(!old.includes('<!-- techistack:local-index -->'))throw Error('Existing INDEX.md is not generated by this indexer');}
  for(const {r,body}of writes){const dest=path.join(root,r.path,'_INDEX.md');try{if(await text(dest)!==r.original_note)throw Error('Note changed during scan');await atomic(dest,body);}catch(e){errors.push({path:r.path,operation:'write-note',error:e.message});}}
  source.coverage=errors.length?'partial':'complete-with-exclusions';source.errors=errors;
  current.sources=current.sources.filter(s=>s.source_id!==sourceId);current.sources.push(source);current.updated_at=at;
  const sameIds=new Map();for(const r of source.folders){if(!sameIds.has(r.id))sameIds.set(r.id,[]);sameIds.get(r.id).push(r.path);}
  source.conflicts=[...sameIds.entries()].filter(([,p])=>p.length>1).map(([id,paths])=>({type:'shared-folder-id',id,paths,meaning:'possible copies; not proof of backup completeness'}));
  const stamp=at.replace(/[:.]/g,'-'), stem=sourceId+'-'+stamp;
  await fs.mkdir(path.join(store,'snapshots'),{recursive:true});
  await fs.writeFile(path.join(store,'snapshots',stem+'.json'),json(source),{flag:'wx'});
  await fs.writeFile(path.join(store,'snapshots',stem+'.md'),snapshotMD(source),{flag:'wx'});
  source.snapshot_file='snapshots/'+stem+'.md';
  await atomic(path.join(store,'index.json'),json(current));
  const duplicates=candidates(current.sources);
  let md='<!-- techistack:local-index -->\n# Local archive index\n\nLast updated: '+at+'\n\nThese are last-known locations from manual snapshots. Check accessibility and verification dates when searching; unavailable roots are not empty roots. Detailed searchable inventory: `index.json`.\n\n| Source | Last snapshot | Coverage | Root (last known) |\n|---|---|---|---|\n';
  for(const s of current.sources)md+=`| [${clean(s.label)}](${s.snapshot_file||'#'}) | ${s.snapshot_at} | ${s.coverage} | ${clean(s.last_known_location)} |\n`;
  if(await exists(path.join(store,'legacy-brain-snapshot.md')))md+='\n[Earlier manually collected location hints](legacy-brain-snapshot.md) — legacy metadata; check its dates and coverage.\n';
  md+='\n## Optional review\n\n'+duplicates.length+' groups share a filename and size across recorded locations. They are candidates, not verified duplicates; some may be stale locations. Run `review` for details. An agent may suggest organization improvements after reviewing context. No files are moved or deleted by this tool.\n';
  await atomic(path.join(store,'INDEX.md'),md);
  if(!await exists(path.join(store,'.gitignore')))await fs.writeFile(path.join(store,'.gitignore'),'*\n',{flag:'wx'});
  summary.snapshot=path.join(store,source.snapshot_file);summary.candidate_groups=duplicates.length;summary.coverage=source.coverage;
 }finally{await fs.rmdir(lock);}
 return summary;
}
export {run};
async function main(){const args=process.argv.slice(2),cmd=args.shift();const opts={};let store=path.join(os.homedir(),'Documents','Index'),rest=[];for(let i=0;i<args.length;i++){const a=args[i];if(a==='--store'||a==='--label'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+a);if(a==='--store')store=path.resolve(args[++i]);else opts.label=args[++i];}else if(a==='--dry-run')opts.dryRun=true;else if(a==='--hash')opts.hash=true;else if(a.startsWith('--'))throw Error('Unknown option '+a);else rest.push(a);}
 if(cmd==='run'){if(rest.length!==1)throw Error('run requires one folder');console.log(json(await run(path.resolve(rest[0]),store,opts)));}
 else if(cmd==='find'){if(!rest.length)throw Error('find requires search terms');const db=await readStore(store),terms=rest.map(x=>x.toLowerCase());const matches=[];for(const s of db.sources)for(const r of [...s.folders,...(s.unobserved_folders||[])]){const hay=JSON.stringify(r).toLowerCase();if(terms.every(t=>hay.includes(t)))matches.push({source:s.label,path:path.join(s.last_known_location,r.path),folder_id:r.id,last_location_verified_at:r.last_location_verified_at||s.last_location_verified_at,status:r.location_status||'last-known; check availability',description:r.description,matching_files:r.files.filter(f=>terms.some(t=>f.name.toLowerCase().includes(t))).map(f=>f.name)});}console.log(json({matches,scope:'All recorded sources, including potentially disconnected or stale roots. No live verification performed.'}));}
 else if(cmd==='review'){const db=await readStore(store);console.log(json({candidate_duplicates:candidates(db.sources),identical_content:hashMatches(db.sources),conflicts:db.sources.flatMap(s=>(s.conflicts||[]).map(c=>({source:s.label,...c}))),note:'Candidates only. Verify live copies, references, and backup intent before proposing changes. This command writes nothing.'}));}
 else throw Error('Usage: index.mjs run <folder> [--store <local folder>] [--dry-run] [--hash] [--label <name>] | find <terms...> [--store <folder>] | review [--store <folder>]');
}
if(process.argv[1]&&await fs.realpath(process.argv[1])===await fs.realpath(fileURLToPath(import.meta.url)))main().catch(e=>{console.error('index: '+e.message);process.exitCode=1;});
