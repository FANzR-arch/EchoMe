import {test,expect,type Page} from '@playwright/test';
const admin='http://127.0.0.1:5175';
const noOverflow=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);

test('knowledge: teach an entry, plain-language toggles, AI draft confirmed, history kept',async({page})=>{
 await page.goto(admin+'/admin/knowledge');
 await expect(page.getByRole('heading',{name:'它知道什么',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/核心资料包 · 待主人审核/})).toContainText('已停用');
 await expect(page.getByRole('meter',{name:'「每次都带上」字数'})).toBeVisible();
 await page.getByRole('link',{name:'教它一件事'}).first().click();
 const title='浏览器验收资料 '+Date.now();
 await page.getByRole('textbox',{name:'新资料标题',exact:true}).fill(title);
 await page.getByRole('textbox',{name:'新资料内容',exact:true}).fill('这是工作台自动化验收资料。');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 await expect(page.getByText('你写的',{exact:false}).first()).toBeVisible();
 await page.getByRole('switch',{name:'每次都带上',exact:true}).click();
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByText('已保存。测试对话马上会用到；发布后访客才能看到。',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('switch',{name:'每次都带上',exact:true})).toBeChecked();
 await page.getByText('让 AI 帮我改',{exact:true}).click();
 await page.getByRole('textbox',{name:'修改要求',exact:true}).fill('整理这段验收资料，等待审核。');
 await expect(page.getByRole('button',{name:'用 Codex 起草',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'交给其他 AI 助手',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'可复制的任务',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'草稿正文',exact:true}).fill('这是经人工确认的验收资料新版。');
 await page.getByRole('button',{name:'确认修改',exact:true}).click();
 await expect(page.getByText('修改已生效，发布后访客可见',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue('这是经人工确认的验收资料新版。');
 await page.getByRole('switch',{name:'启用',exact:true}).click();
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByText('已停用',{exact:true})).toBeVisible();
 await page.getByText('历史版本',{exact:false}).click();
 await expect(page.locator('.adm-history > li')).toHaveCount(4);
 await page.screenshot({path:'test-results/workbench-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('button',{name:'保存',exact:true})).toBeVisible();
 expect(await noOverflow(page)).toBe(true);
 await page.screenshot({path:'test-results/workbench-mobile.png',fullPage:true});
});

test('one conversation inbox: unanswered question surfaces, correction becomes unpublished knowledge, delete asks first',async({page})=>{
 const {WorkbenchStore}=await import('../server/workbench-store.ts');const store=new WorkbenchStore('.workbench-test-data');
 store.db.prepare("DELETE FROM runs WHERE conversation LIKE 'browser-review-%'").run();
 const conversation='browser-review-'+Date.now(),question='审核验收问题 '+Date.now();
 const snapshot={input:[{role:'user',content:question}],response:'原始回答不可被批注改写',status:'complete',model:'fixture-not-real',selected:[{title:'测试时的资料版本',excerpt:'当时正文',urls:[]}],questionId:'same-question',durationMs:123,usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}};
 store.startRun(snapshot,conversation);const second=store.startRun({...snapshot,response:'第二次尝试：现有资料没有这方面的信息，我无法确认。'},conversation);
 try{
  await page.goto(admin+'/admin/inbox');
  const card=page.locator('.adm-card').filter({hasText:'第二次尝试'});
  await expect(card).toContainText(question);
  await expect(card).toContainText('它没答上来');
  await card.getByRole('button',{name:'纠正这个回答',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'哪里不对',exact:true}).fill('需要核实');
  await dialog.getByRole('textbox',{name:'正确的说法',exact:true}).fill('主人确认的正确说法。');
  await dialog.getByRole('button',{name:'保存纠正',exact:true}).click();
  await expect(page.getByText('已记下。测试对话马上会用到；发布后访客才能看到。',{exact:true})).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(store.runs().find(r=>r.id===second)?.review).toEqual({note:'需要核实',corrected:'主人确认的正确说法。',reviewed:true});
  expect(store.runs().find(r=>r.id!==second&&r.conversation===conversation)?.response).toBe('原始回答不可被批注改写');
  await page.getByRole('link',{name:'它知道什么',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索资料',exact:true}).fill(question);
  const entry=page.getByRole('link',{name:new RegExp(question)});
  await expect(entry).toContainText('你在对话里纠正的');
  await expect(entry).toContainText('未发布');
  await page.getByRole('link',{name:'对话',exact:true}).click();
  await page.getByRole('button',{name:'访客',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(question)}).click();
  await expect(page.getByText('原始回答不可被批注改写',{exact:true})).toBeVisible();
  await expect(page.getByText('同一个问题的第 2 次回答',{exact:true})).toBeVisible();
  await expect(page.locator('.adm-corrected')).toContainText('主人确认的正确说法。');
  await page.getByText('详情',{exact:true}).first().click();
  await expect(page.getByText('fixture-not-real',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'删除这段对话',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'删除',exact:true}).click();
  await expect(page.getByRole('button',{name:new RegExp(question)})).toHaveCount(0);
  expect(store.runs().some(r=>r.conversation===conversation)).toBe(false);
 }finally{store.close();}
});

test('concurrent editor rejects stale save; version rollback preserves history',async({page,context})=>{
 await page.goto(admin+'/admin/knowledge');
 await page.getByRole('link',{name:/阿哲 个人介绍/}).click();
 const original=await page.getByRole('textbox',{name:'资料正文',exact:true}).inputValue();
 const other=await context.newPage();await other.goto(admin+'/admin/knowledge?item=doc%3Aprofile');
 await other.getByRole('textbox',{name:'资料正文',exact:true}).fill(original+'\n并发新版');await other.getByRole('button',{name:'保存',exact:true}).click();
 await expect(other.getByText('已保存。测试对话马上会用到；发布后访客才能看到。',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'资料正文',exact:true}).fill(original+'\n旧编辑器修改');await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('资料已被更新');await expect(page.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue(original+'\n旧编辑器修改');
 await other.getByText('历史版本',{exact:false}).click();
 const revision=other.locator('.adm-history > li').filter({hasText:'并发新版'}).first();
 await revision.locator('summary').click();
 await revision.getByRole('button',{name:'恢复到这次修改之前',exact:true}).click();
 await other.getByRole('dialog').getByRole('button',{name:'恢复',exact:true}).click();
 await expect(other.getByText('已恢复先前版本',{exact:true})).toBeVisible();
 await expect(other.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue(original);
});

test('try it: test chat answers, correction drafts a change that is confirmed from the inbox',async({page})=>{
 await page.goto(admin+'/admin/inbox');
 await expect(page.getByRole('heading',{name:'待处理',exact:true})).toBeVisible();
 const panel=page.getByRole('complementary',{name:'试一试'});
 await expect(panel).toBeVisible();
 await expect(panel).toContainText('模拟回答');
 await panel.getByRole('textbox',{name:'测试问题',exact:true}).fill('你好');
 await panel.getByRole('button',{name:'发送测试问题',exact:true}).click();
 const answer=panel.getByTestId('test-assistant-message');
 await expect(answer.getByRole('button',{name:'纠正这个回答',exact:true})).toBeVisible();
 await answer.getByRole('button',{name:'纠正这个回答',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('textbox',{name:'正确的说法',exact:true}).fill('阿哲现在主要做独立产品设计。');
 await dialog.getByRole('radio',{name:/改进一条已有资料/}).check();
 await dialog.getByRole('combobox',{name:'要改进的资料',exact:true}).selectOption('doc:profile');
 await dialog.getByRole('button',{name:'保存纠正',exact:true}).click();
 await expect(page.getByText('已生成修改草稿，在「待处理」里确认后生效。',{exact:true})).toBeVisible();
 const card=page.locator('.adm-card').filter({hasText:'来自你的纠正'}).first();
 await card.getByRole('button',{name:'查看并确认',exact:true}).click();
 await expect(card.getByRole('textbox',{name:'草稿正文',exact:true})).toHaveValue(/阿哲现在主要做独立产品设计。/);
 await card.getByRole('button',{name:'确认修改',exact:true}).click();
 await expect(page.getByText('修改已生效，发布后访客可见',{exact:true})).toBeVisible();
 await page.goto(admin+'/admin/knowledge?item=doc%3Aprofile');
 await expect(page.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue(/阿哲现在主要做独立产品设计。/);
 await panel.getByRole('button',{name:'收起试一试',exact:true}).click();
 await expect(panel).toBeHidden();
 await page.setViewportSize({width:390,height:844});
 await page.goto(admin+'/admin/conversations');
 await expect(panel).toBeHidden();
 await page.getByRole('button',{name:'试一试',exact:true}).click();
 await expect(panel.getByRole('textbox',{name:'测试问题',exact:true})).toBeVisible();
 expect(await noOverflow(page)).toBe(true);
});

test('publish page shows pending changes, asks before publishing, and offers the embed code',async({page})=>{
 await page.goto(admin+'/admin/publish');
 await expect(page.getByRole('heading',{name:'发布与嵌入',exact:true})).toBeVisible();
 await expect(page.getByLabel('嵌入代码',{exact:true})).toContainText('/embed.js" data-label="和我的 AI 聊聊" defer></script>');
 await page.getByText('下一步：部署到线上',{exact:true}).click();
 await expect(page.getByLabel('部署命令',{exact:true})).toHaveText('npm run deploy:vercel');
 const publish=page.getByRole('button',{name:'发布',exact:true});
 if(await publish.isEnabled()){
  await publish.click();
  await expect(page.getByRole('dialog')).toContainText('deploy/knowledge-release.json');
  // Cancel: the e2e servers must never overwrite the real release file.
  await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 for(const [from,to] of [['/admin/overview','/admin/inbox'],['/admin/security','/admin/publish'],['/admin/notifications','/admin/publish'],['/','/admin/inbox']]){await page.goto(admin+from);await expect(page).toHaveURL(admin+to);}
 await page.setViewportSize({width:390,height:844});
 await page.goto(admin+'/admin/publish');
 expect(await noOverflow(page)).toBe(true);
});
