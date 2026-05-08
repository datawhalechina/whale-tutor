"""一次性 e2e 闭环验证脚本。
按答案表(按 patternId 派发)自动答题,直到撞到尚未实现的 pattern 或 chapter_complete。
"""
import json
import urllib.request
import urllib.error

BASE = 'http://localhost:3000'

CONCEPT_CHECK_ANSWERS = {
    'ri.list.basics.1': 0,           # []
    'ri.list.basics.2': 1,           # 可变长
    'ri.list.basics.3': 1,           # 合法,len==4
    'ri.list.indexing.1': 1,         # a[2] = 'z'
    'ri.list.indexing.2': 1,         # [20, 30]
    'ri.list.indexing.3': 1,         # IndexError + []
    'ri.list.mutation.1': 1,         # [1, 2, [3, 4]]
    'ri.list.mutation.3': 1,         # [10, 20]
    'ri.iter.for_over_list.1': 1,    # 10/20/30
}

SPOT_THE_BUG_ANSWERS = {
    'ri.list.mutation.2': {
        'selectedLines': [2],
        'explanation': (
            '函数内 items.append(0) 直接修改了传入的原列表,因为 list 是可变对象、'
            '参数是引用传递。返回 items 后,调用方的 original 也变了。'
            '要保持 original 不变,应该用 items + [0] 创建新列表返回。'
        ),
    },
}


def post(path, body):
    req = urllib.request.Request(
        f'{BASE}{path}',
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def make_body(it):
    """根据 patternId 装配 submit body。返回 None 表示无答案/不支持。"""
    pid = it['patternId']
    rid = it['requiredInteractionId']
    if pid == 'concept_check':
        if rid not in CONCEPT_CHECK_ANSWERS:
            return None
        return {
            'interactionId': it['id'],
            'patternId': 'concept_check',
            'response': {'selectedIndex': CONCEPT_CHECK_ANSWERS[rid]},
        }
    if pid == 'spot_the_bug':
        if rid not in SPOT_THE_BUG_ANSWERS:
            return None
        return {
            'interactionId': it['id'],
            'patternId': 'spot_the_bug',
            'response': SPOT_THE_BUG_ANSWERS[rid],
        }
    return None


# 1. 起 session
status, data = post('/sessions', {'learnerId': 1, 'courseId': 'python-basics'})
if status not in (200, 201):
    print(f'session start failed: {data}')
    raise SystemExit(1)

sid = data['sessionId']
it = data['interaction']
print(f'session={sid}')
print(f'  → lo={it["loId"]} ri={it["requiredInteractionId"]} pattern={it["patternId"]}')

step = 1
while it:
    body = make_body(it)
    if body is None:
        print(f'  step {step}: no answer for {it["requiredInteractionId"]} (pattern={it["patternId"]}),stopping')
        break
    status, d = post(f'/sessions/{sid}/responses', body)
    if status not in (200, 201):
        print(f'  step {step} HTTP {status}: {d}')
        break
    ev = d['evaluation']
    ls = d['updatedLoState']
    nd = d['nextDecision']['primary']
    ni = d.get('nextInteraction')
    next_summary = (
        f'{ni["loId"]}/{ni["requiredInteractionId"]}/{ni["patternId"]}'
        if ni else '—'
    )
    print(
        f'step {step:>2}: ri={it["requiredInteractionId"]:<28} pattern={it["patternId"]:<13} '
        f'correct={ev["correct"]!s:<5} conf={ev["confidence"]:<4} kind={ev["evaluatorKind"]:<13} '
        f'mastery={ls["masteryLevel"]:<10} mandComplete={ls["mandatoryAllCompleted"]!s:<5} → next={next_summary}'
    )
    if not ni:
        print(f'  no next interaction; final action={nd["type"]}')
        break
    it = ni
    step += 1
