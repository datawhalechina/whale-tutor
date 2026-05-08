# 用 for 遍历列表

把列表里每个元素拿出来用一遍,是日常写代码最常见的模式之一。Python 的 `for` 比 C/Java 的索引循环简洁很多。

## 基本形态

```python
nums = [10, 20, 30]
for x in nums:
    print(x)
# 10
# 20
# 30
```

注意:`x` 是**当前元素**,不是索引。这跟 C 的 `for (int i = 0; i < n; i++)` 风格完全不同。

## 三种最常见用法

### 1. 累加 (reduce)

```python
total = 0
for x in nums:
    total += x
# total == 60
```

也可以用内建 `sum(nums)`,但理解循环写法是基础。

### 2. 筛选 (filter)

```python
evens = []
for x in nums:
    if x % 2 == 0:
        evens.append(x)
# 10 和 20 都是偶数,evens == [10, 20]
```

### 3. 变换 (map)

```python
squared = []
for x in nums:
    squared.append(x * x)
# squared == [100, 400, 900]
```

这三种(累加/筛选/变换)是数据处理的基础动作。学完它们,后面学列表推导、map/filter 内建函数都是水到渠成。

## 真的需要索引时

```python
for i in range(len(nums)):
    print(i, nums[i])
```

但更 Pythonic 的写法是 `enumerate`:

```python
for i, x in enumerate(nums):
    print(i, x)
```

**经验法则**:除非循环体真的依赖 i(比如改原列表,或同时操作两个序列),否则**直接 `for x in nums`** 最清晰。

## 一个陷阱:循环中改 list 长度

```python
nums = [1, 2, 3, 4]
for x in nums:
    if x == 2:
        nums.remove(x)   # 危险!
```

这段代码可能会跳过元素或行为奇怪。**遍历时不要修改正在遍历的 list**。如果非要改,先复制一份:

```python
for x in nums[:]:    # 切片拷贝
    ...
```
