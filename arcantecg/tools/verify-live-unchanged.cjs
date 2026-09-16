const {api,readFiles,root}=require('./shopify-theme.cjs');const fs=require('node:fs');const path=require('node:path');
(async()=>{
const source=JSON.parse(fs.readFileSync(path.join(root,'shopify/source-theme.json'),'utf8'));
const state=JSON.parse(fs.readFileSync(path.join(root,'shopify/draft-theme.json'),'utf8'));
const themes=(await api('{themes(first:20){nodes{id name role}}}')).themes.nodes;
const names=['layout/theme.liquid','templates/index.json','config/settings_data.json','sections/header-group.json','sections/footer-group.json'];
const files=await readFiles(source.id,names);
const checks=files.map(f=>({filename:f.filename,unchanged:f.body.content===fs.readFileSync(path.join(root,'shopify/baseline',f.filename),'utf8')}));
const result={originalStillPublished:themes.find(t=>t.id===source.id)?.role==='MAIN',newThemeUnpublished:themes.find(t=>t.id===state.id)?.role==='UNPUBLISHED',originalFiles:checks};
fs.writeFileSync(path.join(root,'shopify/preview/live-integrity.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.originalStillPublished||!result.newThemeUnpublished||checks.some(c=>!c.unchanged))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
