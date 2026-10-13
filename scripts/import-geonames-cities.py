"""Rebuild the offline directory from a separately downloaded GeoNames zip.
GeoNames cities15000, CC BY 4.0. See docs/geonames-attribution.md.
"""
import argparse
import json
from pathlib import Path
import zipfile

parser=argparse.ArgumentParser()
parser.add_argument('archive',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(args.archive) as archive:
    lines=archive.read('cities15000.txt').decode('utf-8').splitlines()
rows={}
for line in lines:
    f=line.split('\t')
    if len(f)!=19 or f[6]!='P' or len(f[8])!=2:
        continue
    aliases=list(dict.fromkeys([f[2]]+[a for a in f[3].split(',') if a and (any('\u0400'<=c<='\u04ff' for c in a) or any('\u4e00'<=c<='\u9fff' for c in a))]))[:16]
    rows.setdefault(f[8],[]).append([f[1],aliases,float(f[4]),float(f[5]),int(f[14] or 0),f[0]])
for cities in rows.values():
    cities.sort(key=lambda row:(-row[4],row[0]))
out=root/'src/data/worldCities.js'
out.write_text('// GeoNames cities15000, CC BY 4.0. See docs/geonames-attribution.md.\nexport default '+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'{sum(map(len,rows.values()))} cities, {len(rows)} country codes')
