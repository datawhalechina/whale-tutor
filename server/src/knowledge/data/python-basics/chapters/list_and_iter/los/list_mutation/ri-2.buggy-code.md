def add_zero(items):
    items.append(0)
    return items

original = [1, 2, 3]
result = add_zero(original)
print(original)   # 期望输出 [1, 2, 3]
print(result)     # 期望输出 [1, 2, 3, 0]
