import { test, expect, type Page } from '@playwright/test';
const base='http://127.0.0.1:5174';
async function setup(page:Page) {
 await page.route('**/api/config', r=>r.fulfill({json:{mode:'real',configured:true,model:'transport-fixture'}}));
}
async function ask(page:Page,text='介绍一下阿哲') {await page.getByRole('textbox',{name:'输入消息',exact:true}).fill(text);await page.getByRole('button',{name:'发送消息',exact:true}).click();}
const response=(text:string)=>JSON.stringify({type:'snapshot',text})+'\n'+JSON.stringify({type:'done',sources:['https://example.com/'],model:'transport-fixture',durationMs:12,usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15},finish:'stop'})+'\n';
test('real adapter: multi-turn, retry, provenance, refresh and draft restore',async({page})=>{
 await setup(page);const payloads:any[]=[];
 await page.route('**/api/chat',r=>{payloads.push(r.request().postDataJSON());return r.fulfill({contentType:'application/x-ndjson',body:response('根据公开资料，阿哲是设计师。')});});
 await page.goto(base+'/chat');await expect(page.getByText('真实 AI · 本机')).toBeVisible();await ask(page);
 await expect(page.getByTestId('assistant-message')).toContainText('AI 生成');await expect(page.getByRole('button',{name:'停止生成',exact:true})).toHaveCount(0);
 await ask(page,'他的兴趣呢？');await expect(page.getByTestId('assistant-message')).toHaveCount(2);await expect(page.getByRole('button',{name:'停止生成',exact:true})).toHaveCount(0);
 expect(payloads[1].messages.map((m:any)=>m.role)).toEqual(['user','assistant','user']);
 await page.getByRole('button',{name:'重试回答',exact:true}).last().click();await expect(page.getByRole('button',{name:'停止生成',exact:true})).toHaveCount(0);await expect(page.getByTestId('assistant-message')).toHaveCount(2);expect(payloads[2].messages).toEqual(payloads[1].messages);
 await page.getByRole('textbox',{name:'输入消息',exact:true}).fill('未发送草稿');await page.reload();await expect(page.getByTestId('assistant-message')).toHaveCount(2);await expect(page.getByRole('textbox',{name:'输入消息',exact:true})).toHaveValue('未发送草稿');
 await page.getByRole('button',{name:'新对话',exact:true}).click();await expect(page.getByTestId('user-message')).toHaveCount(0);
 await page.getByRole('button',{name:'历史',exact:true}).click();await page.getByRole('button',{name:'介绍一下阿哲',exact:true}).click();await expect(page.getByTestId('assistant-message')).toHaveCount(2);
});
test('real adapter: broken stream retains partial answer, bilingual error, no mock fallback',async({page})=>{
 await setup(page);await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'snapshot',text:'已收到的部分回答'})+'\n'}));
 await page.goto(base+'/chat');await ask(page);await expect(page.getByTestId('assistant-message')).toContainText('连接中断');await expect(page.getByTestId('assistant-message')).toContainText('已收到的部分回答');await expect(page.getByTestId('assistant-message')).not.toContainText('固定演示回答');
 await page.reload();await expect(page.getByTestId('assistant-message')).toContainText('连接中断');
 await page.getByRole('button',{name:'切换语言'}).click();await page.getByRole('button',{name:'Retry response'}).click();await expect(page.getByTestId('assistant-message')).toContainText('Connection interrupted');
});
test('real adapter: missing key explicitly fails and mobile controls remain visible',async({page})=>{
 await setup(page);await page.route('**/api/chat',r=>r.fulfill({status:503,json:{error:'NOT_CONFIGURED'}}));
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/chat');await ask(page);await expect(page.getByTestId('assistant-message')).toContainText('真实模式尚未配置');
 for(const name of ['新对话','历史','联系阿哲'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'docs/previews/local-ai-mobile.png',fullPage:true});
});

