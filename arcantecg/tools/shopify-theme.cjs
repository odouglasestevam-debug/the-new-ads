const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
process.loadEnvFile(path.resolve(root,'../.env'));
let token;
let host=(process.env.ARCAN_SHOPIFY_STORE||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
if(/^[\w-]+$/.test(host))host+='.myshopify.com';
if(!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(host))throw Error('Invalid Shopify host');
async function api(query,variables={}){
 if(!token){const r=await fetch(`https://${host}/admin/oauth/access_token`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.ARCAN_SHOPIFY_CLIENT_ID,client_secret:process.env.ARCAN_SHOPIFY_CLIENT_SECRET})});if(!r.ok)throw Error('Authentication HTTP '+r.status);token=(await r.json()).access_token;}
 const r=await fetch(`https://${host}/admin/api/2026-07/graphql.json`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables})});if(!r.ok)throw Error('GraphQL HTTP '+r.status);const j=await r.json();if(j.errors)throw Error(JSON.stringify(j.errors.map(x=>({message:x.message,code:x.extensions?.code}))));return j.data;
}
async function readFiles(id,filenames){return (await api('query($id:ID!,$names:[String!]!){theme(id:$id){files(first:50,filenames:$names){nodes{filename body{... on OnlineStoreThemeFileBodyText{content} ... on OnlineStoreThemeFileBodyBase64{contentBase64} ... on OnlineStoreThemeFileBodyUrl{url}}}}}}',{id,names:filenames})).theme.files.nodes;}
async function inspect(){
 const themes=(await api('{themes(first:20){nodes{id name role}}}')).themes.nodes;
 const main=themes.find(t=>t.role==='MAIN');if(!main)throw Error('No MAIN theme');
 const base=path.join(root,'shopify','baseline');fs.mkdirSync(base,{recursive:true});
 fs.writeFileSync(path.join(root,'shopify','source-theme.json'),JSON.stringify({capturedAt:new Date().toISOString(),...main,store:host},null,2));
 const names=['templates/index.json','config/settings_data.json','layout/theme.liquid','sections/header-group.json','sections/footer-group.json','sections/image-banner.liquid','sections/slideshow.liquid'];
 const files=await readFiles(main.id,names);
 for(const f of files){if(f.body.content!==undefined){const dest=path.join(base,f.filename);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,f.body.content);}}
 const data=await api('{collections(first:60){nodes{id handle title sortOrder}}}');fs.writeFileSync(path.join(root,'shopify','collections.json'),JSON.stringify(data.collections.nodes,null,2));
 console.log(JSON.stringify({source:main,files:files.map(f=>f.filename),collections:data.collections.nodes},null,2));
}
if(require.main===module){if(process.argv[2]==='inspect')inspect().catch(e=>{console.error(e.message);process.exitCode=1;});else console.error('Usage: node shopify-theme.cjs inspect');}
module.exports={api,readFiles,root,host};
