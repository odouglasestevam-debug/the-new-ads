import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=new URL('../../',import.meta.url);
const env={...process.env};
for(const line of (await readFile(new URL('.env',root),'utf8')).split(/\r?\n/)){
  const m=line.match(/^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)\s*=\s*(.*)$/);
  if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
}
if(!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)throw new Error('Credenciais Cloudflare ausentes');
const cli=process.argv[2];if(!cli)throw new Error('Informe o caminho do Wrangler');
const result=spawnSync(process.execPath,[cli,'deploy','--config',resolve('site/wrangler.jsonc')],{env,stdio:'inherit',windowsHide:true});
process.exit(result.status??1);
