# 字符串字面量与不可变性

Python 的 **str** 是不可变的 Unicode 字符序列。这两点("不可变" + "Unicode")决定了字符串大量行为。

## 3 种字面量写法

```python
a = 'single quotes'
b = "double quotes"
c = """triple quotes
spans multiple lines"""
```

**单引号 vs 双引号** — 行为完全一样,只是看引号方便:

```python
'he said "hi"'              # 内含双引号,用单引号包外面方便
"don't"                     # 内含单引号,用双引号方便
"can\"t"                    # 也可以用反斜杠转义,但读起来累
```

**三引号** 主要用于:
- 多行字符串(保留换行,不需要 `\n`)
- docstring(函数 / 类的第一句字符串)

## 转义和 raw string

字符串里的 `\` 是转义符:

```python
'C:\\Users\\gyh'    # \\ 表示一个真正的 \
'line1\nline2'      # \n 表示换行
'tab\there'         # \t 表示 tab
```

Windows 路径反斜杠多得离谱,Python 提供 **raw string**:在引号前加 `r`,反斜杠不被解释:

```python
r'C:\Users\gyh'     # 4 字符  C : \ U,跟 'C:\\Users\\gyh' 等价
r'\n'               # 2 字符  \ n,**不是**换行
```

正则表达式特别建议用 raw string(`re.compile(r'\d+')`),避免被 Python 字符串先解释一次再被 re 模块再解释一次的混乱。

## 不可变性

字符串创建后**不能改**。任何"修改"都创建新字符串:

```python
s = 'hello'
s[0] = 'H'           # TypeError: 'str' object does not support item assignment
s = s + ' world'     # ★ 看似修改了 s,实际是:创建一个新字符串 'hello world',让 s 指过去
```

**重要含义** — 在循环里反复 `s += 'x'` 性能差(每次都创建新字符串、复制旧内容)。大量拼接用 `''.join(parts)` 或 `io.StringIO`。

## 长度 与 索引

`len(s)` 返字符数(不是字节数)。中文字符也算 1:

```python
len('hello')       # 5
len('你好')        # 2

s = 'hello'
s[0]               # 'h'
s[-1]              # 'o'
s[1:4]             # 'ell'  (切片同 list,左闭右开)
```

字符串切片返 str,不是 list。**索引出来的"单字符"也是 str**(长度 1),Python 没有 char 类型。
