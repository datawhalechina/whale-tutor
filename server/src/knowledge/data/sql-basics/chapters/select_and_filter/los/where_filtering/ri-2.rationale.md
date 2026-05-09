NULL 在 SQL 里**不等于任何值,包括它自己**。`phone = NULL` 永远不为 true(SQL 三值逻辑里它返 NULL),所以查询返 0 行。判 NULL 必须用 `IS NULL` / `IS NOT NULL`。这是 SQL 数十年的语义,任何符合标准的数据库都一样。
