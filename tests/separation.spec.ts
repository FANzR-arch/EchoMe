import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

test("visitor site serves only chat and public build excludes admin screens", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174/chat");
  await expect(
    page.getByRole("textbox", { name: "输入消息", exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[href*="admin"]')).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "体验场景" })).toHaveCount(0);
  await page.goto("http://127.0.0.1:5174/admin/knowledge");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByRole("button", { name: "启用此版本" })).toHaveCount(0);
  const files = readdirSync("dist/chat/assets").filter((f) =>
    f.endsWith(".js"),
  );
  const source = files
    .map((f) => readFileSync(join("dist/chat/assets", f), "utf8"))
    .join("\n");
  for (const privateLabel of [
    "启用此版本",
    "保存到知识草稿",
    "保存用量限制",
    "CONVERSATIONS",
    "sample-contact",
  ])
    expect(source).not.toContain(privateLabel);
});

test("independent admin embeds cross-origin visitor chat with trusted close and theme messages", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5175/");
  await expect(
    page.getByRole("heading", { name: "待处理", exact: true }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:5175/chat");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await page.goto("http://127.0.0.1:5175/embed-preview");
  await page.getByRole("button", { name: "切换主题" }).click();
  await page.getByRole("button", { name: "和我的 AI 聊聊" }).click();
  const frame = page.frameLocator("iframe");
  await expect(
    frame.getByRole("textbox", { name: "输入消息", exact: true }),
  ).toBeVisible();
  await expect(frame.locator("html")).toHaveClass("dark");
  await expect(frame.locator('a[href*="admin"]')).toHaveCount(0);
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "和我的 AI 聊聊" }).click();
  await expect(frame.getByTestId("user-message")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/independent-mobile-widget.png",
    animations: "disabled",
  });
});

test('knowledge and server source are not publicly downloadable', async ({ request }) => {
  // Files that only exist on some machines (local keys) are checked when present; the rest always exist.
  const root = process.cwd().replaceAll('\\', '/');
  const paths = ['/knowledge/persona.md', '/knowledge/rules.md', '/knowledge/website/snapshot.json', '/server/knowledge.ts', `/@fs/${root}/server/knowledge.ts?raw`];
  for (const file of ['api.txt', '.env.local']) if (existsSync(file)) paths.push('/' + file, '/' + file + '?raw', `/@fs/${root}/${file}?raw`);
  for (const path of paths) {
    const response = await request.get('http://127.0.0.1:5174' + path);
    expect(response.status(), path).toBe(403);
  }
});
