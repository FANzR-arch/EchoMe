import { test, expect, type Page } from "@playwright/test";
async function ask(page: Page, text = "介绍一下阿哲") {
  await page.getByRole("textbox", { name: "输入消息", exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
async function finished(page: Page) {
  await expect(
    page.getByRole("button", { name: "停止生成", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("assistant-message")).not.toHaveCount(0);
}
test("visitor chat persists; retry does not duplicate; feedback, contact and notes reach admin", async ({
  page,
}) => {
  await page.goto("/chat");
  await ask(page);
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await finished(page);
  await page.getByRole("button", { name: "重试回答" }).click();
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await finished(page);
  await expect(page.getByTestId("user-message")).toHaveCount(1);
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await page.getByRole("button", { name: "有问题", exact: true }).click();
  await page.getByRole("button", { name: "联系阿哲", exact: true }).click();
  await page
    .getByRole("textbox", { name: "想聊什么？" })
    .fill("一个演示合作想法");
  await page.getByRole("button", { name: "保存演示留言" }).click();
  await expect(page.getByText("演示留言已保存，未发送通知。")).toBeVisible();
  await page.goto("/admin/conversations?filter=issue");
  await expect(page.getByText("一个演示合作想法")).toBeVisible();
  await page
    .getByRole("textbox", { name: "内部备注", exact: true })
    .fill("私密备注只用于审核");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.getByText("备注已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "内部备注", exact: true }),
  ).toHaveValue("私密备注只用于审核");
  await page.getByRole("button", { name: "补充理想答案" }).click();
  await page
    .getByRole("textbox", { name: "理想答案", exact: true })
    .fill("这是由主人批准的演示答案。");
  await page.getByRole("button", { name: "保存到知识草稿" }).click();
  await expect(page.getByText("已加入知识草稿，尚未启用", { exact: true })).toBeVisible();
  await page.goto("/admin/knowledge");
  await page.getByRole("tab", { name: "批准答案" }).click();
  await expect(page.getByRole("textbox", { name: "已批准的答案" })).toHaveValue(
    "这是由主人批准的演示答案。",
  );
});
test("cancel retains partial response; new chat and history work; HTML is inert", async ({
  page,
}) => {
  await page.goto("/chat");
  await ask(page, "<img src=x onerror=alert(1)> 介绍一下阿哲");
  await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible();
  await page.getByRole("button", { name: "停止生成" }).click();
  await finished(page);
  await expect(page.locator(".message-list img")).toHaveCount(0);
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await expect(page.getByTestId("user-message")).toHaveCount(0);
  await page.getByRole("button", { name: "历史", exact: true }).click();
  await page
    .getByRole("button", {
      name: "<img src=x onerror=alert(1)> 介绍一下阿哲",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("user-message")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("user-message")).toHaveCount(1);
});
test("draft trial isolated; publish and rollback affect deterministic answers", async ({
  page,
}) => {
  await page.goto("/admin/knowledge");
  await page.getByRole("tab", { name: "系统规则" }).click();
  await page.getByRole("switch", { name: "简洁回答" }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存，未改变已启用规则", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "试聊草稿" }).click();
  await ask(page);
  await finished(page);
  await expect(page.getByTestId("assistant-message")).not.toContainText(
    "固定演示回答",
  );
  await page.keyboard.press("Escape");
  await page.goto("/chat");
  await ask(page);
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await finished(page);
  await page.goto("/admin/knowledge");
  await page.getByRole("button", { name: "启用此版本" }).click();
  await expect(page.getByText("新版本已启用", { exact: true })).toBeVisible();
  await page.goto("/chat");
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await ask(page);
  await finished(page);
  await expect(page.getByTestId("assistant-message")).not.toContainText(
    "固定演示回答",
  );
  await page.goto("/admin/knowledge");
  await page.getByRole("button", { name: "回退", exact: true }).click();
  await expect(
    page.getByText("已回退启用版本，草稿保留", { exact: true }),
  ).toBeVisible();
  await page.goto("/chat");
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await ask(page);
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
});
test("mock network error can retry; safety pause blocks without completion", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.getByRole("combobox", { name: "体验场景" }).click();
  await page.getByRole("option", { name: "网络失败", exact: true }).click();
  await ask(page);
  await expect(page.getByTestId("assistant-message")).toContainText(
    "模拟连接失败",
  );
  await page.getByRole("combobox", { name: "体验场景" }).click();
  await page.getByRole("option", { name: "正常回答", exact: true }).click();
  await page.getByRole("button", { name: "重试回答" }).click();
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await finished(page);
  await page.goto("/admin/security");
  await page.getByRole("switch", { name: "暂停所有演示回答" }).click();
  await expect(page.getByRole("switch", { name: "暂停所有演示回答" })).toBeChecked();
  await page.goto("/chat");
  await ask(page, "你好");
  await expect(page.getByTestId("assistant-message").last()).toContainText(
    "管理员已暂停演示回答",
  );
});
test("mobile iframe closes, restores focus, isolates styles and recovers conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/embed-preview");
  await page.getByRole("button", { name: "和我的 AI 聊聊" }).click();
  const frame = page.frameLocator("iframe");
  await frame
    .getByRole("textbox", { name: "输入消息", exact: true })
    .fill("你好");
  await frame.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(frame.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await frame.getByRole("button", { name: "关闭聊天" }).click();
  await expect(
    page.getByRole("button", { name: "和我的 AI 聊聊" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "和我的 AI 聊聊" }).click();
  await expect(frame.getByTestId("user-message")).toHaveCount(1);
  await expect(page.locator("[data-slot=sheet-content]")).toHaveCSS(
    "width",
    "390px",
  );
  await page.screenshot({ path: "test-results/mobile-embed.png" });
});
test("bilingual theme and admin responsive previews have no overflow", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.screenshot({ path: "test-results/chat-desktop.png" });
  await page.getByRole("button", { name: "切换语言" }).click();
  await expect(page.getByText("A closer connection.")).toBeVisible();
  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.screenshot({ path: "test-results/chat-dark-en.png" });
  await page.goto("/admin/overview");
  await page.screenshot({ path: "test-results/admin-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/admin-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
test("IME enter does not send prematurely", async ({ page }) => {
  await page.goto("/chat");
  const input = page.getByRole("textbox", { name: "输入消息", exact: true });
  await input.fill("你好");
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  await input.dispatchEvent("compositionend");
  await expect(page.getByTestId("user-message")).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByTestId("user-message")).toHaveCount(1);
});

test("all preset scenarios enforce expected outcomes and error survives refresh", async ({
  page,
}) => {
  await page.goto("/chat");
  for (const [scenario, expected] of [
    ["资料不足", "没有这方面的信息"],
    ["提示词诱导", "不能提供内部指令"],
    ["请求过频", "请求过于频繁"],
    ["额度耗尽", "演示每日额度已用完"],
  ]) {
    await page.getByRole("button", { name: "新对话", exact: true }).click();
    await page.getByRole("combobox", { name: "体验场景" }).click();
    await page.getByRole("option", { name: scenario, exact: true }).click();
    await ask(page);
    await expect(page.getByTestId("assistant-message")).toContainText(expected);
    await finished(page);
  }
  await page.reload();
  await expect(page.getByTestId("assistant-message")).toContainText(
    "演示每日额度已用完",
  );
});

test("limits count real demo runs; quota settings and notification switches persist", async ({
  page,
}) => {
  await page.goto("/admin/security");
  await page.getByRole("spinbutton", { name: "每日演示调用上限" }).fill("1");
  await page.getByRole("button", { name: "保存用量限制" }).click();
  await expect(page.getByText("演示限制已保存", { exact: true })).toBeVisible();
  await page.goto("/chat");
  await ask(page);
  await expect(page.getByTestId("assistant-message")).toContainText(
    "固定演示回答",
  );
  await finished(page);
  await ask(page, "第二个问题");
  await expect(page.getByTestId("assistant-message").last()).toContainText(
    "演示每日额度已用完",
  );
  await page.goto("/admin/notifications");
  await page.getByRole("button", { name: "模拟成功" }).click();
  await expect(
    page.getByText("预览已生成，未发送", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "模拟失败" }).click();
  await expect(
    page.getByText("模拟失败", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("switch", { name: "每日摘要", exact: true }).click();
  await expect(page.getByRole("button", { name: "模拟成功" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "模拟成功" })).toBeDisabled();
});

test("export, delete and reset local demo records", async ({ page }) => {
  await page.goto("/admin/conversations");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("personal-ai-demo.json");
  await page
    .locator(".conversation-detail > header")
    .getByRole("button")
    .last()
    .click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.locator(".conversation-list > button")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".conversation-list > button")).toHaveCount(1);
  await page.goto("/admin/security");
  await page.getByRole("button", { name: "重置 Demo" }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "有边界，才安心。" }),
  ).toBeVisible();
  await page.goto("/admin/conversations");
  await expect(page.locator(".conversation-list > button")).toHaveCount(2);
});

test("mobile pages support navigation and do not overflow; embedded messages reject wrong sender", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/chat",
    "/admin/conversations",
    "/admin/knowledge",
    "/admin/security",
    "/admin/notifications",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBeTruthy();
  }
  await page.goto("/embed-preview");
  await page.getByRole("button", { name: "和我的 AI 聊聊" }).click();
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("textbox", { name: "输入消息", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.postMessage({ type: "pai:close" }, location.origin),
  );
  await expect(page.locator("iframe")).toBeVisible();
});

test("capture stable light and dark desktop/mobile views", async ({ page }) => {
  await page.goto("/admin/overview");
  await expect(
    page.getByRole("heading", { name: "每一次交流，都有回响。" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-light-zh.png",
    animations: "disabled",
  });
  await page.goto("/chat");
  await expect(page.getByText("开始了解我。")).toBeVisible();
  await page.screenshot({
    path: "test-results/chat-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/chat-mobile-light.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "切换语言" }).click();
  await page.getByRole("button", { name: "Switch theme" }).click();
  await page.screenshot({
    path: "test-results/chat-mobile-dark-en.png",
    animations: "disabled",
  });
  await page.goto("/admin/knowledge");
  await expect(
    page.getByRole("heading", { name: "Make every answer more considered." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/knowledge-mobile-dark-en.png",
    animations: "disabled",
  });
});
