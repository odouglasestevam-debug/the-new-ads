import { createClient } from 'npm:@supabase/supabase-js@2';
import { temMfaPendente, checarLimiteCRM, headersSeguros } from './security.ts';
export const WHATSAPP_GRAPH = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v21.0'}`;
export function headers(req: Request) {
  const origin=req.headers.get('origin');
  return {'Content-Type':'application/json','Access-Control-Allow-Origin':origin==='http://localhost:8788'?origin:'https://crm.thenewads.com.br',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
}
export function json(req: Request,status: number,data: unknown) { return new Response(JSON.stringify(data),{status,headers:{...headers(req),...headersSeguros(status)}}); }
export function fail(status: number,message: string): never { throw Object.assign(new Error(message),{status}); }
export async function contexto(req: Request,id: string,send=false) {
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:auth,error}=await admin.auth.getUser(token);
  if(error||!auth.user)fail(401,'Sua sessão expirou. Entre novamente.');
  if(temMfaPendente(auth.user,token))fail(403,'Conclua a autenticação em duas etapas.');
  const limite=await checarLimiteCRM(admin,auth.user.id,'recurso_whatsapp');
  if(limite)fail(limite.status,limite.erro);
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  const {data:conversa,error:err}=await client.from('conversas').select('*,leads(responsavel_id)').eq('id',id).maybeSingle();
  if(err||!conversa)fail(404,'Conversa não encontrada.');
  const {data:empresa}=await admin.from('empresas').select('ativo').eq('id',conversa.empresa_id).maybeSingle();
  if(!empresa?.ativo)fail(403,'Esta empresa está inativa.');
  if(conversa.canal!=='whatsapp_oficial')fail(422,'Este recurso requer WhatsApp oficial.');
  if(send){
    const [{data:agency},{data:member}]=await Promise.all([
      admin.from('agencia_admins').select('user_id').eq('user_id',auth.user.id).maybeSingle(),
      admin.from('membros').select('papel').eq('user_id',auth.user.id).eq('empresa_id',conversa.empresa_id).maybeSingle()]);
    if(!agency&&!['dono','gestor'].includes(member?.papel)&&!(member?.papel==='vendedor'&&conversa.leads?.responsavel_id===auth.user.id))fail(403,'Você não pode responder este lead.');
  }
  const {data:integration}=await admin.from('integracoes').select('*').eq('empresa_id',conversa.empresa_id).eq('tipo','whatsapp_oficial').maybeSingle();
  if(!integration||integration.status!=='ativa')fail(422,'WhatsApp oficial não está ativo.');
  const {data:secrets,error:errSecret}=await admin.rpc('integracao_ler_segredos',{p_integracao:integration.id});
  if(errSecret||!secrets?.token)fail(503,'Não foi possível acessar a conexão do WhatsApp.');
  return {admin,client,conversa,integration,token:secrets.token,user:auth.user};
}
export async function meta(token: string,path: string,options: RequestInit={}) {
  const res=await fetch(`${WHATSAPP_GRAPH}/${path}`,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,...options.headers}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)fail(502,body?.error?.error_user_msg||'A Meta recusou a operação. Confira o token e as permissões da integração.');
  return body;
}
export async function limitarEnvios(admin: any,user: string) {
  const limite=await checarLimiteCRM(admin,user,'envio');
  if(limite)fail(limite.status,limite.erro);
}
