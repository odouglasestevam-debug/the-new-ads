import {jsonLimitado} from '../_shared/security.ts';
import {contexto,headers,json,fail,meta,limitarEnvios} from '../_shared/whatsapp.ts';
import {UUID} from '../_shared/security.ts';
const BUCKET='crm-midias';
const MAX=20*1024*1024;
const MIME:Record<string,{tipo:string,wa:string,max:number,ext:string}>={
  'image/jpeg':{tipo:'imagem',wa:'image',max:5*1024*1024,ext:'jpg'},
  'image/png':{tipo:'imagem',wa:'image',max:5*1024*1024,ext:'png'},
  'image/webp':{tipo:'figurinha',wa:'sticker',max:500*1024,ext:'webp'},
  'video/mp4':{tipo:'video',wa:'video',max:16*1024*1024,ext:'mp4'},
  'audio/ogg':{tipo:'audio',wa:'audio',max:16*1024*1024,ext:'ogg'},
  'audio/mpeg':{tipo:'audio',wa:'audio',max:16*1024*1024,ext:'mp3'},
  'audio/mp4':{tipo:'audio',wa:'audio',max:16*1024*1024,ext:'m4a'},
  'application/pdf':{tipo:'documento',wa:'document',max:MAX,ext:'pdf'},
};
export function tipoArquivo(mime:string,size:number){
  const tipo=MIME[mime.split(';')[0].trim().toLowerCase()];
  if(!tipo)fail(415,'Formato não suportado. Use JPG, PNG, WebP, MP4, MP3, OGG, M4A ou PDF.');
  if(!size||size>tipo.max)fail(413,`O limite deste formato é ${Math.round(tipo.max/1024/1024*10)/10} MB.`);
  return tipo;
}
async function baixarLimitado(r:{headers:Headers;body:ReadableStream<Uint8Array>|null},limit:number){
  if(Number(r.headers.get('content-length'))>limit)fail(413,'Arquivo acima do limite.');
  const reader=r.body?.getReader();if(!reader)fail(502,'Arquivo indisponível.');
  let size=0;const parts:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'Arquivo acima do limite.');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
