正确答案是 **`10\n20\n30`**。

`for x in nums` 中,**`x` 在每轮循环绑当前元素**,而不是索引。所以 `print(x)` 依次打出 10, 20, 30。

如果想要索引,有两种写法:

```python
# 写法 1:不推荐,啰嗦
for i in range(len(nums)):
    print(i, nums[i])

# 写法 2:Pythonic
for i, x in enumerate(nums):
    print(i, x)
```

如果你来自 C / Java,可能习惯了 `for (int i = 0; i < n; i++) arr[i]`,Python 的 `for x in arr` 一开始会觉得"不对劲"。但实际上这种写法更直接 — 你想用元素就用元素,不需要先拿索引再 `arr[i]` 解一层。

记忆:**Python 的 for 默认对元素**,要索引就 `enumerate`。