// Exercise actual chunked HTTP delivery and browser cancellation without a model call.
test('real adapter: stop preserves streamed text and navigation bridge saves before leaving',async({page})=>{
 const {createServer,request}=await import('node:http');let closed=false;
 const server=createServer((req,res)=>{
  if(req.url !== '/api/chat'){const proxy=request('http://127.0.0.1:5174'+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:5174'}},upstream=>{res.writeHead(upstream.statusCode??502,upstream.headers);upstream.pipe(res);});req.pipe(proxy);return;}
  res.writeHead(200,{'Content-Type':'application/x-ndjson','Access-Control-Allow-Origin':'http://127.0.0.1:5174','Access-Control-Allow-Headers':'content-type'});
  if(req.method==='OPTIONS'){res.end();return;}
  res.write(JSON.stringify({type:'snapshot',text:'这是已生成的内容'})+'\n');
  const timer=setInterval(()=>res.write(JSON.stringify({type:'snapshot',text:'这是已生成的内容，仍在生成。'})+'\n'),150);
  res.on('close',()=>{clearInterval(timer);closed=true;});
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
 try{
  await setup(page); const fixtureBase=`http://127.0.0.1:${port}`;
  await page.goto(fixtureBase+'/chat?embed=1&host=portfolio&surface=immersive&parentOrigin='+encodeURIComponent(fixtureBase));
  await page.locator('.chat-page').waitFor({state:'attached'});
  await page.evaluate(()=>window.postMessage({type:'pai:host-state',requestId:'test',active:true,locale:'zh'},location.origin));
  await ask(page);await expect(page.getByTestId('assistant-message')).toContainText('这是已生成');
  await page.getByRole('button',{name:'停止生成',exact:true}).click();await expect(page.getByRole('button',{name:'停止生成',exact:true})).toHaveCount(0);await expect.poll(()=>closed).toBe(true);
  await expect(page.getByTestId('assistant-message')).toContainText('这是已生成');
  await page.getByRole('textbox',{name:'输入消息',exact:true}).fill('切页草稿');
  const saved=await page.evaluate(()=>new Promise<boolean>(resolve=>{const timeout=setTimeout(()=>resolve(false),3000);const listener=(e:MessageEvent)=>{if(e.data?.type==='pai:saved'&&e.data.requestId==='nav'){clearTimeout(timeout);window.removeEventListener('message',listener);resolve(e.data.ok);}};window.addEventListener('message',listener);window.postMessage({type:'pai:prepare-navigation',requestId:'nav'},location.origin);}));
  expect(saved).toBe(true);await page.goto(fixtureBase+'/chat');await expect(page.getByTestId('assistant-message')).toContainText('这是已生成');await expect(page.getByRole('textbox',{name:'输入消息',exact:true})).toHaveValue('切页草稿');
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('Markdown: X link, lists, code, table, safe HTML, refresh and mobile',async({page})=>{
 await setup(page);const text='可以直接联系 [阿哲的联系页](https://example.com/contact)。\n\n**想聊的方向**\n\n- 产品\n- 设计\n\n`示例代码`\n\n|方向|说明|\n|---|---|\n|设计|聊聊想法|\n\n<script>window.injected=true</script>\n[危险链接](javascript:alert(1))\n[来源未核实 / unverified source]';
 await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:response(text)}));await page.goto(base+'/chat');await ask(page,'怎么联系阿哲？');
 const message=page.getByTestId('assistant-message');const link=message.getByRole('link',{name:'阿哲的联系页',exact:true});await expect(link).toHaveAttribute('href','https://example.com/contact');await expect(link).toHaveAttribute('target','_blank');await expect(message.locator('strong')).toHaveText('想聊的方向');await expect(message.locator('li')).toHaveCount(2);await expect(message.locator('table')).toBeVisible();await expect(message.locator('code')).toHaveText('示例代码');await expect(message.locator('script')).toHaveCount(0);await expect(message.locator('a[href^="javascript:"]')).toHaveCount(0);await expect(message).not.toContainText('来源未核实');
 await page.context().route('https://example.com/**',r=>r.fulfill({body:'Contact destination intercepted for no-network test'}));const popup=page.waitForEvent('popup');await link.click();const tab=await popup;await tab.waitForLoadState();expect(tab.url()).toBe('https://example.com/contact');await tab.close();
 await page.reload();await expect(link).toBeVisible();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'docs/previews/markdown-mobile.png',fullPage:true});
});
