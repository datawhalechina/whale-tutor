写一个函数 `clean_csv_row(line: str) -> list[str]`,把一行 CSV(逗号分隔)切成字段列表,**每个字段去掉首尾空白**。

例:
- `clean_csv_row('  apple , banana  ,cherry')` → `['apple', 'banana', 'cherry']`
- `clean_csv_row('a,,b')` → `['a', '', 'b']`(空字段保留为空字符串)
- `clean_csv_row('')` → `['']`

提示:`.split(',')` + 列表推导 + `.strip()` 一行能写完。
