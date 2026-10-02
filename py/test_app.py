"""Tests of py/app.py against the sibling xjyutping-py (PYTHONPATH=../xjyutping-py/src)."""
import json
import os
import re
from pathlib import Path

import pytest
from xjyutping import Jyutping

import app

PY = Path(os.environ.get('XJYUTPING_PY', Path(__file__).resolve().parents[2] / 'xjyutping-py'))
PARITY = PY / 'tests' / 'parity_corpus.txt'
J = Jyutping()


def lesson(text, **kw):
    d = {'title': '', 'author': '', 'audience': 'en', 'text': text, 'words': {}, 'spots': {}, 'kinds': {}}
    d.update(kw)
    return d


def rows(text, **kw):
    return json.loads(app.render(json.dumps(lesson(text, **kw))))


def readings(row):
    return [it['r'] for it in row['items'] if it['cjk']]


def test_automatic_readings_equal_annotate():
    for line in ['我哋去銀行。', '佢行咗去步行街', '校長喺學校長大', 'T恤 3點']:
        got = [(it['c'], it['r']) for it in rows(line)[0]['items']]
        assert got == J.annotate(line)


def test_word_correction_reaches_other_lines_and_sentences():
    r = rows('銀行\n我哋去銀行。\n佢行咗去步行街', words={'銀行': 'ngan4 haang4'})
    assert readings(r[0]) == ['ngan4', 'haang4']
    assert readings(r[1])[3:5] == ['ngan4', 'haang4']
    assert r[1]['items'][3]['src'] == 'word' and r[1]['items'][3]['key'] == '銀行'


def test_word_correction_never_cuts_a_segment():
    # 行街 inside 步行|街 crosses a segment boundary, so it must not apply
    r = rows('佢行咗去步行街', words={'行街': 'haang4 gaai1'})
    assert readings(r[0]) == [a for _, a in J.annotate('佢行咗去步行街')]


def test_word_correction_does_not_change_other_lines():
    lines = [l for l in PARITY.read_text(encoding='utf8').splitlines()
             if l.strip() and not l.startswith('\\')]
    text = '\n'.join(lines)
    before = rows(text)
    after = rows(text, words={'行街': 'haang4 gaai1', '唔好': 'm4 hou2', '一個': 'jat1 go3'})
    for a, b in zip(before, after):
        for x, y in zip(a['items'], b['items']):
            if y['src'] != 'word':
                assert x['r'] == y['r']


def test_widened_span_applies_elsewhere():
    # 你好 is two single-character segments; as a lesson word it applies where both
    # characters stand as whole segments (老細|你|好), not inside 你好嘢
    r = rows('你好\n老細你好\n佢話你好嘢', words={'你好': 'nei5 hou3'})
    assert readings(r[0]) == ['nei5', 'hou3']
    assert readings(r[1]) == ['lou5', 'sai3', 'nei5', 'hou3']
    assert readings(r[2]) == ['keoi5', 'waa6', 'nei5', 'hou2', 'je5']


def test_spot_applies_to_its_occurrence_only():
    r = rows('行，行！\n行', spots={'行，行！': {'2': 'hang4'}})
    assert readings(r[0]) == ['haang4', 'hang4']
    assert readings(r[1]) == ['haang4']


def test_spot_ignored_inside_a_dictionary_word():
    r = rows('銀行', spots={'銀行': {'1': 'haang4'}})
    assert readings(r[0]) == ['ngan4', 'hong4']


def test_spot_on_character_without_data_and_over_a_word():
    r = rows('佢𠮶度')
    assert r[0]['items'][1]['cjk'] and r[0]['items'][1]['r'] is None
    r = rows('佢𠮶度', spots={'佢𠮶度': {'1': 'go2'}})
    assert readings(r[0]) == ['keoi5', 'go2', 'dou6']
    r = rows('你好', words={'你好': 'nei5 hou3'}, spots={'你好': {'1': 'hou2'}})
    assert readings(r[0]) == ['nei5', 'hou2']


@pytest.mark.parametrize('line,kind', [
    ('好', 'char'), ('好！', 'char'), ('你好', 'word'), ('T恤', 'word'), ('3點', 'word'),
    ('食咗飯未', 'word'), ('銀行（銀號）', 'word'), ('銀行 bank', 'word'), ('銀行。', 'sentence'),
    ('我哋聽日去銀行攞錢', 'sentence'), ('你好，我係陳生', 'sentence'),
])
def test_automatic_kind(line, kind):
    assert rows(line)[0]['auto'] == kind


def test_chosen_kind_and_duplicates():
    r = rows('食咗飯未\n食咗飯未', kinds={'食咗飯未': 'sentence'})
    assert r[0]['kind'] == 'sentence' and not r[0]['duplicate'] and r[1]['duplicate']


def test_lines_are_normalised():
    r = rows('銀\u200b行\n 銀\u00a0行 ')
    assert r[0]['line'] == '銀行' and readings(r[0]) == ['ngan4', 'hong4']
    assert r[1]['line'] == '銀 行'


