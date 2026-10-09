import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/plugin-fixture.js';
import { toWSLPath, pathMatchesPlatform, createAgentLauncher, nativePlatform } from '../runtime/src/agent-launch.js';

const key=name=>'extensions.zotagent.'+name;
test('manual paths are preserved on mismatch and detection never replaces explicit paths',async()=>{
  const f=fixture();f.Zotero.isWin=true;
  f.prefs.set(key('opencodePlatform'),'wsl');f.prefs.set(key('opencodePath'),'C:\\old\\opencode.cmd');
  await assert.rejects(new f.api.RuntimeClient(null).syncAgentPaths(),/手动路径与所选环境不匹配/);
  assert.equal(f.prefs.get(key('opencodePath')),'C:\\old\\opencode.cmd');
  f.prefs.set(key('opencodePath'),'/custom/opencode');
  f.api.RuntimeManager.request=async route=>route==='/v1/config/agents'?{ok:true}:{ok:true,json:async()=>({opencode:{available:false,executable:'/other/opencode'},codex:{available:true,executable:'C:\\bin\\codex.cmd'}})};
  await new f.api.RuntimeClient(null).syncAgentPaths();
  assert.equal(f.prefs.get(key('opencodePath')),'/custom/opencode');
  assert.equal(f.prefs.get(key('codexPath')),'C:\\bin\\codex.cmd');
});
test('host profiles restore Windows and WSL settings instead of converting one into the other',()=>{
  const f=fixture();f.Zotero.isWin=true;const manager=f.api.RuntimeManager;
  f.prefs.set(key('runtimeNodePath'),'C:\\node\\node.exe');f.prefs.set(key('codexPath'),'C:\\bin\\codex.cmd');manager.selectRuntimeProfile();
  f.prefs.set(key('runtimeHost'),'wsl');manager.selectRuntimeProfile();
  assert.equal(f.prefs.get(key('codexPath')),'');
  f.prefs.set(key('runtimeNodePath'),'/usr/bin/node');f.prefs.set(key('codexPath'),'/home/user/codex');
  f.prefs.set(key('runtimeHost'),'auto');manager.selectRuntimeProfile();
  assert.equal(f.prefs.get(key('runtimeNodePath')),'C:\\node\\node.exe');
  assert.equal(f.prefs.get(key('codexPath')),'C:\\bin\\codex.cmd');
  f.prefs.set(key('runtimeHost'),'wsl');manager.selectRuntimeProfile();
  assert.equal(f.prefs.get(key('codexPath')),'/home/user/codex');
});
test('healthy but wrong host or old protocol is not silently reused',async()=>{
  const f=fixture();f.Zotero.isWin=true;const m=f.api.RuntimeManager;
  m.request=async()=>({ok:true,json:async()=>({platform:'wsl',protocolVersion:7})});
  assert.equal(await m.probe(),'wrong-environment');
  m.request=async()=>({ok:true,json:async()=>({platform:'windows',protocolVersion:2})});
  assert.equal(await m.probe(),'outdated');
  m.request=async()=>({ok:true,json:async()=>({platform:'windows',protocolVersion:7})});
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
  // Exercise the WSL wrapper constructor irrespective of the test host platform.
  const remote={platform:nativePlatform==='windows'?'wsl':'windows',executable:'/bin/claude',distro:'Ubuntu'};
  const wsl=launcher.invocation(remote,built,'claude-code');
  assert.equal(wsl.command,'wsl.exe');
  assert.match(wsl.args.at(-1),/export CLAUDE_CODE_ENTRYPOINT='sdk-cli'\ncd -- '\/work' \|\| exit 1\nexec/);
  assert.throws(()=>launcher.invocation(remote,{...built,env:{'INVALID;name':'x'}},'claude-code'),/Invalid Agent environment/);
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
