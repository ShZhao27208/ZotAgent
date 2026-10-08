import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { nativePlatform } from './agent-launch.js';
const exec = promisify(execFile);
const clean = text => String(text).replace(/\x1b\[[0-9;]*m/g, '');
export function parseModels(text) {
  return [...new Set(clean(text).split(/\r?\n/).map(s => s.trim()).filter(s => /^[\w.-]+\/[^\s]+$/.test(s)))];
}
export function recentModel(text) {
  const entry = JSON.parse(text).recent?.[0];
  if (!entry?.providerID || !entry?.modelID) throw new Error('没有最近使用的模型记录');
  return `${entry.providerID}/${entry.modelID}`;
}
export function selectModel(models, selected, recent, error) {
  const model = String(selected || '').trim() || recent;
  if (!model) throw new Error(`无法跟随 OpenCode 最近使用的模型：${error || '没有记录'}。请先在同一环境的 OpenCode 使用模型，或在设置下拉菜单选择。`);
  if (!models.includes(model)) throw new Error(`OpenCode 模型 ${model} 不在当前可用列表中；请刷新设置中的模型下拉菜单并重新选择。`);
  return model;
}
export function createModelCatalog(launcher) {
  async function command(location, args) {
    const invocation = launcher.invocation(location, { args, cwd: location.defaultCwd }, 'opencode');
    const { stdout } = await exec(invocation.command, invocation.args, { cwd: invocation.cwd, timeout: 25000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, windowsVerbatimArguments: invocation.windowsVerbatimArguments === true });
    return stdout;
  }
  return async function catalog(location, refresh = false) {
    const models = parseModels(await command(location, refresh ? ['models', '--refresh'] : ['models']));
    if (!models.length) throw new Error('OpenCode 没有返回可用模型 ID，请检查安装、网络或登录状态');
    let recent = null, recentError = null;
    try {
      const paths = clean(await command(location, ['debug', 'paths']));
      const state = paths.match(/^state\s+(.+?)\s*$/m)?.[1];
      if (!state) throw new Error('当前 OpenCode 版本未提供 state 路径');
      let data;
      if (location.platform === nativePlatform) data = await readFile(path.join(state, 'model.json'), 'utf8');
      else data = await command({ ...location, executable: '/bin/cat' }, [state.replace(/\/$/, '') + '/model.json']);
      recent = recentModel(data);
    } catch (error) { recentError = error.message; }
    return { models, recent, recentError };
  };
}