def test_candidates_and_check():
    c = json.loads(app.candidates(json.dumps(lesson('行')), 0, 0))
    assert c['auto'] == 'haang4' and 'hong4' in c['all']
    c = json.loads(app.candidates(json.dumps(lesson('佢𠮶度\n𠮶', spots={'佢𠮶度': {'1': 'go2'}})), 1, 0))
    assert c['given'] == ['go2'] and '𠮶' not in c['all']
    assert json.loads(app.check(' HONG4')) == {'value': 'hong4', 'valid': True, 'known': True}
    assert not json.loads(app.check('xyz9'))['valid']
    assert json.loads(app.check('zzz1')) == {'value': 'zzz1', 'valid': True, 'known': False}


def test_clean_drops_bad_corrections():
    raw = lesson('x', words={'銀行': 'ngan4 haang4', '行': 'hang4', '你好': 'nei5', '我哋': 'ngo5 }'},
                 spots={'行': {'0': 'hang4', 'a': 'x', '1': 'bad'}}, kinds={'行': 'odd'}, audience='fr')
    got = json.loads(app.clean(json.dumps(raw)))
    assert got['lesson']['words'] == {'銀行': 'ngan4 haang4'}
    assert got['lesson']['spots'] == {'行': {'0': 'hang4'}}
    assert got['lesson']['kinds'] == {} and got['lesson']['audience'] == 'en'
    assert set(got['dropped']) >= {'行', '你好', '我哋'}


def test_migrate_moves_spots_with_an_edited_line():
    l = lesson('行，行！\n好', spots={'行，行！': {'0': 'hang4', '2': 'hong4'}}, kinds={'行，行！': 'word'})
    l['text'] = '行，咁行！\n好'
    got = json.loads(app.migrate(json.dumps(l), '行，行！\n好'))
    assert got['lesson']['spots'] == {'行，咁行！': {'0': 'hang4', '3': 'hong4'}}
    assert got['lesson']['kinds'] == {'行，咁行！': 'word'} and got['lost'] == 0
    l['text'] = '行，走！\n好'
    got = json.loads(app.migrate(json.dumps(l), '行，行！\n好'))
    assert got['lesson']['spots'] == {'行，走！': {'0': 'hang4'}} and got['lost'] == 1


def tex(text, **kw):
    return app.make_tex(json.dumps(lesson(text, **kw)))


def test_syllables_match_cjk_count():
    lines = [l for l in PARITY.read_text(encoding='utf8').splitlines() if l.strip() and not l.startswith('\\')]
    lines.append('〇 𱍐 T恤 3點 八折 20% & 半價 \\ ~ ^ # _ { } $ -')
    # make_tex refuses lines with a character that has no reading (e.g. 乄)
    lines = [r['line'] for r in rows('\n'.join(lines)) if all(it['r'] for it in r['items'] if it['cjk'])]
    body = tex('\n'.join(lines))
    for m in re.finditer(r'\\xjyutping\{(.*?)\}\{([a-z0-9 ]*)\}', body):
        entry = re.sub(r'\\[a-z]+\{\}|\\.|-\{\}', '', m.group(1))
        count = sum(1 for c in entry if app._is_cjk(c, J.annotate(c)[0][1]))
        assert count == len(m.group(2).split()), m.group(0)


def test_escaping_in_every_cell():
    body = tex('八折 20% & 半價', title='A & B_1', author='陳 ~ 李')
    assert r'\title{A \& B\_1}' in body and r'\author{陳 \textasciitilde{} 李}' in body
    row = next(l for l in body.splitlines() if l.startswith('\\xjyutping{'))
    assert row == (r'\xjyutping{八折 20\% \& 半價}{baat3 zit3 bun3 gaa3} & '
                   r'baat3 zit3 20\% \& bun3 gaa3 & \\')


def test_injected_reading_is_rejected():
    with pytest.raises(ValueError):
        tex('佢𠮶度', spots={'佢𠮶度': {'1': r'}\input{x}'}})


def test_missing_reading_raises_and_passes_when_corrected():
    with pytest.raises(ValueError, match='𠮶'):
        tex('佢𠮶度')
    assert r'\xjyutping{佢𠮶度}{keoi5 go2 dou6}' in tex('佢𠮶度', spots={'佢𠮶度': {'1': 'go2'}})


def test_audience_sections_and_duplicates():
    en = tex('好\n銀行\n銀行\n我哋去銀行。', date='2 October 2026')
    assert en.count(r'\xjyutping{銀行}') == 1
    assert '\\section*{Characters}' in en and '\\section*{Vocabulary}' in en and '\\section*{Sentences}' in en
    assert 'Word & Jyutping & English' in en and r'\date{2 October 2026}' in en
    zh = tex('好', audience='zh')
    assert '\\section*{單字}' in zh and '字 & 粵拼 & 普通話' in zh and re.search(r'\\date\{\d{4}年\d+月\d+日\}', zh)
    assert '\\section*{Vocabulary}' not in tex('好')


