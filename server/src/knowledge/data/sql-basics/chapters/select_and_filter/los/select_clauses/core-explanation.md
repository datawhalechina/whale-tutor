# SELECT 子句基础

最小可执行的 SQL 查询长这样:

```sql
SELECT column1, column2
FROM table_name;
```

读作:**从 `table_name` 这张表里,选 `column1` 和 `column2` 两列的所有行**。

## 4 件事情要弄清

### 1. 列选择

```sql
SELECT name, age FROM users;          -- 选 name 和 age 两列
SELECT * FROM users;                   -- 选所有列(* 是通配符)
SELECT DISTINCT country FROM users;    -- 选不重复的 country
```

**`*` 在生产代码里少用** — 列变化时调用代码会跟着变。但临时探索 ("我看下这表长啥样") 很顺手。

### 2. 别名(AS)

```sql
SELECT name AS user_name, age AS user_age
FROM users;
```

结果集的列名就是 `user_name` / `user_age`,不是 `name` / `age`。`AS` 关键字可省(`SELECT name user_name`)但加上更清晰。

### 3. 计算列

`SELECT` 后不止是列名,还可以是**任意表达式**:

```sql
SELECT name, age * 12 AS age_in_months FROM users;
SELECT name, salary * 0.1 AS bonus FROM users;
SELECT '员工: ' || name AS label FROM users;   -- || 是字符串连接(部分数据库用 +)
```

### 4. 排序(ORDER BY)

```sql
SELECT name, age FROM users ORDER BY age;          -- 默认升序 (ASC)
SELECT name, age FROM users ORDER BY age DESC;     -- 降序
SELECT name FROM users ORDER BY age DESC, name;    -- 多列排序
```

## 注意:大小写 + 分号

- SQL **关键字不区分大小写**:`SELECT` / `select` / `Select` 都行。社区惯例:**关键字大写**,标识符(列名 / 表名)小写。
- **每条语句以分号 `;` 结尾**(交互式 client 必需,程序里看驱动)

## 常见错误

```sql
-- ✗ 列名拼错
SELECT nme FROM users;        -- ERROR: column 'nme' does not exist

-- ✗ 表名拼错
SELECT * FROM user;           -- 注意 user 是 reserved word(在某些数据库),建议用 users / user_table

-- ✗ ORDER BY 用列号而非列名 (有些数据库支持但不推荐)
SELECT name, age FROM users ORDER BY 2;   -- 按第 2 列(age)排,可读性差
```
