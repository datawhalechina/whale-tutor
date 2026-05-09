// commitlint 配置 — 跟 CONTRIBUTING.md "Commit message 约定" 段对齐。
// 在 commit-msg 钩子(.husky/commit-msg)里跑,不通过会拒绝 commit。
//
// 通过格式:`<type>(<scope>): <短描述>`,例:
//   feat(pattern): 加 fill-in-blank pattern
//   fix(session): switchChapter 后 sidebar 未刷新
//   course(python-basics): 加迭代器进阶章节
//   release(cli): v0.1.0
//
// 不通过会报错并指明哪个规则不满足。绕过(不推荐):git commit --no-verify

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 在 conventional defaults 基础上加项目特有 type
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // bug 修复
        'refactor', // 重构(不影响行为)
        'perf', // 性能优化
        'docs', // 文档
        'style', // 代码风格(空格 / 分号 / 等,不影响逻辑)
        'test', // 测试
        'chore', // 杂项(配置 / 构建 / 依赖等)
        'ci', // CI 配置
        'build', // 构建系统
        'revert', // 回滚
        'course', // ★ 项目特有:课程内容(scope 写课程 id,如 course(python-basics):)
        'release', // ★ 项目特有:发版 commit(scope 通常 cli)
      ],
    ],
    // 限制 subject(冒号后描述)长度,避免 git log 难看
    'subject-max-length': [2, 'always', 100],
    // 中文 commit 描述不要求小写 / 不要求结尾无标点
    'subject-case': [0],
    'subject-full-stop': [0],
  },
};
