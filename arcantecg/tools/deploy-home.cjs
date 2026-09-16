const fs=require('node:fs');
const path=require('node:path');
const {api,readFiles,root,host}=require('./shopify-theme.cjs');
const dir=path.join(root,'shopify');
const statePath=path.join(dir,'draft-theme.json');
async function main(){
 const command=process.argv[2];
 if(command==='duplicate'){
  if(fs.existsSync(statePath))throw Error('Draft already recorded; do not duplicate again.');
  const source=JSON.parse(fs.readFileSync(path.join(dir,'source-theme.json'),'utf8'));
  const result=await api('mutation($id:ID!,$name:String){themeDuplicate(id:$id,name:$name){newTheme{id name role} userErrors{field message}}}',{id:source.id,name:'Arcan | Nova home + banners atuais'});
  const payload=result.themeDuplicate;if(payload.userErrors.length)throw Error(JSON.stringify(payload.userErrors));
  if(!payload.newTheme)throw Error('No draft returned');
  fs.writeFileSync(statePath,JSON.stringify({...payload.newTheme,sourceThemeId:source.id,createdAt:new Date().toISOString(),previewUrl:`https://arcantcg.com.br/?preview_theme_id=${payload.newTheme.id.split('/').pop()}`},null,2));
  console.log(JSON.stringify(payload.newTheme));return;
 }
 const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
 const current=(await api('query($id:ID!){theme(id:$id){id name role processing processingFailed}}',{id:state.id})).theme;
 if(!current||current.role!=='UNPUBLISHED'||current.id===state.sourceThemeId)throw Error('Refusing to modify anything other than the recorded UNPUBLISHED draft.');
 if(command==='status'){console.log(JSON.stringify(current));return;}
 if(current.processing||current.processingFailed)throw Error('Theme not ready: '+JSON.stringify(current));
 const patch=path.join(dir,'patch');
 const walk=(base)=>fs.readdirSync(base,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(base,e.name)):[path.join(base,e.name)]);
 const paths=walk(patch);
 if(command==='push'){
  const files=paths.map(p=>({filename:path.relative(patch,p).split(path.sep).join('/'),body:{type:/\.(png|webp|ttf|woff2?)$/.test(p)?'BASE64':'TEXT',value:fs.readFileSync(p,/\.(png|webp|ttf|woff2?)$/.test(p)?'base64':'utf8')}}));
  if(files.length>50)throw Error('Too many files');
  const result=await api('mutation($id:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){themeFilesUpsert(themeId:$id,files:$files){upsertedThemeFiles{filename} job{id done} userErrors{field message}}}',{id:state.id,files});
  fs.writeFileSync(path.join(dir,'upload-result.json'),JSON.stringify(result,null,2));
  if(result.themeFilesUpsert.userErrors.length)throw Error(JSON.stringify(result.themeFilesUpsert.userErrors));
  console.log(JSON.stringify(result,null,2));return;
 }
 if(command==='verify'){
  const names=paths.filter(p=>!(/\.(png|webp|ttf|woff2?)$/.test(p))).map(p=>path.relative(patch,p).split(path.sep).join('/'));
  const files=await readFiles(state.id,names);
  const normalize=(filename,value)=>{if(value===undefined)return null;if(filename.endsWith('.json'))return JSON.stringify(JSON.parse(value.replace(/\/\*[\s\S]*?\*\//g,'')));return value.replace(/\r\n/g,'\n');};
  const result=names.map(filename=>({filename,identical:normalize(filename,files.find(f=>f.filename===filename)?.body.content)===normalize(filename,fs.readFileSync(path.join(patch,filename),'utf8'))}));
  console.log(JSON.stringify(result,null,2));if(result.some(r=>!r.identical))process.exitCode=1;return;
 }
 throw Error('Expected duplicate, status, push, or verify');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
