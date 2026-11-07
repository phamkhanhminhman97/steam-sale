import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const skill=process.env.TASTE_SKILL_PATH??'/tmp/steam-taste/skills/taste-skill';
mkdirSync('checks/shots',{recursive:true});
const r=spawnSync(process.execPath,[`${skill}/scripts/consistency.mjs`,'http://127.0.0.1:4321','--widths','1440,1024,768,390','--quick','--profile','/tmp/steam-taste-check','--out','checks/taste','--page','software','--category','Game Steam','--probe',readFileSync('checks/browser-probe.js','utf8')],{encoding:'utf8',maxBuffer:10_000_000});
writeFileSync('checks/ui-taste-report.txt',(r.stdout??'')+(r.stderr??''));
console.log(r.stdout);console.error(r.stderr);console.log('checker_exit',r.status);
