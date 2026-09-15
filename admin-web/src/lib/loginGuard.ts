import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MAX_IP_FAILURES = 10;
const MAX_ACCOUNT_FAILURES = 5;
const BLOCK_MS = 15 * 60 * 1000;
type Entry = { failures: number; blockedUntil: number };
type Store = Record<string, Entry>;

export class LoginGuardUnavailable extends Error {}

function filePath(){ return join(process.cwd(), '.admin-data', 'login-guard.json'); }
function normalizeIp(ip:string){ return String(ip || 'unknown').slice(0,64); }
function normalizeUser(username:string){ return String(username || '').trim().toLowerCase().slice(0,80); }
function ipKey(ip:string){ return `ip:${normalizeIp(ip)}`; }
function accountKey(ip:string, username:string){ return `acct:${normalizeIp(ip)}|${normalizeUser(username)}`; }

function read():Store {
  const p=filePath();
  if(!existsSync(p)) return {};
  try {
    const parsed=JSON.parse(readFileSync(p,'utf8'));
    if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_login_guard_store');
    return parsed as Store;
  } catch (error) {
    throw new LoginGuardUnavailable(error instanceof Error ? error.message : 'login_guard_unavailable');
  }
}

function write(store:Store){
  const p=filePath();
  try {
    mkdirSync(dirname(p),{recursive:true,mode:0o700});
    const tmp=`${p}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp,JSON.stringify(store),{mode:0o600});
    chmodSync(tmp,0o600); renameSync(tmp,p); chmodSync(p,0o600);
  } catch (error) {
    throw new LoginGuardUnavailable(error instanceof Error ? error.message : 'login_guard_unavailable');
  }
}

function retry(entry:Entry|undefined, now:number){
  return entry && entry.blockedUntil>now ? Math.ceil((entry.blockedUntil-now)/1000) : 0;
}

export function loginAllowed(ip:string, username:string){
  const s=read(); const now=Date.now();
  const wait=Math.max(retry(s[ipKey(ip)],now),retry(s[accountKey(ip,username)],now));
  return {allowed:wait===0,retryAfter:wait};
}

function bump(s:Store,key:string,max:number,now:number){
  const e=s[key]||{failures:0,blockedUntil:0};
  if(e.blockedUntil<=now) e.blockedUntil=0;
  e.failures+=1;
  if(e.failures>=max){e.blockedUntil=now+BLOCK_MS;e.failures=0;}
  s[key]=e;
}

export function loginFailure(ip:string,username:string){
  const s=read(); const now=Date.now();
  bump(s,ipKey(ip),MAX_IP_FAILURES,now); bump(s,accountKey(ip,username),MAX_ACCOUNT_FAILURES,now); write(s);
  return Math.max(retry(s[ipKey(ip)],now),retry(s[accountKey(ip,username)],now));
}

export function loginSuccess(ip:string,username:string){
  const s=read(); delete s[accountKey(ip,username)]; write(s);
}
