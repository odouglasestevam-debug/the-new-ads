const {api,readFiles,root}=require('./shopify-theme.cjs');const fs=require('node:fs');const path=require('node:path');
(async()=>{
const state=JSON.parse(fs.readFileSync(path.join(root,'shopify/draft-theme.json'),'utf8'));
const files=await readFiles(state.id,['templates/index.json']);fs.writeFileSync(path.join(root,'shopify/remote-index.json'),files[0].body.content);
const d=await api('{collections(first:60){nodes{handle title products(first:100){nodes{handle title status}}}}}');const active=d.collections.nodes.map(c=>({handle:c.handle,active:c.products.nodes.filter(p=>p.status==='ACTIVE')}));fs.writeFileSync(path.join(root,'shopify/active-collections.json'),JSON.stringify(active,null,2));console.log(JSON.stringify(active.map(c=>({handle:c.handle,count:c.active.length,sample:c.active.slice(0,2)})),null,2));
for(const [name,url]of [['live','https://arcantcg.com.br/'],['draft',state.previewUrl]]){const r=await fetch(url);const s=await r.text();fs.writeFileSync(path.join(root,'shopify',name+'-render.html'),s);console.log(name,{bannerImages:[...s.matchAll(/src="([^"\n]*slide[^"\n]*)"/g)].map(m=>m[1]).slice(0,4),arcanProducts:(s.match(/class="arcan-product"/g)||[]).length});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
