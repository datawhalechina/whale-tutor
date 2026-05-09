INNER JOIN 的核心:**只保留两边都有匹配的行**。orders.user_id=99 的订单在 users 表里找不到 id=99 → 该订单**不会出现在结果里**。同理,users 表里有但 orders 表里没下单的用户也不会出现。"两边都有匹配"是 INNER 的字面含义。如果想保留 orders 表全部行(即使没匹配的 user),用 LEFT JOIN(本课不展开)。
