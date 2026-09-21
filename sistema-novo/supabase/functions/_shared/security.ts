// Hosts autorizados explicitamente; redirects nunca recebem credenciais.
export function neoGoBase(value: string, allowed = Deno.env.get('NEOGO_ALLOWED_HOSTS') || '') {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('URL da NeoGo inválida.'); }
  const hosts = allowed.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.port && url.port !== '443' || url.pathname !== '/' || !hosts.includes(url.hostname.toLowerCase())) {
    throw new Error('Autorize o domínio HTTPS da NeoGo em NEOGO_ALLOWED_HOSTS antes de conectar. Use apenas a URL base, sem caminho ou credenciais.');
  }
  return url.origin;
}

export function temMfaPendente(user: any, token: string) {
  if (!(user.factors || []).some((f: any) => f.status === 'verified')) return false;
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return claims.aal !== 'aal2';
  } catch { return true; }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function checarLimiteCRM(admin: any, user: string, acao: 'envio' | 'equipe' | 'integracoes' | 'recurso_whatsapp') {
  const {data,error}=await admin.rpc('crm_limitar_acao',{p_ator:user,p_acao:acao});
  if(error || typeof data!=='boolean')return {status:503,erro:'Não foi possível verificar o limite. Tente novamente.'};
  return data?null:{status:429,erro:'Muitas tentativas em sequência. Aguarde um minuto.'};
}

// Limita o stream real, inclusive sem Content-Length; prazo total evita leitura indefinida.
export async function textoLimitado(req: Request, max=65536, timeout=10000): Promise<string> {
  const erro=(status:number,message:string)=>Object.assign(new Error(message),{status});
  if(Number(req.headers.get('content-length'))>max)throw erro(413,'Corpo da solicitação acima do limite.');
  const reader=req.body?.getReader();if(!reader)return '';
  const chunks:Uint8Array[]=[];let total=0;let timer:ReturnType<typeof setTimeout>|undefined;
  const prazo=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(erro(408,'Tempo de envio excedido.'));void reader.cancel().catch(()=>{});},timeout);});
  try{
    while(true){const {done,value}=await Promise.race([reader.read(),prazo]);if(done)break;total+=value.length;
      if(total>max){void reader.cancel().catch(()=>{});throw erro(413,'Corpo da solicitação acima do limite.');}chunks.push(value);}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return new TextDecoder().decode(bytes);
  }finally{clearTimeout(timer);reader.releaseLock();}
}
export async function jsonLimitado(req: Request,max=65536): Promise<Record<string,any>> {
  const raw=await textoLimitado(req,max);let body:unknown;
  try{body=JSON.parse(raw);}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}
  if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Envie um objeto JSON.'),{status:400});
  return body as Record<string,any>;
}
export function headersSeguros(status:number) {
  return {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})};
}
export function redirectSeguro(value:unknown):string {
  if(typeof value!=='string'||value.length>2048)return '';
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
