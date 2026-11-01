// Browser regression with explicitly simulated transport. No cloud writes or model calls.
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const row={id:'00000000-0000-0000-0000-000000000001',conversation:'test-conversation',created:'2026-09-19',response:'原始回答',input:[{role:'user',content:'主人做什么项目？'}],status:'complete',model:'mock-test',selected:[],review:{}};
 let days=7,deleted=false,reviewed=false;
 await page.route('**/api/workbench/**',async route=>{
  const action=new URL(route.request().url()).pathname.split('/').at(-1);
  const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  let result={};
  if(action==='session')result={token:'ui-test'};
  if(action==='state')result={assets:[],runs:[],proposals:[],revisions:[],cli:false,detailReading:{available:false}};
  if(action==='cloud-state')result={configured:true,runs:deleted?[]:[row],settings:{retention_days:days}};
  if(action==='cloud-retention')days=body.days;
  if(action==='cloud-review'){reviewed=true;expect(body.note).toBe('测试批注');}
  if(action==='cloud-delete')deleted=true;
  await route.fulfill({json:result});
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.goto(process.env.PAI_TEST_ADMIN_URL||'http://127.0.0.1:4175/admin/knowledge');
 await page.getByRole('button',{name:'线上存档',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'云端存档保留期限'})).toHaveValue('7');
 await page.getByRole('combobox',{name:'云端存档保留期限'}).selectOption('30');
 await expect.poll(()=>days).toBe(30);
 await page.getByRole('button',{name:/主人做什么项目/}).click();
 await page.getByLabel('批注',{exact:true}).fill('测试批注');
 await page.getByRole('button',{name:'保存批注，原回答不变'}).click();
 await expect.poll(()=>reviewed).toBe(true);await expect(page.getByText('原始回答',{exact:true})).toBeVisible();
 await page.screenshot({path:'docs/previews/cloud-review-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('combobox',{name:'云端存档保留期限'})).toBeVisible();
 await page.screenshot({path:'docs/previews/cloud-review-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'删除整个会话',exact:true}).click();
 await expect(page.getByText('暂无存档')).toBeVisible();expect(deleted).toBe(true);expect(errors).toEqual([]);
 console.log('Cloud archive desktop/mobile: retention, review preservation and whole-conversation deletion passed with mocked transport.');
}finally{await browser.close();}
