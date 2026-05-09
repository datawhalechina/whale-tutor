INNER JOIN 必须有 `ON 连接条件`。没有 ON 子句的 SQL 是**笛卡尔积**(每行 × 每行,通常是 bug)。`ON o.user_id = u.id` 是典型连接条件:订单的外键 user_id 等于用户表的主键 id。`USING (id)` 是简写但要求两表列名相同,不通用。
