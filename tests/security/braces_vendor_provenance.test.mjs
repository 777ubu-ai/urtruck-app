import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const vendor = resolve(root, 'vendor/braces-3.0.4-28d440b');
const expectedCommit = '28d440b5dd449dbf1fe6f3506cf94ecca4d02660';
const expectedManifestHash =
  '588c8cf853f59072989fb90289e697067ce76ac8056c9596b9721e49840ac9d3';

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('vetted braces package is pinned to the reviewed source manifest', () => {
  const sums = readFileSync(resolve(vendor, 'UPSTREAM-SOURCE-SHA256SUMS'), 'utf8')
    .trim()
    .split('\n')
    .map(line => line.split(/\s{2}/));
  const actualLines = sums.map(([expected, file]) => {
    assert.equal(sha256(readFileSync(resolve(vendor, file))), expected, `${file} checksum`);
    return `${expected}  vendor/braces-3.0.4-28d440b/${file}`;
  });
  assert.equal(sha256(actualLines.join('\n') + '\n'), expectedManifestHash);

  const provenance = readFileSync(resolve(vendor, 'PROVENANCE.md'), 'utf8');
  assert.match(provenance, new RegExp(expectedCommit));
  assert.match(readFileSync(resolve(vendor, 'LICENSE'), 'utf8'), /The MIT License \(MIT\)/);
});

test('vetted distribution carries only runtime package metadata', () => {
  const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json')));
  const vendorPackage = JSON.parse(readFileSync(resolve(vendor, 'package.json')));
  const sbom = JSON.parse(readFileSync(resolve(root, 'security/sbom/braces-3.0.4-28d440b.spdx.json')));

  assert.equal(rootPackage.dependencies.braces, 'file:vendor/braces-3.0.4-28d440b');
  assert.equal(vendorPackage.version, '3.0.4');
  assert.deepEqual(vendorPackage.dependencies, {'fill-range': '^7.1.1'});
  assert.equal('devDependencies' in vendorPackage, false);
  assert.equal('scripts' in vendorPackage, false);
  assert.equal(sbom.packages[0].downloadLocation.endsWith(expectedCommit), true);
  assert.equal(sbom.packages[0].checksums[0].checksumValue, expectedManifestHash);
});
