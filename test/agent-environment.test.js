import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/plugin-fixture.js';
import { toWSLPath, pathMatchesPlatform, createAgentLauncher, nativePlatform } from '../runtime/src/agent-launch.js';

const key=name=>'extensions.zotagent.'+name;
test('manual paths are preserved on mismatch and detection fills each system without replacing explicit paths',async()=>{
  const f=fixture();f.Zotero.isWin=true;const manager=f.api.RuntimeManager;
  f.prefs.set(key('opencodePathWSL'),'C:\\old\\opencode.cmd');
  await assert.rejects(new f.api.RuntimeClient(null).syncAgentPaths(),/WSL 路径格式不对/);
  assert.equal(f.prefs.get(key('opencodePathWSL')),'C:\\old\\opencode.cmd');
  f.prefs.set(key('opencodePathWSL'),'/custom/opencode');
  let sent;
  manager.request=async(route,options)=>{ if(route==='/v1/config/agents'){sent=JSON.parse(options.body);return {ok:true};}
    return {ok:true,json:async()=>({opencode:{available:true,platform:'wsl',executable:'/custom/opencode',installations:{windows:'C:\\npm\\opencode.cmd',wsl:'/other/opencode'}},
      codex:{available:true,platform:'windows',executable:'C:\\bin\\codex.cmd',installations:{windows:'C:\\bin\\codex.cmd',wsl:'/home/u/.nvm/bin/codex'}}})}; };
  await new f.api.RuntimeClient(null).syncAgentPaths();
  assert.equal(sent.executables.wsl.opencode,'/custom/opencode');
  assert.equal(f.prefs.get(key('opencodePathWSL')),'/custom/opencode','explicit path kept');
  assert.equal(f.prefs.get(key('opencodePathWindows')),'C:\\npm\\opencode.cmd');
  assert.equal(f.prefs.get(key('codexPathWindows')),'C:\\bin\\codex.cmd');
  assert.equal(f.prefs.get(key('codexPathWSL')),'/home/u/.nvm/bin/codex','both systems saved at once');
});
test('bare command defaults are treated as empty so detected paths can be filled',async()=>{
  const f=fixture();const manager=f.api.RuntimeManager;
  f.prefs.set(key('codexPathWSL'),'codex');f.prefs.set(key('claudePathWindows'),'claude');
  let sent;
  manager.request=async(route,options)=>{ if(route==='/v1/config/agents'){sent=JSON.parse(options.body);return {ok:true};}
    return {ok:true,json:async()=>({codex:{available:true,platform:'wsl',executable:'/opt/codex'},'claude-code':{available:true,platform:'windows',executable:'C:\\Users\\me\\.local\\bin\\claude.exe'}})}; };
  await new f.api.RuntimeClient(null).syncAgentPaths();
  assert.equal(sent.executables.wsl.codex,'');assert.equal(sent.executables.windows['claude-code'],'');
  assert.equal(f.prefs.get(key('codexPathWSL')),'/opt/codex');
  assert.equal(f.prefs.get(key('claudePathWindows')),'C:\\Users\\me\\.local\\bin\\claude.exe');
});
test('legacy single-path settings migrate into per-system fields and survive Runtime host switches',()=>{
  const f=fixture();f.Zotero.isWin=true;const manager=f.api.RuntimeManager;
  f.prefs.set(key('codexPath'),'C:\\bin\\codex.cmd');f.prefs.set(key('claudePath'),'claude');
  f.prefs.set(key('runtimeProfiles'),JSON.stringify({'wsl:Ubuntu':{codexPath:'/home/user/codex',runtimeNodePath:'/usr/bin/node'}}));
  f.prefs.set(key('runtimeNodePath'),'C:\\node\\node.exe');manager.selectRuntimeProfile();
  assert.equal(f.prefs.get(key('codexPathWindows')),'C:\\bin\\codex.cmd');
  assert.equal(f.prefs.get(key('codexPathWSL')),'/home/user/codex');
  assert.equal(f.prefs.get(key('claudePathWindows'))??'','','bare command is not a path');
  assert.equal(f.prefs.get(key('codexPath')),'');
  assert.ok(!JSON.parse(f.prefs.get(key('runtimeProfiles')))['wsl:Ubuntu'].codexPath,'migrated value is not refilled later');
  f.prefs.set(key('runtimeHost'),'wsl');manager.selectRuntimeProfile();
  assert.equal(f.prefs.get(key('runtimeNodePath')),'/usr/bin/node','Runtime settings still follow the host profile');
  assert.equal(f.prefs.get(key('codexPathWindows')),'C:\\bin\\codex.cmd','Agent paths do not follow the host profile');
  f.prefs.set(key('runtimeHost'),'auto');manager.selectRuntimeProfile();
  assert.equal(f.prefs.get(key('runtimeNodePath')),'C:\\node\\node.exe');
});
test('healthy but wrong host or old protocol is not silently reused',async()=>{
  const f=fixture();f.Zotero.isWin=true;const m=f.api.RuntimeManager;
  m.request=async()=>({ok:true,json:async()=>({platform:'wsl',protocolVersion:8})});
  assert.equal(await m.probe(),'wrong-environment');
  m.request=async()=>({ok:true,json:async()=>({platform:'windows',protocolVersion:2})});
  assert.equal(await m.probe(),'outdated');
  m.request=async()=>({ok:true,json:async()=>({platform:'windows',protocolVersion:8})});
  assert.equal(await m.probe(),'running');
});
test('custom endpoint is preserved when environment does not match',async()=>{
  const f=fixture();f.Zotero.isWin=true;const m=f.api.RuntimeManager;
  f.prefs.set(key('runtimeEndpoint'),'http://127.0.0.1:29999');m.probe=async()=> 'wrong-environment';
  await assert.rejects(m._ensureRunning(),/未自动更改/);
  assert.equal(f.prefs.get(key('runtimeEndpoint')),'http://127.0.0.1:29999');
});
test('Windows image and working-directory paths cross the WSL boundary literally',()=>{
  assert.equal(toWSLPath('C:\\Users\\测试 User\\capture.png'),'/mnt/c/Users/测试 User/capture.png');
  assert.equal(toWSLPath('\\\\wsl.localhost\\Ubuntu\\home\\user\\work'),'/home/user/work');
  assert.equal(pathMatchesPlatform('/home/user/codex','windows'),false);
  assert.equal(pathMatchesPlatform('C:\\bin\\codex.exe','windows'),true);
});