async function assinar(admin:any,path:string){
  const {data,error}=await admin.storage.from(BUCKET).createSignedUrl(path,300);
  if(error)fail(503,'Não foi possível abrir o arquivo. Tente novamente.');return data.signedUrl;
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:headers(req)});
  if(req.method!=='POST')return json(req,405,{erro:'Método não permitido.'});
  try{
    if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
      if(Number(req.headers.get('content-length'))>MAX+65536)fail(413,'Arquivo acima de 20 MB.');
      const bytes=await baixarLimitado(req,MAX+65536);
      const form=await new Response(bytes,{headers:{'content-type':req.headers.get('content-type')!}}).formData();
      const {admin,conversa,integration,token,user}=await contexto(req,String(form.get('conversa_id')||''),true);
      if(!conversa.ultima_entrada_em||Date.now()-new Date(conversa.ultima_entrada_em).getTime()>=86400000)fail(422,'A janela de 24 horas está fechada. Envie um modelo aprovado.');
      const file=form.get('arquivo');if(!(file instanceof File))fail(400,'Selecione um arquivo.');
      const tipo=tipoArquivo(file.type,file.size);
      const id=String(form.get('mensagem_id')||'');if(!UUID.test(id))fail(400,'Identificador inválido.');
      const caption=String(form.get('legenda')||'').trim();if(caption.length>1024)fail(400,'Legenda deve ter até 1.024 caracteres.');
      const {data:old}=await admin.from('mensagens').select('*').eq('id',id).maybeSingle();
      if(old){if(old.conversa_id!==conversa.id||old.autor_id!==user.id)fail(409,'Identificador já utilizado.');return json(req,old.status==='falhou'?422:200,{mensagem:old,erro:old.erro,pendente:old.status==='enviando'});}
      await limitarEnvios(admin,user.id);
      const path=`${conversa.empresa_id}/${conversa.id}/${id}.${tipo.ext}`;
      const {error:storageError}=await admin.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
      if(storageError)fail(503,'Não foi possível guardar o arquivo. Tente novamente.');
      const {data:registro,error}=await admin.from('mensagens').insert({id,empresa_id:conversa.empresa_id,conversa_id:conversa.id,autor_id:user.id,direcao:'saida',tipo:tipo.tipo,
        texto:caption||file.name,midia:{storage_path:path,mime_type:file.type,filename:file.name},status:'enviando'}).select().single();
      if(error)fail(503,'Não foi possível registrar o envio. Consulte o histórico antes de repetir.');
      const upload=new FormData();upload.set('messaging_product','whatsapp');upload.set('type',file.type);upload.set('file',file);
      let result:any;
      try{
        const media=await meta(token,`${integration.config.phone_number_id}/media`,{method:'POST',body:upload});
        if(!media.id)fail(502,'A Meta não confirmou o recebimento do arquivo.');
        const attachment={id:media.id,...(tipo.wa==='document'?{filename:file.name}:{}),...(['image','video','document'].includes(tipo.wa)&&caption?{caption}:{})};
        result=await meta(token,`${integration.config.phone_number_id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:conversa.wa_id,biz_opaque_callback_data:id,type:tipo.wa,[tipo.wa]:attachment})});
      }catch(e){
        const refused=(e as any).status===502;
        await admin.from('mensagens').update({status:refused?'falhou':'enviando',erro:refused?(e as Error).message:'Confirmação do provedor pendente. Confira o histórico antes de reenviar.'}).eq('id',id).eq('status','enviando');
        return json(req,refused?502:202,{pendente:!refused,erro:refused?(e as Error).message:undefined,mensagem:registro});
      }
      if(!result.messages?.[0]?.id)return json(req,202,{pendente:true,mensagem:registro});
      const {error:updateError}=await admin.from('mensagens').update({status:'enviada',wa_message_id:result.messages[0].id}).eq('id',id).eq('status','enviando');
      await admin.from('conversas').update({ultima_mensagem_em:registro.criado_em,ultima_previa:(caption||file.name).slice(0,140)}).eq('id',conversa.id).lte('ultima_mensagem_em',registro.criado_em);
      return json(req,updateError?202:200,{mensagem:registro,pendente:!!updateError});
    }
    const body=await jsonLimitado(req);
    const {admin,client,conversa,token}=await contexto(req,String(body.conversa_id||''));
    const {data:message}=await client.from('mensagens').select('*').eq('id',String(body.mensagem_id||'')).eq('conversa_id',conversa.id).maybeSingle();
    if(!message)fail(404,'Mensagem não encontrada.');
    let path=message.midia?.storage_path;
    if(path&&!path.startsWith(`${conversa.empresa_id}/${conversa.id}/${message.id}.`))fail(403,'Arquivo inválido.');
    if(!path){
      const mediaId=String(message.midia?.id||'');if(!/^\d+$/.test(mediaId))fail(422,'Esta mensagem não tem um arquivo disponível na API oficial.');
      const metadata=await meta(token,`${mediaId}?phone_number_id=${encodeURIComponent(String((await admin.from('integracoes').select('config').eq('empresa_id',conversa.empresa_id).eq('tipo','whatsapp_oficial').single()).data?.config?.phone_number_id||''))}`);
      const url=new URL(metadata.url);
      if(url.protocol!=='https:'||!['lookaside.fbsbx.com','mmg.whatsapp.net'].includes(url.hostname))fail(502,'A Meta retornou um endereço de mídia inesperado.');
      const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)fail(410,'O arquivo expirou ou não está disponível. Peça um novo envio.');
      const bytes=await baixarLimitado(response,MAX);
      const mime=metadata.mime_type||response.headers.get('content-type')||'';
      const tipo=tipoArquivo(mime,bytes.length);
      path=`${conversa.empresa_id}/${conversa.id}/${message.id}.${tipo.ext}`;
      const {error}=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:mime,upsert:true});
      if(error)fail(503,'Não foi possível guardar o arquivo.');
      await admin.from('mensagens').update({midia:{...message.midia,storage_path:path,mime_type:mime}}).eq('id',message.id).eq('empresa_id',conversa.empresa_id);
    }
    return json(req,200,{url:await assinar(admin,path),tipo:message.tipo,filename:message.midia?.filename||'arquivo',expira_em:Date.now()+300000});
  }catch(e){return json(req,(e as any).status||500,{erro:(e as any).status?(e as Error).message:'Não foi possível acessar a mídia. Tente novamente.'});}
});
