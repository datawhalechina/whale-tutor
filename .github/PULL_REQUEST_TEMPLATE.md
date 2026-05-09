<!--
感谢你愿意贡献!提交前请把下面所有 checkbox 勾完(用 [x] 替代 [ ])。
未填完的 PR 我们会先关闭让你补全,不是不欢迎,只是节省所有人时间。

如果你只是改了文档错别字 / 链接修复,可以删掉下面"测试 / 截图"部分。
-->

## 这个 PR 干了什么

<!-- 一两句说清楚改了什么。不要复述 diff -->

## 为什么

<!-- 动机 / 关联 issue。如果对应 issue,写 "Closes #123" / "Refs #123" -->

## 怎么测的

<!-- 跑过哪些命令、手测了哪些流程。CI 会自动跑 typecheck + lint + build,但不能替代手测 -->

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过(0 警告)
- [ ] `pnpm format:check` 通过(或跑过 `pnpm format`)
- [ ] 本地 `pnpm dev` 起来手测过相关流程
- [ ] 如果改了课程内容:`whale-tutor lint` / `pnpm dev:server` 启动日志无报错
- [ ] 如果改了 schema:本地 `pnpm db:reset` 重建过

## 截图

<!-- UI 改动**必填**截图(at least 1)。有 GIF 更好 -->

---

## 🤖 关于 AI 生成代码 — 必读必勾

我们欢迎使用 AI 工具(Cursor / Claude Code / Copilot 等)辅助编码,但**对 AI 生成内容的最终质量负责的人是你,不是 AI**。提交本 PR 即声明:

- [ ] **我已阅读并完全理解这个 PR 中的每一行改动**(包括 AI 生成的部分),不存在"AI 写了我没看懂但跑通了就提"的情况
- [ ] **我能用自己的话解释**:这个 PR 涉及的核心模块在做什么、为什么这样改、有没有更简单的方案我考虑过但放弃了
- [ ] **我承诺及时响应 maintainer 的所有 review 评论**(48 小时内至少给出"已读 + 大致计划"回复;改动 1 周内推完或主动告知延期)
- [ ] **如果 maintainer 问我"这段为什么这么写",我能给出有依据的回答**(不能只回答"AI 这么写的")
- [ ] **我已通读** [CONTRIBUTING.md](../CONTRIBUTING.md)**;如果改动跨多个核心模块,我也读了 [CLAUDE.md](../CLAUDE.md) 的"5 条核心原则"和"模块边界"**

> **为什么强调这一点**:Whale Tutor 是教育类项目,代码质量直接影响学习者体验。AI 生成代码常见问题:静默 try/catch 吞错误、为不会发生的场景过度防御、引入项目没用到的抽象、复制粘贴 stale 的 import、与项目现有约定不一致。**maintainer 没法替每个 PR 提交者把关每一行,所以这个责任必须前移到提交者**。
>
> 如果你只是想试一下 AI 是否能完成某个任务、自己没真的理解代码,**请不要提 PR** — 可以开 Issue 讨论,或在 Discussions 分享你的尝试。这不是不欢迎,而是节省所有人时间。

---

## Commit message 检查

- [ ] 用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 风格(`feat(scope): ...` / `fix(scope): ...` / `course(python-basics): ...` 等)
- [ ] 一个 PR 解决一件事;混合提交建议拆 PR

## 法律

- [ ] 我理解并同意我的贡献按 [AGPL-3.0-or-later](../LICENSE) 协议授权
- [ ] 我提交的代码 / 内容是我自己写的(或来自合规可商用的来源,并已注明)

---

<!-- 删了下面这行也行 -->
<sub>不确定怎么填?看 [CONTRIBUTING.md](../CONTRIBUTING.md) 或在 PR 里 @ maintainer 问。</sub>
