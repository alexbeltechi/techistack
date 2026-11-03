import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {run,readStore,loadFolders,find,review,writeSource} from '../skills/index/scripts/index.mjs';
const tmp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ts-root-index-')));
try{
 const root=path.join(tmp,'archive'),store=path.join(tmp,'store');
 await fs.mkdir(path.join(root,'Catalog','Model'),{recursive:true});await fs.mkdir(path.join(root,'Cabin'),{recursive:true});
 await fs.writeFile(path.join(root,'_INDEX.md'),'---\nid: "archive-stable"\n---\n# Archive\n\n## Context\n\nBicycle archive.\n\n## Folder context\n\n### Catalog\n\nBicycle catalog, confirmed by the owner.\n\n## Notes\n\nKeep this sentence.\n');
 for(const name of ['Catalog/Model/manual.pdf','Cabin/manual.pdf','Cabin/renamed.pdf'])await fs.writeFile(path.join(root,name),'fake PDF fixture');
 const original=await fs.readFile(path.join(root,'_INDEX.md'),'utf8');
 const dry=await run(root,store,{dryRun:true});assert.equal(dry.folders,4);await assert.rejects(fs.stat(store));assert.equal(await fs.readFile(path.join(root,'_INDEX.md'),'utf8'),original);
 await run(root,store,{hash:true});
 let db=await readStore(store);assert.equal(db.schema,'techistack-local-index/v2');assert(!db.sources[0].folders);assert((await fs.stat(path.join(store,'index.json'))).size<5000);
 let rows=await loadFolders(store,db.sources[0]);const model=rows.find(r=>r.name==='Model');assert(model.carried_context.confirmed_context.some(c=>c.text.includes('Bicycle catalog')));assert(model.parent_id);assert(model.files[0].sha256);
 for(const rel of ['Catalog','Catalog/Model','Cabin'])await assert.rejects(fs.stat(path.join(root,rel,'_INDEX.md')));
 await assert.rejects(fs.stat(path.join(store,'INDEX.md')));
 const note=await fs.readFile(path.join(root,'_INDEX.md'),'utf8');assert(note.includes('Keep this sentence.'));assert(note.includes('id: "archive-stable"'));assert(!note.includes('Catalog/_INDEX.md'));assert(note.includes('Catalog/Model/'));
 // Wiki graph: folders only, not files
 assert(note.includes('### Wiki graph'));
 assert(note.includes('[[Catalog/_INDEX]]'));
 assert(!/\[\[[^\]]+\.(?:jpg|jpeg|png|pdf|docx)\]\]/i.test(note));
 assert(note.trimEnd().endsWith('<!-- techistack:credit:end -->'));
 assert.equal(note.split('Created with [TechiStack /index](https://github.com/alexbeltechi/techistack).').length-1,1);
 await fs.appendFile(path.join(root,'_INDEX.md'),'\nUser note added after the existing footer.\n');
 const rev=await review(store);assert.equal(rev.candidate_duplicates.length,1);assert.equal(rev.identical_content[0].locations.length,3);
 await run(root,store,{});
 const refreshed=await fs.readFile(path.join(root,'_INDEX.md'),'utf8');assert(refreshed.includes('User note added after the existing footer.'));assert(refreshed.trimEnd().endsWith('<!-- techistack:credit:end -->'));assert.equal(refreshed.split('Created with [TechiStack /index]').length-1,1);
 db=await readStore(store);rows=await loadFolders(store,db.sources[0]);assert.equal(rows.find(r=>r.path==='Catalog/Model').id,model.id);assert(db.sources[0].previous);
 // A root-only layout cannot prove the identity of a moved child. Preserve its previous location.
 await fs.rename(path.join(root,'Catalog','Model'),path.join(tmp,'offline-model'));await run(root,store,{});
 db=await readStore(store);const matches=(await find(store,['bicycle','catalog'])).matches;assert(matches.some(m=>m.folder_id===model.id&&m.status.includes('not-observed')));
 const sourceDir=path.join(store,'sources',db.sources[0].source_id);
 assert.equal((await fs.readdir(sourceDir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).length,2);
 assert.equal(await fs.readFile(path.join(tmp,'offline-model','manual.pdf'),'utf8'),'fake PDF fixture');
 const other=path.join(tmp,'other');await fs.mkdir(other);await fs.writeFile(path.join(other,'document.docx'),'fixture');await run(other,store,{});db=await readStore(store);assert.equal(db.sources.length,2);
 // Nested repositories are inventoried without writing inside them; internals/dependencies are excluded.
 await fs.mkdir(path.join(root,'Project','.git'),{recursive:true});await fs.mkdir(path.join(root,'Project','node_modules'),{recursive:true});await fs.writeFile(path.join(root,'Project','source.ts'),'fixture');await fs.writeFile(path.join(root,'Project','node_modules','cache'),'fixture');await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));assert(rows.some(r=>r.path==='Project'&&r.files.some(f=>f.name==='source.ts')));assert(!rows.some(r=>r.path.includes('node_modules')));await assert.rejects(fs.stat(path.join(root,'Project','_INDEX.md')));await assert.rejects(run(path.join(root,'Project'),store,{}));
 // Legacy v1 inventories migrate without losing IDs or human context, and preserve the old aggregate.
 const legacyStore=path.join(tmp,'legacy-store');await fs.mkdir(legacyStore);const latest=await readStore(store);const entry=latest.sources.find(s=>s.last_known_location===other);const legacyRows=await loadFolders(store,entry);
 await fs.writeFile(path.join(legacyStore,'index.json'),JSON.stringify({schema:'techistack-local-index/v1',sources:[{...entry,folders:legacyRows}]}));await fs.writeFile(path.join(legacyStore,'INDEX.md'),'<!-- techistack:local-index -->\n# Generated legacy overview');
 await run(other,legacyStore,{});const migrated=await readStore(legacyStore);assert.equal(migrated.schema,'techistack-local-index/v2');assert.equal((await loadFolders(legacyStore,migrated.sources[0]))[0].id,legacyRows[0].id);assert((await fs.readdir(path.join(legacyStore,'migrations'))).length);await assert.rejects(fs.stat(path.join(legacyStore,'INDEX.md')));
 // Chunk very large folder inventories; queries can match terms in different file parts.
 const bulk={...entry,source_id:'synthetic-bulk',label:'Synthetic bulk',last_known_location:'/synthetic/offline',snapshot_at:'2026-01-01T00:00:00Z'};
 const files=Array.from({length:4200},(_,i)=>({name:(i===0?'alpha-':i===4199?'omega-':'item-')+i+'x'.repeat(1500),kind:'file',extension:'.txt',size_bytes:i,modified_at:'2026-01-01T00:00:00Z'}));
 const bulkRow={id:'bulk-folder',path:'.',name:'bulk',files,children:[],skipped:[],context:'Synthetic fixture',description:'Synthetic large inventory',carried_context:{origin_labels:['bulk'],confirmed_context:[]}};
 const bulkEntry=await writeSource(store,bulk,[bulkRow]);const desc=JSON.parse(await fs.readFile(path.join(store,bulkEntry.latest)));assert(desc.folder_chunks.length>1);for(const ref of desc.folder_chunks)assert(ref.bytes<5*1024*1024);
 db=await readStore(store);db.sources.push(bulkEntry);await fs.writeFile(path.join(store,'index.json'),JSON.stringify(db));assert((await find(store,['alpha-','omega-'])).matches.some(m=>m.folder_id==='bulk-folder'));
 // Symlinked notes and Git stores are rejected; CLI works through an installed skill symlink.
 const linkRoot=path.join(tmp,'symlink-note');await fs.mkdir(linkRoot);await fs.symlink(path.join(other,'document.docx'),path.join(linkRoot,'_INDEX.md'));await assert.rejects(run(linkRoot,store,{}));
 const gitRoot=path.join(tmp,'git-root');await fs.mkdir(path.join(gitRoot,'.git'),{recursive:true});await assert.rejects(run(other,path.join(gitRoot,'store'),{}));
 const cli=new URL('../skills/index/scripts/index.mjs',import.meta.url).pathname;
 execFileSync(process.execPath,['--input-type=module','-'],{input:'await import('+JSON.stringify(new URL('../skills/index/scripts/index.mjs',import.meta.url).href)+');',encoding:'utf8'});
 const alias=path.join(tmp,'alias.mjs');await fs.symlink(cli,alias);assert(JSON.parse(execFileSync(process.execPath,[alias,'find','document','--store',store],{encoding:'utf8'})).matches.length);
 assert(JSON.parse(execFileSync(process.execPath,[alias,'find','document'],{encoding:'utf8',env:{...process.env,TECHISTACK_INDEX_STORE:store}})).matches.length);
 assert(JSON.parse(execFileSync(process.execPath,[alias,'find','document','--store',store],{encoding:'utf8',env:{...process.env,TECHISTACK_INDEX_STORE:path.join(tmp,'empty-store')}})).matches.length);
 // Privacy: sensitive detection with consent gating; names only redacted on real secrets
 await fs.writeFile(path.join(root,'2026-01 Extras de cont IBAN GB12 BARC 1234 5678 9012.pdf'),'x');
 await fs.mkdir(path.join(root,'Finance','Bank'),{recursive:true});await fs.writeFile(path.join(root,'Finance','Bank','passwords.txt'),'x');
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 const rootRow=rows.find(r=>r.path==='.');assert(rootRow.files.some(f=>f.name.startsWith('REDACTED')));
 // Token false-positives: Clothing/Lettering/Packaging/Extras/CapEx are not flagged
 for(const fname of ['Clothing','Lettering','Packaging','Extras','CapEx']){await fs.mkdir(path.join(root,fname),{recursive:true});}
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 for(const name of ['Clothing','Lettering','Packaging','Extras','CapEx']){const r=rows.find(r=>r.path===name); if(r) assert(!r.sensitivity);}
 // False positives not redacted
 await fs.writeFile(path.join(root,'Login screen v2.fig'),'x');await fs.writeFile(path.join(root,'Business card.ai'),'x');await fs.writeFile(path.join(root,'ID badge mockup.png'),'x');
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 const names=rows.find(r=>r.path==='.').files.map(f=>f.name);
 assert(names.includes('Login screen v2.fig')&&names.includes('Business card.ai')&&names.includes('ID badge mockup.png'));
 // Wiki graph and note gating reflect consent pending
 const note2=await fs.readFile(path.join(root,'_INDEX.md'),'utf8');assert(/flagged, awaiting consent/.test(note2));
 // Map generated in store, with Home hub, per-source hub, and per-folder notes named after folders
 const mapHub=await fs.readFile(path.join(store,'map','Home.md'),'utf8');assert(/Sources/.test(mapHub));
 const anySourceDir=(await fs.readdir(path.join(store,'map'))).find(n=>n!=='Home.md'&&n.endsWith('.md')===false);
 const anySourceHub=await fs.readFile(path.join(store,'map',`${anySourceDir}.md`),'utf8');assert(/Indexed:/.test(anySourceHub));
 // All wikilinks under map/ resolve to existing files
 async function collectLinks(dir){
   const links=[];for(const name of await fs.readdir(dir)){const p=path.join(dir,name);const st=await fs.lstat(p);if(st.isDirectory()){links.push(...await collectLinks(p));}else if(name.endsWith('.md')){const s=await fs.readFile(p,'utf8');for(const m of s.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)){links.push(m[1]);}}}
   return links;
 }
 const mapLinks=await collectLinks(path.join(store,'map'));
 for(const l of mapLinks){
   if(!l.startsWith('map/'))continue;
   const target=l.endsWith('.md')?l:`${l}.md`;
   await fs.stat(path.join(store,target));
 }
 // A per-folder note exists and has an Indexed line
 const someDir=path.join(store,'map',anySourceDir);
 async function findFirstMd(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name.endsWith('.md'))return p; if(e.isDirectory()){const q=await findFirstMd(p); if(q) return q;}} return null;}
 const someNotePath=await findFirstMd(someDir);
 const folderNote=await fs.readFile(someNotePath,'utf8');
 assert(/Indexed:/.test(folderNote));
 // Stale generated map notes for this source are pruned; user files without our schema stay
 const sourceDirName=(await fs.readdir(path.join(store,'map'))).find(n=>n!=='Home.md'&&!n.endsWith('.md'));
 const sourceLabel=JSON.parse((await fs.readFile(path.join(store,'map',`${sourceDirName}.md`),'utf8')).match(/^source: (.*)$/m)[1]);
 const stale=path.join(store,'map',sourceDirName,'GoneFolder','GoneFolder.md');
 await fs.mkdir(path.dirname(stale),{recursive:true});
 await fs.writeFile(stale,`---\nschema: "techistack-map-index/v1"\nsource: ${JSON.stringify(sourceLabel)}\ntitle: "GoneFolder"\n---\n# Gone\n`);
 const userKeep=path.join(store,'map','user-note.md');
 await fs.writeFile(userKeep,'# handwritten\n');
 await run(root,store,{});
 await assert.rejects(fs.readFile(stale,'utf8'));
 assert.equal(await fs.readFile(userKeep,'utf8'),'# handwritten\n');
 // .obsidian graph options set
 const graphPath2=path.join(store,'.obsidian','graph.json');const graphCfg=JSON.parse(await fs.readFile(graphPath2,'utf8'));
 assert(graphCfg.hideUnresolved===true && /-path:sources\//.test(graphCfg.search||''));
 // Consent include a folder; pending list shows items before and shrinks after
 const pendingBefore=JSON.parse(execFileSync(process.execPath,[alias,'privacy','pending','--store',store],{encoding:'utf8'}));
 JSON.parse(execFileSync(process.execPath,[alias,'privacy','consent',root,'Finance','include','--store',store],{encoding:'utf8'}));
 await run(root,store,{});
 const pendingAfter=JSON.parse(execFileSync(process.execPath,[alias,'privacy','pending','--store',store],{encoding:'utf8'}));
 assert(pendingAfter.length<=pendingBefore.length);
// Sensitivity categories and default sensitivity.json
 await fs.mkdir(path.join(root,'Medical','Analize Bioclinica Martie 2023'),{recursive:true});
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 assert(rows.find(r=>r.path==='Medical').sensitivity==='medical' || rows.find(r=>r.path==='Medical/Analize Bioclinica Martie 2023').sensitivity==='medical');
 const sens=await fs.readFile(path.join(store,'sensitivity.json'),'utf8');assert(/techistack-sensitivity/.test(sens));
 // Legal contracts detection
 await fs.writeFile(path.join(root,'CONTRACT DE  INSTRAINARE-DOBANDIRE A UNUI MIJLOC DE TRANSPORT 2.pdf'),'fixture');
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 const legalFile=rows.find(r=>r.path==='.').files.find(f=>/INSTRAINARE-DOBANDIRE/i.test(f.name));
 assert(legalFile.sensitivity==='legal');
 // No map notes inside git repos or Lightroom data
 await fs.mkdir(path.join(root,'Repo','.git'),{recursive:true});await fs.mkdir(path.join(root,'Repo','src'),{recursive:true});await fs.mkdir(path.join(root,'Library.lrcat-data'),{recursive:true});
 await run(root,store,{});
 const mapRepoSrc=path.join(store,'map',(await fs.readdir(path.join(store,'map'))).find(n=>n!=='Home.md'&&n.endsWith('.md')===false),'Repo','src','src.md');
 await assert.rejects(fs.readFile(mapRepoSrc,'utf8'));
 // Invoices from PDF text (fallback): Romanian fields
 const inv=path.join(root,'Factura_2026-02-01_ClientX.pdf');await fs.writeFile(inv,'Factura\nSeria AB\nNr. 123\nTotal de plata 1.234,56 RON\n', 'utf8');
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 const invFile=rows.find(r=>r.path==='.').files.find(f=>/Factura_2026-02-01_ClientX\.pdf$/.test(f.name));
 assert(invFile.observed_as&&invFile.observed_as.kind==='invoice'&&invFile.observed_as.amount>0&&invFile.observed_as.currency==='RON');
 // Verify copy: identical and mismatch
 const moved=path.join(tmp,'moved-root');await fs.mkdir(path.join(moved,'Cabin'),{recursive:true});await fs.writeFile(path.join(moved,'Cabin','manual.pdf'),'fake PDF fixture');await fs.writeFile(path.join(moved,'Cabin','renamed.pdf'),'fake PDF fixture');
 const verifyOk=JSON.parse(execFileSync(process.execPath,[alias,'verify-copy',path.join(root,'Cabin'),path.join(moved,'Cabin'),'--store',store],{encoding:'utf8'}));
 console.log('verify-ok', verifyOk);
 assert(verifyOk.missing.length===0 && verifyOk.different.length===0 && verifyOk.extra.length===0);
 await fs.writeFile(path.join(moved,'Cabin','extra.pdf'),'x');
 const verifyBad=JSON.parse(execFileSync(process.execPath,[alias,'verify-copy',path.join(root,'Cabin'),path.join(moved,'Cabin'),'--store',store],{encoding:'utf8'}));
 assert(verifyBad.safe_to_delete===false&&verifyBad.extra.length===1);
 // Move/identity heuristics: identical folder signatures across sources are reported
 await run(moved,store,{});
 const rev2=await review(store);assert(rev2.folder_similarity&&rev2.folder_similarity.length>0);
 // Empty folder has no signature; parent doesn't share it
 await fs.mkdir(path.join(root,'Empty'),{recursive:true});await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 const empty=rows.find(r=>r.path==='Empty');assert(!empty.signature);
 // Obsidian config: created and merged safely
 const obs=path.join(store,'.obsidian');await fs.stat(obs);
 const appPath=path.join(obs,'app.json');const graphPath=path.join(obs,'graph.json');
 const app=JSON.parse(await fs.readFile(appPath,'utf8'));
 assert(Array.isArray(app.userIgnoreFilters)&&app.userIgnoreFilters.some(s=>s==='sources/')&&app.userIgnoreFilters.some(s=>s==='migrations/'));
 const graph=JSON.parse(await fs.readFile(graphPath,'utf8'));
 assert(Array.isArray(graph.colorGroups)&&graph.colorGroups.some(g=>g.query==='tag:#type/folder') && graph.hideUnresolved===true);
 // Merge: preserve keys and avoid duplicates
 await fs.writeFile(appPath,JSON.stringify({theme:'moon',userIgnoreFilters:['custom/']},null,2));
 await fs.writeFile(graphPath,JSON.stringify({layout:'force',groups:[{query:'path:topic/',color:'#000'}]},null,2));
 await run(root,store,{});
 const app2=JSON.parse(await fs.readFile(appPath,'utf8'));
 assert(app2.theme==='moon'&&app2.userIgnoreFilters.includes('custom/')&&app2.userIgnoreFilters.includes('sources/'));
 const graph2=JSON.parse(await fs.readFile(graphPath,'utf8'));
 assert(graph2.layout==='force'&&graph2.colorGroups.filter(g=>g.query==='path:topic/').length===1&&graph2.colorGroups.some(g=>g.query==='path:place/'));
 // Changes report written
 const reportsDir=path.join(store,'reports','changes');const reports=(await fs.readdir(reportsDir));assert(reports.length>0);
 console.log('PASS: root-only notes, full recursion, preserved context/IDs, missing locations, per-source chunks, latest+previous retention, migration, cross-chunk search, duplicate review, nested code, symlink/Git protection, dry run, and unchanged source files.');
}finally{await fs.rm(tmp,{recursive:true,force:true});}

