import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {run} from '../skills/index/scripts/index.mjs';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'ts-index-'));
try{
 const root=path.join(tmp,'archive'), store=path.join(tmp,'store');
 await fs.mkdir(path.join(root,'Catalog','Model'),{recursive:true});
 await fs.mkdir(path.join(root,'Cabin'),{recursive:true});
 await fs.writeFile(path.join(root,'Catalog','_INDEX.md'),'---\nid: "catalog-stable"\nsummary: "Bike catalog"\n---\n# Catalog\n\n## Context\n\nBicycle catalog, confirmed by the owner.\n\n## Notes\n\nKeep this sentence.\n');
 await fs.writeFile(path.join(root,'Catalog','Model','manual.pdf'),'fake PDF fixture');
 await fs.writeFile(path.join(root,'Cabin','manual.pdf'),'fake PDF fixture');
 await fs.writeFile(path.join(root,'Cabin','renamed.pdf'),'fake PDF fixture');
 const dry=await run(root,store,{dryRun:true});assert.equal(dry.folders,4);await assert.rejects(fs.stat(store));await assert.rejects(fs.stat(path.join(root,'_INDEX.md')));
 await run(root,store,{hash:true});
 let db=JSON.parse(await fs.readFile(path.join(store,'index.json')));
 const model=db.sources[0].folders.find(r=>r.name==='Model');assert(model.carried_context.confirmed_context.some(c=>c.text.includes('Bicycle catalog')));assert(model.files[0].sha256);
 const cli=new URL('../skills/index/scripts/index.mjs',import.meta.url).pathname;
 const review=JSON.parse(execFileSync(process.execPath,[cli,'review','--store',store],{encoding:'utf8'}));assert.equal(review.candidate_duplicates.length,1);assert.equal(review.identical_content[0].locations.length,3);
 const alias=path.join(tmp,'index-alias.mjs');await fs.symlink(cli,alias);assert(JSON.parse(execFileSync(process.execPath,[alias,'find','Bicycle','--store',store],{encoding:'utf8'})).matches.length);
 const note=await fs.readFile(path.join(root,'Catalog','_INDEX.md'),'utf8');assert(note.includes('Keep this sentence.'));assert(note.includes('id: "catalog-stable"'));
 await fs.rename(path.join(root,'Catalog','Model'),path.join(root,'Model moved'));
 await run(root,store,{});
 db=JSON.parse(await fs.readFile(path.join(store,'index.json')));const moved=db.sources[0].folders.find(r=>r.name==='Model moved');assert.equal(moved.id,model.id);assert.deepEqual(moved.carried_context.origin_labels,model.carried_context.origin_labels);assert(moved.carried_context.confirmed_context.some(c=>c.text.includes('Bicycle catalog')));
 assert.equal(db.sources[0].changes.relocated_or_copied_folders.length,1);
 // Move outside this scan; retain searchable last-known context.
 await fs.rename(path.join(root,'Model moved'),path.join(tmp,'offline-model'));
 await run(root,store,{});db=JSON.parse(await fs.readFile(path.join(store,'index.json')));assert.equal(db.sources[0].unobserved_folders.length,1);
 const script=new URL('../skills/index/scripts/index.mjs',import.meta.url).pathname;
 const found=JSON.parse(execFileSync(process.execPath,[script,'find','Bicycle','--store',store],{encoding:'utf8'}));assert(found.matches.some(m=>m.folder_id===model.id&&m.status.includes('not-observed')));
 assert.equal(await fs.readFile(path.join(tmp,'offline-model','manual.pdf'),'utf8'),'fake PDF fixture');
 const other=path.join(tmp,'other');await fs.mkdir(other);await fs.writeFile(path.join(other,'document.docx'),'fixture');await run(other,store,{});db=JSON.parse(await fs.readFile(path.join(store,'index.json')));assert.equal(db.sources.length,2);
 // Partial reads preserve sources rather than replacing their metadata.
 const linkRoot=path.join(tmp,'symlink-note');await fs.mkdir(linkRoot);await fs.symlink(path.join(other,'document.docx'),path.join(linkRoot,'_INDEX.md'));await assert.rejects(run(linkRoot,store,{}));assert.equal(await fs.readFile(path.join(other,'document.docx'),'utf8'),'fixture');
 const gitRoot=path.join(tmp,'git-root');await fs.mkdir(path.join(gitRoot,'.git'),{recursive:true});await assert.rejects(run(other,path.join(gitRoot,'store'),{}));
 assert((await fs.readdir(path.join(store,'snapshots'))).length>=8);
 console.log('PASS: dry run, direct inventories, optional hashes, preserved context/IDs, folder moves, last-known search, multi-source store, symlink protection, Git exclusion, history, source files unchanged.');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