test('terminal environment survives native and cross-host launch without changing Runtime environment',()=>{
  const before=process.env.CLAUDE_CODE_ENTRYPOINT;
  const launcher=createAgentLauncher({shell:{name:'bash'},defaultCwd:'/runtime'});
  const built={args:['--resume'],cwd:'/work',env:{CLAUDE_CODE_ENTRYPOINT:'sdk-cli'}};
  const native=launcher.invocation({platform:nativePlatform,executable:'/bin/claude'},built,'claude-code');
  assert.deepEqual(native.env,built.env);
  // Exercise the cross-system wrapper for whichever system this host is not.
  if(nativePlatform==='windows'){
    const remote={platform:'wsl',executable:'/bin/claude',distro:'Ubuntu'};
    const wsl=launcher.invocation(remote,built,'claude-code');
    assert.equal(wsl.command,'wsl.exe');
    assert.match(wsl.args.at(-1),/export CLAUDE_CODE_ENTRYPOINT='sdk-cli'\ncd -- '\/work' \|\| exit 1\nexec/);
    assert.throws(()=>launcher.invocation(remote,{...built,env:{'INVALID;name':'x'}},'claude-code'),/Invalid Agent environment/);
  } else {
    const remote={platform:'windows',executable:'C:\\Tools\\claude.exe',defaultCwd:'C:\\Users\\me'};
    const win=launcher.invocation(remote,{...built,cwd:'C:\\Users\\me\\work'},'claude-code');
    assert.equal(win.command,'/mnt/c/Tools/claude.exe');
    assert.deepEqual(win.args,['--resume']);
    assert.equal(win.cwd,'/mnt/c/Users/me/work');
    assert.equal(win.env.CLAUDE_CODE_ENTRYPOINT,'sdk-cli');
    assert.match(win.env.WSLENV,/(^|:)CLAUDE_CODE_ENTRYPOINT$/);
    assert.throws(()=>launcher.invocation(remote,{...built,env:{'INVALID;name':'x'}},'claude-code'),/Invalid Agent environment/);
  }
  assert.equal(process.env.CLAUDE_CODE_ENTRYPOINT,before);
});

test('Windows and WSL runtime launches hide the console without shell argument re-parsing',()=>{
  for(const native of [true,false]) {
    const f=fixture();const m=f.api.RuntimeManager;const processes=[];f.prefs.set(key('runtimeToken'),'test-token');
    f.context.Components={interfaces:{nsIFile:{},nsIProcess:{}},classes:{
      '@mozilla.org/file/local;1':{createInstance:()=>({initWithPath(){},exists:()=>true})},
      '@mozilla.org/process/util;1':{createInstance:()=>{const child={init(){},runwAsync(args){assert.equal(this.startHidden,true);assert.equal(this.noShell,true);processes.push(args);}};return child;}}
    }};
    f.prefs.set(key('runtimeScriptPath'),'/home/user/runtime/src/index.js');f.prefs.set(key('runtimeNodePath'),'/usr/bin/node');
    if(native)m._nativeRuntime={node:'C:\\node\\node.exe',script:'C:\\runtime\\index.js'};
    m.launch();assert.equal(processes.length,1);
    assert.ok(processes[0].includes(native?'C:\\runtime\\index.js':'/home/user/runtime/src/index.js'));
  }
});
