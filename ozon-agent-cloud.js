import crypto from 'crypto';
import { createOzonAgentJob, getOzonAgentJob, getOzonAgentStatus, cleanupOzonAgentJobs } from './db.js';

const WAIT_MS=Math.max(15000,Number(process.env.OZON_AGENT_WAIT_MS||150000));
const POLL_MS=Math.max(300,Number(process.env.OZON_AGENT_POLL_MS||900));

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

export async function lookupOzonViaCloudBrowser(url,sku){
  const status=await getOzonAgentStatus().catch(()=>({online:false}));
  if(!status?.online){
    const e=new Error('Ozon Cloud Browser не подключён. Запусти Ozon VPS Worker и дождись статуса «подключён».');
    e.code='OZON_AGENT_OFFLINE';
    throw e;
  }
  await cleanupOzonAgentJobs().catch(()=>{});
  const id=crypto.randomUUID();
  await createOzonAgentJob({id,url,sku});
  const deadline=Date.now()+WAIT_MS;
  while(Date.now()<deadline){
    const row=await getOzonAgentJob(id);
    if(!row){throw new Error('Задание Ozon Agent исчезло из очереди');}
    if(row.status==='done'){
      if(!(Number(row.price)>0)) throw new Error('Ozon Agent вернул результат без цены');
      return {name:row.name||`Ozon ${sku||''}`.trim(),price:Number(row.price),source:row.source||'Ozon cloud Chrome'};
    }
    if(row.status==='error'){
      throw new Error(row.error||'Ozon Agent не смог прочитать карточку');
    }
    await sleep(POLL_MS);
  }
  throw new Error('Ozon Cloud Browser не успел обработать карточку. Открой удалённый Chrome через noVNC и проверь Ozon-сессию.');
}
