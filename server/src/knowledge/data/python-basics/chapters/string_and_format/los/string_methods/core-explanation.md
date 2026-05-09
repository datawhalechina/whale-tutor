# 字符串方法 + f-string 格式化

每天写 Python 你总会用到这一类操作:**清洗、切分、拼接、格式化**。这一节覆盖最高频的方法。

## 清洗:`.strip` / `.rstrip` / `.lstrip`

去掉首尾空白(默认):

```python
'  hello  '.strip()      # 'hello'
'  hello  '.lstrip()     # 'hello  '
'  hello  '.rstrip()     # '  hello'
```

也可以指定要去掉的字符集(**不是子串**,是字符集合):

```python
'#@hello@#'.strip('#@')  # 'hello'  (去掉首尾所有 # 或 @)
```

## 切分:`.split` / `.splitlines`

```python
'a,b,c'.split(',')          # ['a', 'b', 'c']
'a, b , c'.split(',')       # ['a', ' b ', ' c']  ← 注意空格没去!
'a, b , c'.split(', ')      # ['a', 'b , c']      ← 也只按完整 ', ' 切
'  a  b  c '.split()        # ['a', 'b', 'c']     ← 不传参时按任意 whitespace 切并去空段

'line1\nline2\n'.splitlines()  # ['line1', 'line2']  (按平台换行符切,自动忽略末尾空行)
```

`split()` 不传参数时**特殊**:按任意空白切并自动去掉空段。日常推荐这种用法。

## 拼接:`.join`

`.join` 是性能 + 可读性都更好的拼接方式:

```python
', '.join(['a', 'b', 'c'])    # 'a, b, c'
''.join(['h', 'i'])           # 'hi'
'\n'.join(['line1', 'line2']) # 'line1\nline2'
```

**注意**:join 调用方是分隔符,参数是**可迭代对象**(里面元素必须是 str)。这跟人脑直觉相反但记住后很顺手。

## 替换 / 检测

```python
'hello world'.replace('world', 'python')   # 'hello python'
'hello'.startswith('he')                    # True
'hello'.endswith('lo')                      # True
'hello' in 'say hello'                      # True  (Python 字符串支持 in)
```

`replace` 默认替换**所有出现**(不像某些语言只替换第一个);要限制次数加第三参数 `replace('a', 'b', 1)`。

## 大小写

```python
'Hello'.lower()         # 'hello'
'Hello'.upper()         # 'HELLO'
'hello'.capitalize()    # 'Hello'   (首字母大写,其余小写)
'hello world'.title()   # 'Hello World'  (每个单词首字母大写)
```

## f-string(推荐的格式化)

Python 3.6+ 引入,简洁、性能好、最直观:

```python
name = 'Ada'
age = 28
f'{name} is {age} years old'        # 'Ada is 28 years old'
f'next year: {age + 1}'             # 表达式直接放 {} 里
f'{age:5d}'                         # '   28'  (宽度 5,右对齐数字)
f'{3.14159:.2f}'                    # '3.14'   (保留 2 位小数)
f'{name!r}'                         # "'Ada'"  (用 repr,加引号)
```

老式写法(知道就行,新代码不要写):

- `'%s is %d' % (name, age)`(C 风格,可读性差)
- `'{} is {}'.format(name, age)`(.format,比 % 好但不如 f-string)

## 不可变性的实战影响

```python
# 慢(每次都新创建字符串):
s = ''
for x in items:
    s += str(x)

# 快(一次性 join):
s = ''.join(str(x) for x in items)
```

字符串拼接成短(几个 +) 没问题,**长循环里反复 += 是性能 trap**。
