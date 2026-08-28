export function ozonProxyConfig(env=process.env){
  const raw=String(env.OZON_PROXY_URL||'').trim();
  if(raw){
    let u;
    try{u=new URL(raw.includes('://')?raw:`http://${raw}`);}catch{throw new Error('OZON_PROXY_URL has invalid format');}
    if(!u.hostname||!u.port) throw new Error('OZON_PROXY_URL must contain host and port');
    if(!['http:','https:'].includes(u.protocol)) throw new Error('OZON_PROXY_URL must use http or https');
    const server=`${u.protocol}//${u.hostname}:${u.port}`;
    return {server,username:u.username?decodeURIComponent(u.username):undefined,password:u.password?decodeURIComponent(u.password):undefined};
  }
  const server=String(env.OZON_PROXY_SERVER||'').trim();
  if(!server) return undefined;
  return {server,username:env.OZON_PROXY_USERNAME||undefined,password:env.OZON_PROXY_PASSWORD||undefined};
}
