// Read-only connection check. Credentials and temporary token never leave memory/logs.
const path = require('node:path');
process.loadEnvFile(path.resolve(__dirname, '../../.env'));
async function main() {
  const raw = (process.env.ARCAN_SHOPIFY_STORE || '').trim();
  let host = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (/^[a-zA-Z0-9-]+$/.test(host)) host += '.myshopify.com';
  if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(host)) throw new Error('STORE must identify a myshopify.com hostname; no credentials sent.');
  const response = await fetch(`https://${host}/admin/oauth/access_token`, {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.ARCAN_SHOPIFY_CLIENT_ID || '',client_secret:process.env.ARCAN_SHOPIFY_CLIENT_SECRET || ''})
  });
  if (!response.ok) {console.log(JSON.stringify({authentication:false,status:response.status}));return;}
  const auth = await response.json();
  if (!auth.access_token) throw new Error('Token missing; no credential data logged.');
  const relevantScopes = String(auth.scope || '').split(',').filter(s=>/theme/.test(s));
  console.log(JSON.stringify({authentication:true,themeScopes:relevantScopes}));
  const r=await fetch(`https://${host}/admin/api/2026-07/graphql.json`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json','X-Shopify-Access-Token':auth.access_token},
    body:JSON.stringify({query:'query { currentAppInstallation { accessScopes { handle } } shop { name primaryDomain { host } } themes(first: 20) { nodes { id name role } } }'})
  });
  if(!r.ok){console.log(JSON.stringify({readStatus:r.status}));return;}
  const result=await r.json();
  const grantedScopes=result.data?.currentAppInstallation?.accessScopes?.map(s=>s.handle);
  console.log(JSON.stringify({shop:result.data?.shop,grantedThemeScopes:grantedScopes?.filter(s=>/theme/.test(s)),writeThemesGranted:grantedScopes?grantedScopes.includes('write_themes'):null,themes:result.data?.themes?.nodes,errors:result.errors?.map(e=>({code:e.extensions?.code,message:e.message}))},null,2));
}
main().catch(error=>{console.error(JSON.stringify({checkFailed:true,type:error.name,reason:error.cause?.code || (error.message==='fetch failed'?'network unavailable':error.message)}));process.exitCode=1;});
