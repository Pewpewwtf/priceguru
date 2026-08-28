import assert from 'node:assert/strict';
import { ozonProxyConfig } from '../ozon-proxy.js';

assert.equal(ozonProxyConfig({}), undefined);
assert.deepEqual(ozonProxyConfig({OZON_PROXY_URL:'http://user%40name:p%3Ass@127.0.0.1:8888'}), {
  server:'http://127.0.0.1:8888', username:'user@name', password:'p:ss'
});
assert.deepEqual(ozonProxyConfig({OZON_PROXY_URL:'proxy.example:3128'}), {
  server:'http://proxy.example:3128', username:undefined, password:undefined
});
assert.deepEqual(ozonProxyConfig({OZON_PROXY_SERVER:'http://legacy:9000',OZON_PROXY_USERNAME:'u',OZON_PROXY_PASSWORD:'p'}), {
  server:'http://legacy:9000', username:'u', password:'p'
});
assert.throws(()=>ozonProxyConfig({OZON_PROXY_URL:'http://host-no-port'}), /host and port/);
console.log('ozon proxy tests: OK');