def test_jyutping_cell_keeps_punctuation_and_latin():
    line = '你好，我係 Peter（陳生）。'
    body = tex(line, kinds={line: 'word'})
    row = next(l for l in body.splitlines() if l.startswith('\\xjyutping{'))
    assert row.split(' & ')[1] == 'nei5 hou2, ngo5 hai6 Peter (can4 saang1).'


def test_spaced_word_is_corrected_by_character():
    # xjyutping joins 銀 行 across the space; each character takes its own spot
    r = rows('銀 行 bank', spots={'銀 行 bank': {'2': 'haang4'}})
    assert readings(r[0]) == ['ngan4', 'haang4'] and r[0]['items'][2]['src'] == 'spot'


def test_adjacent_word_occurrences_carry_their_start():
    r = rows('銀行銀行', words={'銀行': 'ngan4 haang4'})
    assert [it['at'] for it in r[0]['items']] == [0, 0, 2, 2]


def test_migrate_keeps_the_corrections_of_an_identical_line():
    l = lesson('好\n好！', spots={'好': {'0': 'hou3'}, '好！': {'0': 'hou2'}})
    l['text'] = '好\n好'
    got = json.loads(app.migrate(json.dumps(l), '好\n好！'))
    assert got['lesson']['spots']['好'] == {'0': 'hou3'} and got['moves'] == []
    l = lesson('行，咁行！', spots={'行，行！': {'2': 'hong4'}})
    got = json.loads(app.migrate(json.dumps(l), '行，行！'))
    assert got['moves'] == [['行，行！', 2, '行，咁行！', 3]]


def test_clean_survives_malformed_parts():
    raw = lesson('x', words=['a'], spots={'行': None, '好': {'²': 'hou2', '02': 'hou3'}}, kinds='odd')
    got = json.loads(app.clean(json.dumps(raw)))['lesson']
    assert got['words'] == {} and got['spots'] == {'好': {'2': 'hou3'}} and got['kinds'] == {}


def test_control_characters_and_ligatures_are_escaped():
    body = tex('好\x0b好 <<書>>,,', title='Lesson\x0b1')
    assert '\x0b' not in body and r'\title{Lesson 1}' in body
    assert r'\xjyutping{好 好 <{}<書>{}>,{},}{hou2 hou2 syu1}' in body


def test_quotes_in_the_jyutping_cell():
    row = next(l for l in tex('佢話「你好」。', kinds={'佢話「你好」。': 'word'}).splitlines()
               if l.startswith('\\xjyutping{'))
    assert row.split(' & ')[1] == app.escape('keoi5 waa6 "nei5 hou2".')


def test_cantonese_audience():
    yue = tex('好\n銀行', audience='yue')
    assert '\\section*{單字}' in yue and '字 & 粵拼 & 筆記' in yue and '詞彙 & 粵拼 & 筆記' in yue
    assert re.search(r'\\date\{\d{4}年\d+月\d+日\}', yue) and '普通話' not in yue
    got = json.loads(app.clean(json.dumps(lesson('x', audience='yue', toneChart='yes'))))['lesson']
    assert got['audience'] == 'yue' and got['toneChart'] is False


def test_tone_chart_only_when_asked():
    plain = tex('好')
    assert 'pict2e' not in plain and '\\tonechart' not in plain
    en = tex('好', toneChart=True)
    assert '\\usepackage{pict2e}' in en and en.index('\\maketitle') < en.index('\\section*{The six tones}\n\\tonechart')
    assert en.count('\\vector(') == 6 and 'Tone 2 (陰上)\\\\High rising' in en and '{\\small High}' in en
    zh = tex('好', audience='zh', toneChart=True)
    assert '\\section*{聲調}' in zh and '\\small 2 陰上}' in zh and 'High rising' not in zh and '{\\small 高}' in zh


def test_sentences_are_written_out_with_lines_for_notes():
    short, long = '我哋去銀行。', '今日天氣好好，我哋一齊去公園散步，見到好多小朋友喺度玩。'
    for audience, label in (('en', 'English:'), ('zh', '普通話：'), ('yue', '筆記：')):
        body = tex(f'{short}\n{long}', audience=audience)
        part = body[body.index('\\section*{'):]
        assert 'longtable' not in part and 'Sentence &' not in part and '句子 &' not in part
        assert part.count('\\begin{minipage}') == 2 and part.count('{\\small ' + label + '}\\enspace\\hrulefill') == 2
        assert '\\Large\\xjyutping{我哋去銀行。}{ngo5 dei6 heoi3 ngan4 hong4}' in part
    # one writing line per 15 characters, at most three
    blocks = tex(f'{short}\n{long}').split('\\begin{minipage}')[1:]
    assert [b.count('\\hrulefill') for b in blocks] == [1, 2]
