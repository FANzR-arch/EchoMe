# 开源来源与许可

本项目按需复用组件，没有引入完整第三方产品。下列文件保留为可编辑源码。

| 来源                                         | 使用方式                                                                                                                                                                                                                                  | 许可证                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| https://github.com/assistant-ui/assistant-ui | `@assistant-ui/react`；`src/components/chat-thread.tsx` 基于官方 `templates/minimal/components/assistant-ui/elements/thread.aui.tsx` 的消息、输入、重试与滚动结构裁剪。移除附件、语音、编辑分支和工具调用，加入双语文案、来源和业务反馈。 | MIT                     |
| https://github.com/shadcn-ui/ui              | 官方 `shadcn@4.21.0` CLI，`base-nova` 风格，生成 `src/components/ui/`、`src/hooks/use-mobile.ts`；修正生成器的 cn import 到本项目 utils。                                                                                                 | MIT                     |
| https://github.com/mui/base-ui               | shadcn Base UI 组件的底层交互、焦点与弹层能力。                                                                                                                                                                                           | MIT                     |
| https://github.com/lucide-icons/lucide       | Lucide React 图标。                                                                                                                                                                                                                       | ISC，包内附相关来源许可 |
| https://github.com/jakearchibald/idb         | IndexedDB Promise 封装。                                                                                                                                                                                                                  | ISC                     |
| https://github.com/emilkowalski/sonner       | Toast 通知反馈。                                                                                                                                                                                                                          | MIT                     |

生成时间：2026-09-16。安装的准确版本见 package-lock.json。第三方包各自的完整许可证随 npm 包保留在 node_modules 中；复制或分发第三方内容时须保留适用的声明。

本地适配：Tabs 的方向选择器显式使用 `data-orientation`，兼容当前 Tailwind 配置；Sonner 使用本项目主题上下文。未使用的 Card 和 Dropdown Menu 生成文件已移除。

## MIT — copied source attribution

Copyright (c) 2025 AgentbaseAI Inc. (assistant-ui)

Copyright (c) 2023 shadcn (shadcn/ui)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
