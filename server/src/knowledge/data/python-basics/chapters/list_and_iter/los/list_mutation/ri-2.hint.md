先想想:`add_zero` 既 `return` 了一个 list,又**对参数做了什么操作**?

如果 `original` 在函数返回后变了,意味着函数内部哪一行做了 in-place 修改?
