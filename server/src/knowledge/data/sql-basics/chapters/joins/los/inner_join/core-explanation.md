# INNER JOIN — 关联两张表的最常用方式

## 为什么需要 JOIN

业务数据正规化(分表存)避免冗余。例:

**users 表**:

| id | name | country |
|----|------|---------|
| 1  | Ada  | UK      |
| 2  | Bob  | US      |

**orders 表**:

| id | user_id | amount |
|----|---------|--------|
| 10 | 1       | 99     |
| 11 | 1       | 50     |
| 12 | 2       | 200    |

要查"每个订单 + 下单用户的名字"必须把两表**按 user_id 关联**起来:

```sql
SELECT orders.id, orders.amount, users.name
FROM orders
INNER JOIN users ON orders.user_id = users.id;
```

结果:

| id | amount | name |
|----|--------|------|
| 10 | 99     | Ada  |
| 11 | 50     | Ada  |
| 12 | 200    | Bob  |

## 语法分解

```sql
SELECT <列>                       -- 选哪些列(可来自任一表)
FROM <表 A>
INNER JOIN <表 B>
  ON <连接条件>                    -- ★ 通常 A.foreign_key = B.id
WHERE ...                         -- 可选过滤
ORDER BY ...
```

**关键**:
- `INNER JOIN` 表示"只保留两边都有匹配的行"。orders 表里如果有个 user_id = 99 但 users 表没有 id=99 → 该订单**不出现在结果里**
- `ON` 后写连接条件,通常是外键 = 主键
- `INNER` 关键字可省 (`JOIN` 默认就是 INNER),但写出来更清晰

## 表别名(短名提高可读性)

表名长时用别名:

```sql
SELECT o.id, o.amount, u.name
FROM orders AS o
INNER JOIN users AS u ON o.user_id = u.id;
```

`AS` 可省:`FROM orders o INNER JOIN users u ON ...`

## 列名冲突时必须前缀

如果两张表都有同名列(如都叫 `id`),`SELECT id` 会报歧义错。用 `表别名.列名` 消歧:

```sql
SELECT o.id AS order_id, u.id AS user_id, u.name
FROM orders o INNER JOIN users u ON o.user_id = u.id;
```

## 跟 WHERE 的关系

`ON` 表达**怎么连接**,`WHERE` 表达**留哪些行**。功能上对 INNER JOIN 没区别,但语义上分开放更清晰:

```sql
-- 推荐
SELECT ...
FROM orders o INNER JOIN users u ON o.user_id = u.id
WHERE u.country = 'CN' AND o.amount > 100;

-- 也合法但不清晰(连接条件混进 WHERE)
SELECT ...
FROM orders o INNER JOIN users u ON 1 = 1
WHERE o.user_id = u.id AND u.country = 'CN' AND o.amount > 100;
```

## 多表连接

可以接多个 JOIN:

```sql
SELECT u.name, p.name, o.amount
FROM orders o
INNER JOIN users u ON o.user_id = u.id
INNER JOIN products p ON o.product_id = p.id;
```

每个 JOIN 都需要自己的 ON 条件。
