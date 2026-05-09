`SELECT salary * 12 AS annual_salary FROM employees` — `salary * 12` 是计算列(对每行执行计算),`AS annual_salary` 是给结果列起的别名。结果集会有一列 `annual_salary`,值是每个员工年薪。表达式可以是任何 SQL 标量表达式(算术、字符串、函数调用等)。
