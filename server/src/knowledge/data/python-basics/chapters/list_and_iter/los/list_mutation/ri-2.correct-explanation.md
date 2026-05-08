## bug 在第 2 行:`items.append(0)` 修改了**原 list**

调用方期望 `original` 保持 `[1, 2, 3]` 不变,但实际上:

- `add_zero(original)` 把 `original` 的引用传给 `items`,**它们指向同一个 list**
- `items.append(0)` 是 in-place 修改,直接改了那个共享对象
- 结果:`original` 变成了 `[1, 2, 3, 0]`,与期望不符

注释中的"期望输出 `[1, 2, 3]`"暴露了这个**副作用**(side effect)是非预期的。

## 两种修法

**方法 1:返回新 list(纯函数风格,推荐)**

```python
def add_zero(items):
    return items + [0]   # 创建新 list,不修改原 items
```

**方法 2:函数内显式拷贝**

```python
def add_zero(items):
    items = items[:]     # 浅拷贝,后续修改不影响原对象
    items.append(0)
    return items
```

## 经验法则

如果函数 **应该** 修改传入的 list(如 `list.sort()` 风格),让它返回 `None`,且函数名暗示 in-place(动词 + 副词,如 `sort` / `extend` / `append`)。

如果函数 **不应该** 修改传入的 list(纯函数风格),用 `+`、切片、列表推导生成新 list,函数名是名词或形容词(如 `sorted` / `reversed`)。

Python 标准库自己就用这种命名约定区分:`list.sort()` 返回 `None` 改原列表;`sorted(list)` 返回新列表。
