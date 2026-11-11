// Run from the helper root: node scripts/import-agent-plugins.mjs <export.json>
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const input=process.argv[2];if(!input)throw new Error('Provide metadata exported with the AIPP package parser');
const previews=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(previews)||!previews.length)throw new Error('Empty plugin release');
const revision=previews[0].revision;
const keys=new Set();
for(const p of previews){if(!/^[a-f0-9]{24}$/.test(p.key)||! /^[a-f0-9]{40}$/.test(p.revision)||p.revision!==revision||keys.has(p.key))throw new Error('Invalid release identity');keys.add(p.key);}
await mkdir('public/agent-plugins',{recursive:true});
for(const p of previews)await writeFile(`public/agent-plugins/${p.key}.json`,JSON.stringify(p));
await writeFile('src/worker/data/agent-plugins.json',JSON.stringify({revision,entries:previews.map(p=>({key:p.key,name:p.name,description:p.description,category:'效率',source:p.source}))},null,2));
console.log(`Prepared ${previews.length} plugins at ${revision}; review and deploy helper with its static assets.`);
