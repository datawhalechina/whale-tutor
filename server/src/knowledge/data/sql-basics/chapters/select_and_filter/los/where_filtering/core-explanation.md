# WHERE 子句过滤行

`SELECT` 选**列**,`WHERE` 过滤**行**。两者正交。

## 基本结构

```sql
SELECT name, age
FROM users
WHERE age >= 18;
```

只返回 `age >= 18` 的行。WHERE 子句**对每一行求值**,返回 true 的行进结果。

## 比较运算符

| 操作符 | 语义 |
|---|---|
| `=` | 等于(注意:**单等号**,不是 `==`) |
| `<>` 或 `!=` | 不等于 |
| `<` `<=` `>` `>=` | 大小比较 |
| `BETWEEN a AND b` | 闭区间 [a, b] |
| `IN (...)` | 属于列表 |
| `LIKE '...'` | 字符串模糊匹配(`%` 通配多字符,`_` 通配 1 字符) |
| `IS NULL` / `IS NOT NULL` | NULL 判断(★ 不能用 `= NULL`) |

```sql
SELECT * FROM users WHERE country IN ('CN', 'US', 'JP');
SELECT * FROM users WHERE name LIKE 'Z%';        -- 名字 Z 开头
SELECT * FROM users WHERE phone IS NULL;          -- 没填手机号的
SELECT * FROM users WHERE age BETWEEN 18 AND 30;
```

## 逻辑组合:AND / OR / NOT

```sql
SELECT * FROM users
WHERE age >= 18 AND country = 'CN';

SELECT * FROM products
WHERE price < 100 OR category = 'sale';

SELECT * FROM users
WHERE NOT (status = 'banned');
```

**优先级**:`NOT > AND > OR`。复杂表达式用括号强制顺序:

```sql
WHERE (a OR b) AND c        -- 括号必要,否则 a OR (b AND c) 完全不同
```

## NULL 的特殊性

NULL 在 SQL 不等于任何值,**包括它自己**:

```sql
SELECT * FROM users WHERE phone = NULL;       -- ✗ 永远返 0 行(NULL = NULL 不为 true)
SELECT * FROM users WHERE phone IS NULL;       -- ✓ 正确
```

`AND` / `OR` 遇到 NULL 也有特殊语义(三值逻辑),但日常牢记 "判 NULL 用 IS [NOT] NULL" 就够避绝大多数坑。

## SQL 子句的固定顺序

```sql
SELECT ...      -- 1. 选什么列
FROM ...         -- 2. 从哪个表
WHERE ...        -- 3. 过滤哪些行(★ ORDER BY 之前)
ORDER BY ...     -- 4. 怎么排
LIMIT n;         -- 5. 取前 n 行(部分数据库用 TOP / FETCH FIRST)
```

写错顺序数据库会报语法错。**逻辑上**先 FROM 找表 → WHERE 过滤行 → SELECT 选列 → ORDER BY 排序,但**写法上**永远 SELECT 在前。

## 字符串区分大小写吗?

**取决于数据库**和列的 collation(排序规则)。MySQL 默认大小写不敏感(`'a' = 'A'`),PostgreSQL 默认敏感。写跨数据库代码用 `LOWER(col) = 'value'` 显式强制。
