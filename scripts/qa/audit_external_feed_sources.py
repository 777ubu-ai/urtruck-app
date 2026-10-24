"""Читает только публичную историю через имеющуюся серверную авторизацию.
Не вступает в группы, не отправляет сообщения, не меняет рабочую сессию.
"""
import asyncio
import importlib.util
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import MemorySession
from telethon.crypto import AuthKey
from telethon.errors import FloodWaitError
from services.external_freight_parser import map_selected_messages

CANDIDATES = ['gruzuzbekistan','gruzy_horgos','perevozka_cargoinfouz','gruzoperevozka_rf_kz',
              'logistics_kazakhstan','poputno_gruz','TvoiGruz','TIRtrans','roolz_ru_offers']

async def main():
    root=Path('/home/ubuntu/urtruck-telegram-feed')
    spec=importlib.util.spec_from_file_location('source_worker',root/'feed.py')
    worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
    cfg=worker.settings()
    with sqlite3.connect((root/'state/reader.session').as_uri()+'?mode=ro',uri=True) as db:
        dc,address,port,key=db.execute('select dc_id,server_address,port,auth_key from sessions').fetchone()
    memory=MemorySession();memory.set_dc(dc,address,port);memory.auth_key=AuthKey(data=key)
    client=TelegramClient(memory,int(cfg['TELEGRAM_API_ID']),cfg['TELEGRAM_API_HASH'],request_retries=0,flood_sleep_threshold=0)
    report=[]
    await client.connect()
    try:
        for source in CANDIDATES:
            counts={'source':source,'read':0,'cargo':0,'vehicle':0,'review':0}
            try:
                entity=await client.get_entity(source)
                if getattr(entity,'noforwards',False):
                    counts['error']='protected_content';report.append(counts);continue
                async for msg in client.iter_messages(entity,limit=100):
                    if msg.date<datetime.now(timezone.utc)-timedelta(hours=24):break
                    if not msg.raw_text or getattr(msg,'noforwards',False):continue
                    counts['read']+=1
                    items=map_selected_messages(dict(source=source,source_id=entity.id,source_message=msg.id,text=msg.raw_text,source_date=msg.date.timestamp()))
                    for item in items:
                        if item['status']=='active':counts[item['kind']]+=1
                        elif item['status']=='review':counts['review']+=1
                counts['accessible']=True
            except FloodWaitError as exc:
                counts['error']='flood_wait';counts['retry_after']=exc.seconds;report.append(counts);break
            except Exception as exc:counts['error']=type(exc).__name__
            report.append(counts)
            print(json.dumps(counts,ensure_ascii=False),flush=True)
            await asyncio.sleep(1)
    finally:await client.disconnect()
    result={'checked_utc':datetime.now(timezone.utc).isoformat(),'sample_limit_per_source':100,'hours':24,'sources':report}
    Path(sys.argv[1]).write_text(json.dumps(result,ensure_ascii=False,indent=2))

asyncio.run(main())
