import {test,expect} from '@playwright/test';

test('workbench saves, previews core/catalog, reviews a manual proposal and handles conflicts',async({page})=>{
 await page.goto('http://127.0.0.1:5175/admin/knowledge');
 await expect(page.getByRole('heading',{name:'核心资料包 · 待主人审核',exact:true})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'启用资料',exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'查看完整核心资料与详细目录',exact:true}).click();
 await expect(page.getByText('详细目录 · 不表示模型已读正文', {exact:true})).toBeVisible();
 await page.getByRole('button',{name:'新增确认资料',exact:true}).click();
 const title='浏览器验收资料 '+Date.now();
 await page.getByRole('textbox',{name:'新资料标题',exact:true}).fill(title);
 await page.getByRole('textbox',{name:'新资料正文',exact:true}).fill('这是工作台自动化验收资料。');
 await page.getByRole('button',{name:'确认并启用新资料',exact:true}).click();
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'资料分类',exact:true}).selectOption('core');
 await page.getByRole('button',{name:'保存资料与启用状态',exact:true}).click();
 await expect(page.getByText('已保存；启用状态决定是否进入下一次回答',{exact:true})).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:title,exact:true}).click();
 await expect(page.getByRole('combobox',{name:'资料分类',exact:true})).toHaveValue('core');
 await page.getByRole('textbox',{name:'修改要求',exact:true}).fill('整理这段验收资料，等待审核。');
 await page.getByRole('button',{name:'生成可复制任务',exact:true}).click();
 await page.getByRole('textbox',{name:'提案正文',exact:true}).fill('这是经人工确认的验收资料新版。');
 await page.getByRole('button',{name:'确认草稿并启用',exact:true}).click();
 await expect(page.getByText('提案已确认生效',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'资料与人设',exact:true}).click();
 await page.getByRole('button',{name:title,exact:true}).click();
 // Selecting the same item refreshes its version after proposal publication.
 await expect(page.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue('这是经人工确认的验收资料新版。');
 await page.getByRole('checkbox',{name:'启用资料',exact:true}).uncheck();
 await page.getByRole('button',{name:'保存资料与启用状态',exact:true}).click();
 await page.screenshot({path:'test-results/workbench-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('button',{name:'保存资料与启用状态',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/workbench-mobile.png',fullPage:true});
});

test('conversation review keeps original answers, groups attempts and deletes the entire audit',async({page})=>{
 const {WorkbenchStore}=await import('../server/workbench-store.ts');const store=new WorkbenchStore('.workbench-test-data');
 store.db.prepare("DELETE FROM runs WHERE conversation LIKE 'browser-review-%'").run();
 const conversation='browser-review-'+Date.now();
 const snapshot={input:[{role:'user',content:'审核验收问题'}],response:'原始回答不可被批注改写',status:'complete',model:'fixture-not-real',selected:[{title:'测试时的资料版本',excerpt:'当时正文',urls:[]}],questionId:'same-question',durationMs:123,usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}};
 store.startRun(snapshot,conversation);store.startRun({...snapshot,response:'第二次尝试的原始回答'},conversation);store.close();
 await page.goto('http://127.0.0.1:5175/admin/conversations');
 await expect(page.getByRole('button',{name:/审核验收问题 · 尝试/})).toHaveCount(2);
 await page.getByRole('button',{name:/审核验收问题 · 尝试 1/}).click();
 await page.getByLabel('审核备注',{exact:true}).fill('需要核实');await page.getByLabel('我认可的正确说法',{exact:true}).fill('修正草稿');
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/workbench/review')&&r.status()===200),page.getByRole('button',{name:'保存审核，不改变知识',exact:true}).click()]);await page.reload();
 await page.getByRole('button',{name:/审核验收问题 · 尝试 1/}).click();
 await expect(page.getByLabel('审核备注',{exact:true})).toHaveValue('需要核实');
 await expect(page.getByText('第二次尝试的原始回答',{exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除整个会话审核记录',exact:true}).click();
 await expect(page.getByRole('button',{name:/审核验收问题 · 尝试/})).toHaveCount(0);
});

test('concurrent editor rejects stale save; version rollback preserves history',async({page,context})=>{
 await page.goto('http://127.0.0.1:5175/admin/knowledge');
 await page.getByRole('button',{name:'林夏 个人介绍',exact:true}).click();
 const original=await page.getByRole('textbox',{name:'资料正文',exact:true}).inputValue();
 const other=await context.newPage();await other.goto('http://127.0.0.1:5175/admin/knowledge');await other.getByRole('button',{name:'林夏 个人介绍',exact:true}).click();
 await other.getByRole('textbox',{name:'资料正文',exact:true}).fill(original+'\n并发新版');await other.getByRole('button',{name:'保存资料与启用状态',exact:true}).click();await expect(other.getByText('已保存；启用状态决定是否进入下一次回答',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'资料正文',exact:true}).fill(original+'\n旧编辑器修改');await page.getByRole('button',{name:'保存资料与启用状态',exact:true}).click();await expect(page.getByRole('alert')).toContainText('资料已被更新');await expect(page.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue(original+'\n旧编辑器修改');
 await other.getByRole('button',{name:'版本记录',exact:true}).click();const revision=other.locator('details.wb-card').filter({hasText:'并发新版'}).first();await revision.locator('summary').click();other.once('dialog',d=>d.accept());await revision.getByRole('button',{name:'恢复修改前版本',exact:true}).click();await expect(other.getByText('已恢复先前版本',{exact:true})).toBeVisible();await other.getByRole('button',{name:'资料与人设',exact:true}).click();await other.getByRole('button',{name:'林夏 个人介绍',exact:true}).click();await expect(other.getByRole('textbox',{name:'资料正文',exact:true})).toHaveValue(original);
});
