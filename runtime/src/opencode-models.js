import { execFile, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { nativePlatform } from './agent-launch.js';
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
  const cache = new Map(), pending = new Map();
  const ttl = 5 * 60 * 1000;
  async function command(location, args, signal) {
    signal?.throwIfAborted();
    const invocation = launcher.invocation(location, { args, cwd: location.defaultCwd }, 'opencode');
    return new Promise((resolve, reject) => {
      // spawn forwards detached to the OS; execFile does not forward that option.
      const child = spawn(invocation.command, invocation.args, { cwd: invocation.cwd,
        detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        windowsVerbatimArguments: invocation.windowsVerbatimArguments === true });
      let stdout = '', stderr = '', bytes = 0, settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value);
      };
      const kill = () => {
        if (!child.pid || child.exitCode !== null) return;
        if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => { if (error) child.kill(); });
        else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      };
      const abort = () => { kill(); finish(signal.reason || new Error('模型查询已取消')); };
      const timeout = setTimeout(() => { kill(); finish(new Error(`OpenCode ${args.join(' ')} 超过 45 秒，请检查 CLI、网络和代理`)); }, 45000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      const collect = (text, isError) => {
        if (settled) return;
        bytes += Buffer.byteLength(text);
        if (bytes > 8 * 1024 * 1024) { kill(); finish(new Error('OpenCode 模型查询输出超过 8 MiB')); return; }
        if (isError) stderr += text; else stdout += text;
      };
      child.stdout.on('data', text => collect(text, false)); child.stderr.on('data', text => collect(text, true));
      child.on('error', error => finish(error));
      child.on('close', code => code === 0 ? finish(null, stdout) : finish(new Error(`OpenCode ${args.join(' ')} 失败（退出码 ${code}）：${stderr.slice(-4000)}`)));
    });
  }
  // Each caller owns a subscription. One cancelled window cannot cancel another;
  // when the last caller leaves, terminate the shared discovery process too.
  function shared(key, factory, signal) {
    signal?.throwIfAborted();
    let entry = pending.get(key);
    if (!entry) {
      entry = { controller: new AbortController(), users: 0 };
      pending.set(key, entry);
      entry.promise = Promise.resolve().then(() => factory(entry.controller.signal)).finally(() => {
        if (pending.get(key) === entry) pending.delete(key);
      });
    }
    entry.users++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true;
        signal?.removeEventListener('abort', abort);
        if (--entry.users === 0 && pending.get(key) === entry) {
          pending.delete(key); entry.controller.abort(new Error('模型查询已取消'));
        }
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(signal.reason || new Error('模型查询已取消'));
      signal?.addEventListener('abort', abort, { once: true });
      entry.promise.then(value => finish(null, value), error => finish(error));
      if (signal?.aborted) abort();
    });
  }
  async function catalog(location, refresh = false, { signal, recent: needRecent = true } = {}) {
    signal?.throwIfAborted();
    let stamp = '';
    if (location.platform === nativePlatform) { try { const st = statSync(location.executable); stamp = `${st.size}:${st.mtimeMs}`; } catch {} }
    const key = JSON.stringify([location.platform, location.distro, location.executable, location.defaultCwd, stamp]);
    let value = cache.get(key);
    if (refresh || !value || Date.now() - value.at > ttl) {
      value = await shared(key + ':models:' + refresh, async innerSignal => {
        const models = parseModels(await command(location, refresh ? ['models', '--refresh'] : ['models'], innerSignal));
        innerSignal.throwIfAborted();
        if (!models.length) throw new Error('OpenCode 没有返回可用模型 ID，请检查安装、网络或登录状态');
        const result = { models, at: Date.now(), state: undefined };
        cache.set(key, result); return result;
      }, signal);
    }
    let recent = null, recentError = null;
    if (needRecent) {
      try {
        if (!value.state || refresh) {
          value.state = await shared(key + ':paths', async innerSignal => {
            const paths = clean(await command(location, ['debug', 'paths'], innerSignal));
            const state = paths.match(/^state\s+(.+?)\s*$/m)?.[1];
            if (!state) throw new Error('当前 OpenCode 版本未提供 state 路径');
            return state;
          }, signal);
        }
        signal?.throwIfAborted();
        const data = location.platform === nativePlatform
          ? await readFile(path.join(value.state, 'model.json'), { encoding: 'utf8', signal })
          : await command({ ...location, executable: '/bin/cat' }, [value.state.replace(/\/$/, '') + '/model.json'], signal);
        recent = recentModel(data);
      } catch (error) { if (signal?.aborted) throw signal.reason; recentError = error.message; }
    }
    signal?.throwIfAborted();
    return { models: value.models, recent, recentError };
  }
  catalog.clear = () => {
    cache.clear();
    for (const entry of pending.values()) entry.controller.abort(new Error('模型配置已改变或 Runtime 已停止，请重试'));
    pending.clear();
  };
  return catalog;
}
