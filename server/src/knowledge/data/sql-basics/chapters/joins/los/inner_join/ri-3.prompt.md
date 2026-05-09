用你自己的话解释:

> 已知 `users(id, name, country)` 和 `orders(id, user_id, amount)` 两张表。
> 写一条 SQL,**返回每个订单的 amount 和下单用户的 name**(只要 amount > 100 的订单)。
> 用表别名 `u`、`o`。

要点:
- 完整 SQL(写出来)
- 解释 ON 子句和 WHERE 子句各自负责什么
- 说明用 `o.id` 而不是 `id` 的原因(如果你的 SELECT 列表含 id 的话)
