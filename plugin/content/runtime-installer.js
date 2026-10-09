(function () {
  function file(path) {
    const f = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);
    f.initWithPath(path);
    return f;
  }
  function directory(parent, name) {
    const f = parent.clone(); f.append(name);
    if (!f.exists()) f.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o700);
    return f;
  }
  function findNode() {
    const env = Services.env;
    const configured = Zotero.Prefs.get('extensions.zotagent.runtimeNodePath', true);
    if (configured) {
      try { const explicit = file(configured); if (explicit.exists() && explicit.isFile()) return explicit.path; } catch (_) {}
      throw new Error('手动配置的 Node.js 路径无效：' + configured + '；请修正路径或清空后自动查找。');
    }
    const candidates = [];
    for (const base of [env.get('NVM_SYMLINK'), ...env.get('PATH').split(';'),
      env.get('ProgramW6432') + '\\nodejs', env.get('ProgramFiles') + '\\nodejs',
      env.get('LOCALAPPDATA') + '\\Programs\\nodejs', env.get('VOLTA_HOME') + '\\bin']) {
      if (base) candidates.push(base.replace(/^"|"$/g, '') + '\\node.exe');
    }
    for (const path of candidates) {
      if (!/^[a-z]:[\\/]/i.test(path || '')) continue;
      try { const f = file(path); if (f.exists() && f.isFile()) return f.path; } catch (_) {}
    }
    throw new Error('未检测到 Windows Node.js。请安装 Node.js 24 或更高版本后重启 Zotero，或在高级设置选择 node.exe；无需安装 WSL。');
  }
  Zotero.ZotAgent.prepareWindowsRuntime = async function () {
    let stage = '检测本机 Node.js';
    try {
      const node = findNode();
      Zotero.Prefs.set('extensions.zotagent.runtimeNodePath', node, true);
      const configuredScript = Zotero.Prefs.get('extensions.zotagent.runtimeScriptPath', true);
      const managedBase = Zotero.DataDirectory.dir.replace(/[\\/]+$/, '') + '\\zotagent\\runtime\\';
      if (configuredScript && !configuredScript.toLowerCase().replaceAll('/', '\\').startsWith(managedBase.toLowerCase())) {
        const explicit = file(configuredScript);
        if (!explicit.exists() || !explicit.isFile()) throw new Error('手动 Runtime 脚本路径无效：' + configuredScript + '；请修正或清空路径');
        return { node, script: explicit.path };
      }
      stage = '读取插件版本';
      const version = this._version;
      if (typeof version !== 'string' || !/^[0-9]+(?:\.[0-9]+){2}(?:[-+][a-z0-9.-]+)?$/i.test(version)) {
        throw new Error('缺少有效的插件启动版本信息，请重启 Zotero');
      }
      stage = '创建本机 Runtime 目录';
      const base = directory(directory(file(Zotero.DataDirectory.dir), 'zotagent'), 'runtime');
      const buildID = this._runtimeBuildID;
      if (buildID && !/^[a-f0-9]{64}$/.test(buildID)) throw new Error('无效 Runtime 构建标识');
      const deployment = buildID ? version + '-' + buildID : version;
      const target = directory(base, deployment);
      const marker = target.clone(); marker.append('.complete');
      if (!marker.exists()) {
        stage = '从本地插件提取 Runtime 包';
        const archive = base.clone(); archive.append('runtime-' + deployment + '.zip');
        // This is a local XPI resource, not an HTTP download. Zotero's download
        // helper can read URI credentials, which jar: URIs do not support.
        if (archive.exists()) archive.remove(false);
        const uri = Services.io.newURI(this._rootURI + 'runtime.zip');
        if (uri.scheme === 'jar') {
          const jar = uri.QueryInterface(Components.interfaces.nsIJARURI);
          const source = jar.JARFile.QueryInterface(Components.interfaces.nsIFileURL).file;
          const outer = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
          outer.open(source);
          try { outer.extract(jar.JAREntry, archive); } finally { outer.close(); }
        } else if (uri.scheme === 'file') {
          uri.QueryInterface(Components.interfaces.nsIFileURL).file.copyTo(base, archive.leafName);
        } else {
          throw new Error('不支持的插件资源位置：' + uri.scheme);
        }
        stage = '解压 Runtime 文件';
        const zip = Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
        zip.open(archive);
        try {
          const entries = zip.findEntries(null);
          while (entries.hasMore()) {
            const name = entries.getNext();
            const parts = name.split('/').filter(Boolean);
            if (!parts.length || name.startsWith('/') || parts.some(p => p === '..' || p.includes('\\') || p.includes(':'))) throw new Error('无效 Runtime 包路径');
            let parent = target;
            for (const part of parts.slice(0, -1)) parent = directory(parent, part);
            if (name.endsWith('/')) { directory(parent, parts.at(-1)); continue; }
            const dest = parent.clone(); dest.append(parts.at(-1));
            if (dest.exists()) dest.remove(false);
            zip.extract(name, dest);
          }
        } finally { zip.close(); }
        marker.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o600);
        archive.remove(false);
      }
      stage = '校验并保存 Runtime 脚本路径';
      const script = target.clone(); script.append('src'); script.append('index.js');
      if (!script.exists()) { marker.remove(false); throw new Error('Runtime 安装不完整，请重新连接以修复'); }
      Zotero.Prefs.set('extensions.zotagent.runtimeScriptPath', script.path, true);
      return { node, script: script.path };
    } catch (error) {
      throw new Error(stage + '失败：' + (error.message || String(error)));
    }
  };
})();
