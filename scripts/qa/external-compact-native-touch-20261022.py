"""Проверка IME настоящими касаниями Android без CDP. Только synthetic stand8770."""
import json, os, re, subprocess, xml.etree.ElementTree as ET
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/qa/external-freight-feed-20261020/compact-ui-20261022'
OUT.mkdir(parents=True, exist_ok=True)
results = []
for name, role, env_key in [('xiaomi', 'client', 'XIAOMI_SERIAL'), ('huawei', 'driver', 'HUAWEI_SERIAL')]:
    serial = os.environ[env_key]
    def adb(*args):
        return subprocess.check_output(['adb', '-s', serial, *args], timeout=18)
    def ui():
        # Cold Chrome can report null-root during its first frame; retry only fresh dumps.
        for _ in range(3):
            data = adb('exec-out', 'uiautomator', 'dump', '/dev/tty').decode()
            if '<?xml' in data and '</hierarchy>' in data:
                return ET.fromstring(data[data.index('<?xml'):data.rindex('</hierarchy>')+len('</hierarchy>')])
        raise RuntimeError('Fresh XML missing after bounded retries')
    def bounds(node):
        return list(map(int, re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds')).groups()))
    def tap(label):
        for _ in range(4):
            root = ui()
            nodes = [n for n in root.iter('node') if (label in (n.get('text'), n.get('content-desc')) or (label.startswith('Лента ') and n.get('content-desc', '').startswith(label+', '))) and bounds(n)[2] > bounds(n)[0]]
            if nodes:
                b = bounds(nodes[0]); adb('shell','input','tap',str((b[0]+b[2])//2),str((b[1]+b[3])//2)); return
        raise RuntimeError('Visible target missing: '+label)
    def shot(label):
        (OUT / (name+'-native-touch-'+label+'-STAND.png')).write_bytes(adb('exec-out','screencap','-p'))
    if os.environ.get('RESTART_ONLY'): adb('shell','am','force-stop','com.android.chrome')
    adb('shell','am','start','-a','android.intent.action.VIEW','-d','http://127.0.0.1:8770/qa-start?role='+role,'-p','com.android.chrome')
    print(name+': opened', flush=True)
    if role == 'client': tap('Машины')
    tap('Лента машин' if role == 'client' else 'Лента грузов')
    if os.environ.get('RESTART_ONLY'):
        root = ui()
        if not any('Убрать из сохранённых' in (n.get('text'), n.get('content-desc')) for n in root.iter('node')):
            raise RuntimeError('Saved bookmark missing after Chrome process restart')
        shot('after-chrome-restart')
        results.append({'device': name, 'role': role, 'chrome_process_restart': 'PASS', 'bookmark': 'PASS', 'source': 'synthetic stand8770; no APK; no data clearing'})
        (OUT/'native-restart-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)
        continue
    tap('Откуда')
    adb('shell','input','text','China')
    root = ui()
    inputs = [bounds(n) for n in root.iter('node') if n.get('class') == 'android.widget.EditText' and n.get('text') == 'China']
    if not inputs: raise RuntimeError('Focused input with entered China missing')
    shot('keyboard')
    tap('Найти')
    root = ui()
    if any('Сброс' in (n.get('text'), n.get('content-desc')) for n in root.iter('node')): raise RuntimeError('Apply did not close filter')
    print(name+': apply PASS', flush=True)
    tap('Откуда')
    root = ui()  # После автофокуса ждём свежую геометрию IME, а не снимаем переходный кадр.
    reopened = [bounds(n) for n in root.iter('node') if n.get('class') == 'android.widget.EditText']
    if not reopened or max(b[3]-b[1] for b in reopened) < inputs[0][3]-inputs[0][1]-3:
        raise RuntimeError('Reopened input is clipped by IME')
    shot('reopen-keyboard')
    tap('Сброс')
    root = ui()
    if any('Сброс' in (n.get('text'), n.get('content-desc')) for n in root.iter('node')): raise RuntimeError('Reset did not close filter')
    shot('reset')
    record = {'device': name, 'role': role, 'font_scale': adb('shell','settings','get','system','font_scale').decode().strip(), 'input_bounds': inputs, 'apply': 'PASS', 'reset': 'PASS', 'touch': 'fresh Android UI tree; no CDP', 'source': 'synthetic stand8770; final working tree; no APK'}
    results.append(record)
    (OUT/'native-touch-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(record,ensure_ascii=False), flush=True)
