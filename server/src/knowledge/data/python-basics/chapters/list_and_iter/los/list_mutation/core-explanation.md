# 可变性、引用 vs 拷贝

list 是 Python 中最容易出"诡异 bug"的地方,几乎全部源于一个事实:**变量名是对象的引用,不是对象的容器**。

## 修改原 list 的方法(in-place)

```python
a = [1, 2, 3]
a.append(4)        # [1, 2, 3, 4]      末尾追加单个元素
a.extend([5, 6])   # [1, 2, 3, 4, 5, 6] 展开追加可迭代对象
a.pop()            # 6                  弹出末尾,返回它
a.pop(0)           # 1                  弹出指定位置
a[0] = 99          # [99, 2, 3, 4, 5]   赋值修改单元素
```

`append([3, 4])` vs `extend([3, 4])` 是经典初学坑:

```python
a = [1, 2]
a.append([3, 4])    # → [1, 2, [3, 4]]   嵌套 list
a.extend([3, 4])    # → [1, 2, 3, 4]     展开后追加
```

## 引用 vs 拷贝

```python
a = [1, 2, 3]
b = a               # b 不是拷贝!b 与 a 指向同一个 list
b.append(4)
print(a)            # [1, 2, 3, 4]   ← a 也变了
```

要真正拷贝:

```python
b = a[:]            # 切片创建新 list(浅拷贝)
b = list(a)         # 等价
b = a.copy()        # 等价
```

## 函数参数传引用

list 作为参数传入函数,函数内部 mutation **会**影响调用方:

```python
def add_zero(items):
    items.append(0)  # 修改了原 list

original = [1, 2, 3]
add_zero(original)
print(original)      # [1, 2, 3, 0]
```

如果不希望修改外部数据:

```python
def add_zero_pure(items):
    return items + [0]   # 创建新 list,原 items 不变
```

## 一句话记忆

**等号传引用(别名),`[:]` / `list(...)` 才拷贝**。看到 `b = a` 就警觉:它们绑同一对象,任何 in-place 修改互相可见。