{
 const tmp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ts-map-stable-')));
 try{
  const root=path.join(tmp,'archive'),store=path.join(tmp,'store');
  async function touch(rel){
   const p=path.join(root,rel);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,'invoice');
  }
  await touch('A/Rubber/Archive/Rubber/2022/Facturi/a.pdf');
  await touch('A/Rubber/2023/Facturi/b.pdf');
  await touch('B/Archive/Rubber/c.pdf');
  await run(root,store,{});
  const mapRoot=path.join(store,'map');
  async function listMd(dir){
   const out=[];
   for(const name of await fs.readdir(dir)){
    const p=path.join(dir,name);const st=await fs.lstat(p);
    if(st.isDirectory())out.push(...await listMd(p));
    else if(name.endsWith('.md'))out.push(p);
   }
   return out;
  }
  async function collectWiki(dirs){
   const links=[];
   for(const dir of dirs){
    if(!await fs.stat(dir).then(()=>true,()=>false))continue;
    for(const p of await listMd(dir)){
     const s=await fs.readFile(p,'utf8');
     for(const m of s.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g))links.push({from:p,target:m[1].trim()});
    }
   }
   return links;
  }
  async function assertAllResolved(){
   const links=await collectWiki([mapRoot,path.join(store,'period'),path.join(store,'insights')]);
   const unresolved=[];
   for(const {from,target} of links){
    const rel=target.endsWith('.md')?target:`${target}.md`;
    try{await fs.stat(path.join(store,rel));}
    catch{unresolved.push({from:path.relative(store,from),target});}
   }
   assert.equal(unresolved.length,0,`unresolved wikilinks: ${JSON.stringify(unresolved,null,2)}`);
   return links;
  }
  const links=await assertAllResolved();
  const sourceDir=(await fs.readdir(mapRoot)).find(n=>n!=='Home.md'&&!n.endsWith('.md'));
  const sourceNotes=await listMd(path.join(mapRoot,sourceDir));
  const hubNote=path.join(mapRoot,`${sourceDir}.md`);
  const basenames=[...sourceNotes,hubNote].map(p=>path.basename(p,'.md').toLowerCase());
  assert.equal(new Set(basenames).size,basenames.length,'duplicate note basenames in one source');
  const names=sourceNotes.map(p=>path.basename(p,'.md'));
  assert(names.includes('Rubber (Archive, Rubber)')&&names.includes('Rubber (Archive, B)'),names.join(', '));
  assert(names.includes('Facturi (2022)')&&names.includes('Facturi (2023)'),names.join(', '));
  assert(names.includes('Rubber (A)'),names.join(', '));
  const insights=await fs.readFile(path.join(store,'insights','README.md'),'utf8');
  assert(/research memos/i.test(insights));
  const periodDir=path.join(store,'period');
  const periodFiles=(await fs.readdir(periodDir)).filter(n=>n.endsWith('.md'));
  assert(periodFiles.length>0);
  for(const f of periodFiles){
   const s=await fs.readFile(path.join(periodDir,f),'utf8');
   assert(/tags: \["type\/period"\]/.test(s));
   assert(/title: "\d{4}"/.test(s));
  }
  const facturi2023=sourceNotes.find(p=>p.includes(`${path.sep}2023${path.sep}Facturi${path.sep}`));
  assert(facturi2023);
  const body=await fs.readFile(facturi2023,'utf8');
  const parentLink=[...body.matchAll(/\[\[([^\]|]+)/g)].map(m=>m[1]).find(t=>t.includes('/2023/'));
  assert(parentLink);
  const parentFile=path.join(store,parentLink.endsWith('.md')?parentLink:`${parentLink}.md`);
  await fs.stat(parentFile);
  const listed=sourceNotes.map(p=>path.relative(mapRoot,p)).sort();
  console.log('fixture map listing:\n'+listed.join('\n'));
  console.log('wikilinks',links.length,'period notes',periodFiles.join(', '));
  await fs.rename(path.join(root,'A','Rubber','2023'),path.join(root,'A','Rubber','2023-renamed'));
  await run(root,store,{});
  await assertAllResolved();
  const after=await listMd(path.join(mapRoot,sourceDir));
  assert(!after.some(p=>p.includes(`${path.sep}2023${path.sep}`)&&!p.includes('2023-renamed')),after.map(p=>path.relative(mapRoot,p)).join('\n'));
  assert(after.some(p=>p.includes('2023-renamed')));
  const namesAfter=after.map(p=>path.basename(p,'.md').toLowerCase());
  assert.equal(new Set(namesAfter).size,namesAfter.length);
  console.log('PASS: stable map names, unique basenames, period notes, insights README, prune after rename.');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
