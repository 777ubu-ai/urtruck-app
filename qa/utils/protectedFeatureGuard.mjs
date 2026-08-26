#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'qa/protected_features.json');

function usage() {
  console.log(`Usage:
  node qa/utils/protectedFeatureGuard.mjs [--run] [--base <ref>] [--files <file...>]
  node qa/utils/protectedFeatureGuard.mjs --list

The guard detects changed files, maps them to qa/protected_features.json,
and optionally runs the required regression commands for impacted features.`);
}

function readManifest() {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest.features) || manifest.features.length === 0) {
    throw new Error('qa/protected_features.json must define a non-empty features array');
  }
  return manifest;
}

function parseArgs(argv) {
  const args = { run: false, list: false, base: null, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run') args.run = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--files') {
      args.files = argv.slice(i + 1).filter(Boolean);
      break;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.quiet ? 'ignore' : 'pipe'],
  }).trim();
}

function normalizeFileList(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'));
}

function unique(items) {
  return [...new Set(items)];
}

function changedFiles(args, manifest) {
  if (args.files.length) return args.files.map((file) => file.replace(/\\/g, '/'));

  const envFiles = process.env.PROTECTED_FEATURE_CHANGED_FILES;
  if (envFiles) return normalizeFileList(envFiles);

  const base = args.base
    || process.env.PROTECTED_FEATURE_BASE_REF
    || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null)
    || manifest.policy?.default_base_ref
    || '@{upstream}';

  const files = [];
  try {
    files.push(...normalizeFileList(git(['diff', '--name-only', `${base}...HEAD`])));
  } catch (_err) {
    try {
      files.push(...normalizeFileList(git(['diff', '--name-only', 'HEAD~1..HEAD'])));
    } catch (err) {
      throw new Error(`Could not determine changed files. Pass --files explicitly. ${err.message}`);
    }
  }
  try {
    files.push(...normalizeFileList(git(['diff', '--name-only'], { quiet: true })));
    files.push(...normalizeFileList(git(['diff', '--cached', '--name-only'], { quiet: true })));
    files.push(...normalizeFileList(git(['ls-files', '--others', '--exclude-standard'], { quiet: true })));
  } catch (_err) {
    // Working-tree discovery is best-effort. CI runs against committed files.
  }
  return unique(files);
}

function compilePattern(pattern, featureId) {
  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new Error(`Invalid file pattern for feature ${featureId}: ${pattern}: ${err.message}`);
  }
}

function impactedFeatures(manifest, files) {
  return manifest.features
    .map((feature) => {
      const patterns = feature.file_patterns.map((pattern) => compilePattern(pattern, feature.id));
      const matched = files.filter((file) => patterns.some((pattern) => pattern.test(file)));
      return { ...feature, matched_files: matched };
    })
    .filter((feature) => feature.matched_files.length > 0);
}

function printPlan(features, files) {
  console.log(`[protected-feature-guard] changed files: ${files.length}`);
  for (const file of files) console.log(`  - ${file}`);

  if (features.length === 0) {
    console.log('[protected-feature-guard] no protected feature impacted');
    return;
  }

  console.log(`[protected-feature-guard] impacted protected features: ${features.length}`);
  for (const feature of features) {
    console.log(`\n[${feature.id}] ${feature.label}`);
    console.log(`risk: ${feature.risk}`);
    console.log('matched files:');
    for (const file of feature.matched_files) console.log(`  - ${file}`);
    console.log('required commands:');
    for (const command of feature.commands) console.log(`  $ ${command}`);
  }
}

function runCommands(features) {
  const seen = new Set();
  for (const feature of features) {
    for (const command of feature.commands) {
      if (seen.has(command)) continue;
      seen.add(command);
      console.log(`\n::group::protected feature command: ${command}`);
      const result = spawnSync(command, {
        cwd: repoRoot,
        shell: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          APP_ENV: process.env.APP_ENV || 'test',
          PYTHONPATH: process.env.PYTHONPATH || '.:backend',
        },
      });
      console.log('::endgroup::');
      if (result.status !== 0) {
        console.error(`::error::Protected feature guard failed: ${command}`);
        process.exit(result.status || 1);
      }
    }
  }
}

function validateManifest(manifest) {
  const ids = new Set();
  for (const feature of manifest.features) {
    if (!feature.id || !/^[a-z0-9_]+$/.test(feature.id)) {
      throw new Error(`Invalid feature id: ${feature.id}`);
    }
    if (ids.has(feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
    ids.add(feature.id);
    if (!feature.label || !feature.risk) throw new Error(`Feature ${feature.id} needs label and risk`);
    if (!Array.isArray(feature.file_patterns) || feature.file_patterns.length === 0) {
      throw new Error(`Feature ${feature.id} needs file_patterns`);
    }
    if (!Array.isArray(feature.commands) || feature.commands.length === 0) {
      throw new Error(`Feature ${feature.id} needs commands`);
    }
    for (const pattern of feature.file_patterns) compilePattern(pattern, feature.id);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readManifest();
  validateManifest(manifest);

  if (args.list) {
    for (const feature of manifest.features) {
      console.log(`${feature.id}: ${feature.label}`);
    }
    return;
  }

  const files = changedFiles(args, manifest);
  const impacted = impactedFeatures(manifest, files);
  printPlan(impacted, files);
  if (args.run && impacted.length > 0) runCommands(impacted);
}

try {
  main();
} catch (err) {
  console.error(`::error::${err.message}`);
  process.exit(1);
}
