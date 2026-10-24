import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliPackage = expoRequire.resolve('@expo/cli/package.json');
const cliRequire = createRequire(cliPackage);
const {z} = cliRequire('zod');
const cliRoot = dirname(cliPackage);
const {PluginSchema, DevToolsPluginOutputSchema} = require(join(cliRoot, 'build/src/start/server/DevToolsPlugin.schema.js'));
const {createMCPDevToolsExtensionSchema} = require(join(cliRoot, 'build/src/start/server/createMCPDevToolsExtensionSchema.js'));

const plugin = {
  packageName: 'synthetic-test', packageRoot: '/tmp/synthetic-test', bannerTitle: false,
  cliExtensions: {description: 'test', entryPoint: './index.js', commands: [{
    name: 'inspect', title: 'Inspect', environments: ['cli', 'mcp'], parameters: [
      {name: 'label', type: 'text'}, {name: 'count', type: 'number'}, {name: 'confirm', type: 'confirm'},
    ],
  }]},
};

test('GHSA-mrhx-c7xc-m3w5: oversized bounded collections reject before visiting elements', () => {
  for(const kind of ['array', 'set', 'map']) {
    let visited = 0;
    const element = z.string().superRefine(() => { visited += 1; });
    const input = kind === 'array' ? Array(5000).fill('x') : kind === 'set'
      ? new Set(Array.from({length: 5000}, (_, i) => String(i)))
      : new Map(Array.from({length: 5000}, (_, i) => [String(i), 'x']));
    const schema = kind === 'array' ? z.array(element).max(1) : kind === 'set'
      ? z.set(element).max(1) : z.map(z.string(), element).max(1);
    assert.equal(schema.safeParse(input).success, false);
    assert.equal(visited, 0, `oversized ${kind} must not run each element parser`);
  }
});

test('actual Expo CLI plugin schemas retain accepted descriptors and validation failures', () => {
  assert.deepEqual(PluginSchema.parse({...plugin, extraPrivate: 'discard'}), plugin);
  assert.equal(PluginSchema.safeParse({...plugin, packageName: ''}).success, false);
  assert.equal(PluginSchema.safeParse({...plugin, cliExtensions: {...plugin.cliExtensions, commands: []}}).success, false);
  assert.equal(PluginSchema.safeParse({...plugin, cliExtensions: {...plugin.cliExtensions, commands: [{...plugin.cliExtensions.commands[0], environments: ['other']}]}}).success, false);
  const valid = [{type: 'text', text: 'ready', level: 'info'}, {type: 'image', url: 'https://example.com/test.png'}, {type: 'audio', url: 'https://example.com/test.wav'}];
  assert.deepEqual(DevToolsPluginOutputSchema.parse(valid), valid);
  const invalid = DevToolsPluginOutputSchema.safeParse([{type: 'image', url: 'invalid'}]);
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.every(issue => typeof issue.message === 'string'));
});

test('actual Expo CLI MCP schema retains strict arguments, optionals and parameter types', () => {
  const schema = createMCPDevToolsExtensionSchema(plugin);
  const value = {command: 'inspect', label: 'ok', count: 2, confirm: true};
  assert.deepEqual(schema.parse(value), value);
  assert.deepEqual(schema.parse({command: 'inspect'}), {command: 'inspect'});
  assert.equal(schema.safeParse({...value, extra: 'reject'}).success, false);
  assert.equal(schema.safeParse({...value, command: 'other'}).success, false);
  assert.equal(schema.safeParse({...value, count: '2'}).success, false);
  assert.equal(schema.safeParse({...value, confirm: 'yes'}).success, false);
  assert.throws(() => createMCPDevToolsExtensionSchema({...plugin, cliExtensions: undefined}), /no commands/);
});
