// Requires Python 3 for ZIP packaging. Run: node scripts/import-agent-plugins.mjs <export.json> <repository.zip>
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const input=process.argv[2];const archiveInput=process.argv[3];if(!input || !archiveInput)throw new Error('Provide metadata exported with the AIPP package parser');
const previews=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(previews)||!previews.length)throw new Error('Empty plugin release');
const revision=previews[0].revision;
const keys=new Set();
for(const p of previews){if(!/^[a-f0-9]{24}$/.test(p.key)||! /^[a-f0-9]{40}$/.test(p.revision)||p.revision!==revision||keys.has(p.key))throw new Error('Invalid release identity');keys.add(p.key);}
await mkdir('public/agent-plugins',{recursive:true});
for(const p of previews)await writeFile(`public/agent-plugins/${p.key}.json`,JSON.stringify(p));
const bytes=await readFile(archiveInput);const parts=[];await mkdir('public/agent-plugin-archives',{recursive:true});
for(let offset=0,index=0;offset<bytes.length;offset+=15*1024*1024,index++){const path=`/agent-plugin-archives/${revision}.${index}.bin`;await writeFile(`public${path}`,bytes.subarray(offset,offset+15*1024*1024));parts.push(path); }
const archive={parts,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
await writeFile('src/worker/data/agent-plugins.json',JSON.stringify({revision,archive,entries:previews.map(p=>({key:p.key,name:p.name,description:p.description,category:'效率',source:p.source}))},null,2));
console.log(`Prepared ${previews.length} plugins at ${revision}; review and deploy helper with its static assets.`);

execFileSync('python', ['scripts/package-agent-plugins.py', archiveInput, input], {stdio:'inherit'});
