import {jsonLimitado} from '../_shared/security.ts';
import {contexto,json,headers,meta,fail} from '../_shared/whatsapp.ts';
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:headers(req)});
  if(req.method!=='POST')return json(req,405,{erro:'Método não permitido.'});
  try{
    const b=await jsonLimitado(req);
    const {client,conversa,integration,token}=await contexto(req,String(b.conversa_id||''),true);
    const {data:message}=await client.from('mensagens').select('wa_message_id').eq('conversa_id',conversa.id).eq('id',String(b.mensagem_id||'')).eq('direcao','entrada').maybeSingle();
    if(!message?.wa_message_id)fail(404,'Mensagem recebida não encontrada.');
    await meta(token,`${integration.config.phone_number_id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',status:'read',message_id:message.wa_message_id})});
    return json(req,200,{ok:true});
  }catch(e){return json(req,(e as any).status||500,{erro:(e as any).status?(e as Error).message:'Não foi possível confirmar a leitura.'});}
});
