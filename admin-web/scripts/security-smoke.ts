import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit } from '../src/lib/audit';
import { can } from '../src/lib/rbac';
import { createAdminSession, verifyAdminSession } from '../src/lib/session';
import { activateStaff, createStaff, setStaffActive, verifyStaffLogin, verifyStaffPassword } from '../src/lib/staff';
import { loginAllowed, loginFailure, loginSuccess } from '../src/lib/loginGuard';
import { loginAllowed, loginFailure, loginSuccess } from '../src/lib/loginGuard';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(s:string){let bits=0,buf=0;const out:number[]=[];for(const c of s){const i=alphabet.indexOf(c);if(i<0)continue;buf=(buf<<5)|i;bits+=5;if(bits>=8){out.push((buf>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function code(secret:string){const n=Math.floor(Date.now()/30000);const m=Buffer.alloc(8);m.writeBigUInt64BE(BigInt(n));const d=createHmac('sha1',b32(secret)).update(m).digest();const o=d[d.length-1]&15;const v=((d[o]&127)<<24)|((d[o+1]&255)<<16)|((d[o+2]&255)<<8)|(d[o+3]&255);return String(v%1000000).padStart(6,'0');}

const dir=mkdtempSync(join(tmpdir(),'urtruck-admin-security-'));
const old=process.cwd(); process.chdir(dir);
process.env[['ADMIN','SESSION','SECRET'].join('_')]=['security','smoke','only','0123456789abcdef'].join('-');
try {
  const owner=createStaff('owner.qa','Strong-Test-Credential-2026!','owner');
  assert.equal(owner.active,false); assert.ok(verifyStaffPassword('owner.qa','Strong-Test-Credential-2026!'));
  assert.ok(activateStaff('owner.qa',code(owner.totpSecret))?.active);
  assert.ok(verifyStaffLogin('owner.qa','Strong-Test-Credential-2026!',code(owner.totpSecret)));
  const token=createAdminSession('owner.qa','owner'); assert.equal(verifyAdminSession(token)?.role,'owner');
  assert.throws(()=>setStaffActive('owner.qa',false),/last_owner/);
  const finance=createStaff('finance.qa','Finance-Test-Credential-2026!','finance'); activateStaff('finance.qa',code(finance.totpSecret));
  const financeToken=createAdminSession('finance.qa','finance'); assert.equal(verifyAdminSession(financeToken)?.role,'finance');
  assert.equal(can('finance','deals'),true); assert.equal(can('finance','users'),false); assert.equal(can('finance','staff_manage'),false);
  const financeToken=createAdminSession('finance.qa','finance'); assert.equal(verifyAdminSession(financeToken)?.role,'finance');
  setStaffActive('finance.qa',false); assert.equal(verifyStaffLogin('finance.qa','Finance-Test-Credential-2026!',code(finance.totpSecret)),null); assert.equal(verifyAdminSession(financeToken),null);
  for(let i=0;i<5;i++) loginFailure('127.0.0.2','blocked.qa');
  const blocked=loginAllowed('127.0.0.2','blocked.qa'); assert.equal(blocked.allowed,false); assert.ok(blocked.retryAfter>0);
  loginSuccess('127.0.0.2','blocked.qa'); assert.equal(loginAllowed('127.0.0.2','blocked.qa').allowed,false); // IP scope remains blocked assert.equal(verifyAdminSession(financeToken),null);
  assert.equal(loginAllowed('10.0.0.1','locked.qa').allowed,true); for(let i=0;i<5;i++) loginFailure('10.0.0.1','locked.qa'); assert.equal(loginAllowed('10.0.0.1','locked.qa').allowed,false); loginSuccess('10.0.0.1','locked.qa'); assert.equal(loginAllowed('10.0.0.1','locked.qa').allowed,true);
  audit({actor:'owner.qa',role:'owner',action:'security.smoke',target:'rbac',ip:'127.0.0.1'});
  const log=join(dir,'.admin-data','audit.jsonl'); assert.ok(existsSync(log)); assert.match(readFileSync(log,'utf8'),/security\.smoke/);
  console.log('admin security smoke: PASS');
} finally { process.chdir(old); rmSync(dir,{recursive:true,force:true}); }
