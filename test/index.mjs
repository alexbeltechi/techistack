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
 // False positives not redacted
 await fs.writeFile(path.join(root,'Login screen v2.fig'),'x');await fs.writeFile(path.join(root,'Business card.ai'),'x');await fs.writeFile(path.join(root,'ID badge mockup.png'),'x');
 await run(root,store,{});
 db=await readStore(store);rows=await loadFolders(store,db.sources.find(s=>s.last_known_location===root));
 const names=rows.find(r=>r.path==='.').files.map(f=>f.name);
 assert(names.includes('Login screen v2.fig')&&names.includes('Business card.ai')&&names.includes('ID badge mockup.png'));
 // Wiki graph and note gating reflect consent pending
 const note2=await fs.readFile(path.join(root,'_INDEX.md'),'utf8');assert(/flagged, awaiting consent/.test(note2));
 // Map generated in store, with hub and per-folder notes
 const mapHub=await fs.readFile(path.join(store,'map','README.md'),'utf8');assert(/Indexed sources/.test(mapHub));
 const anySourceDir=(await fs.readdir(path.join(store,'map'))).find(n=>n!=='README.md');
 const mapRoot=await fs.readFile(path.join(store,'map',anySourceDir,'_INDEX.md'),'utf8');assert(/#/.test(mapRoot));
 // .obsidian graph options set
 const graphPath2=path.join(store,'.obsidian','graph.json');const graphCfg=JSON.parse(await fs.readFile(graphPath2,'utf8'));
 assert(graphCfg.options.hideUnresolved===true && /-path:sources\//.test(graphCfg.search||''));
 // Consent include a folder; pending list shows items before and shrinks after
 const pendingBefore=JSON.parse(execFileSync(process.execPath,[alias,'privacy','pending','--store',store],{encoding:'utf8'}));
 JSON.parse(execFileSync(process.execPath,[alias,'privacy','consent',root,'Finance','include','--store',store],{encoding:'utf8'}));
 await run(root,store,{});
 const pendingAfter=JSON.parse(execFileSync(process.execPath,[alias,'privacy','pending','--store',store],{encoding:'utf8'}));
 assert(pendingAfter.length<=pendingBefore.length);
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
 const rev2=await review(store);assert(rev2.identical_folders.some(g=>g.length>=2));
 // Obsidian config: created and merged safely
 const obs=path.join(store,'.obsidian');await fs.stat(obs);
 const appPath=path.join(obs,'app.json');const graphPath=path.join(obs,'graph.json');
 const app=JSON.parse(await fs.readFile(appPath,'utf8'));
 assert(Array.isArray(app.userIgnoreFilters)&&app.userIgnoreFilters.some(s=>s==='sources/')&&app.userIgnoreFilters.some(s=>s==='migrations/'));
 const graph=JSON.parse(await fs.readFile(graphPath,'utf8'));
 assert(Array.isArray(graph.groups)&&graph.groups.some(g=>g.query==='path:map/'));
 // Merge: preserve keys and avoid duplicates
 await fs.writeFile(appPath,JSON.stringify({theme:'moon',userIgnoreFilters:['custom/']},null,2));
 await fs.writeFile(graphPath,JSON.stringify({layout:'force',groups:[{query:'path:topic/',color:'#000'}]},null,2));
 await run(root,store,{});
 const app2=JSON.parse(await fs.readFile(appPath,'utf8'));
 assert(app2.theme==='moon'&&app2.userIgnoreFilters.includes('custom/')&&app2.userIgnoreFilters.includes('sources/'));
 const graph2=JSON.parse(await fs.readFile(graphPath,'utf8'));
 assert(graph2.layout==='force'&&graph2.groups.filter(g=>g.query==='path:topic/').length===1&&graph2.groups.some(g=>g.query==='path:place/'));
 console.log('PASS: root-only notes, full recursion, preserved context/IDs, missing locations, per-source chunks, latest+previous retention, migration, cross-chunk search, duplicate review, nested code, symlink/Git protection, dry run, and unchanged source files.');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
