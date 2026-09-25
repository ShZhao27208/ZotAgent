import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/plugin-fixture.js';
import { toWSLPath, pathMatchesPlatform } from '../runtime/src/agent-launch.js';

const key=name=>'extensions.zotagent.'+name;
test('Windows Runtime forwards per-agent WSL choice and clears mismatched paths before detection',async()=>{
  const f=fixture();f.Zotero.isWin=true;
  f.prefs.set(key('opencodePlatform'),'wsl');f.prefs.set(key('opencodePath'),'C:\\old\\opencode.cmd');
  f.prefs.set(key('codexPath'),'/home/old/codex');
  const requests=[];
  f.api.RuntimeManager.request=async(route,options)=>{
    requests.push({route,options});
    if(route==='/v1/config/agents') {
      assert.equal(f.prefs.get(key('codexPath')),'');
      return {ok:true};
    }
    return {ok:true,json:async()=>({opencode:{available:true,platform:'wsl',executable:'/home/user/bin/opencode'},codex:{available:false,platform:'windows',executable:'C:\\bin\\codex.cmd',error:'version failed'}})};
  };
  await new f.api.RuntimeClient(null).syncAgentPaths();
  const sent=JSON.parse(requests[0].options.body);
  assert.equal(sent.platforms.opencode,'wsl');assert.equal(sent.platforms.codex,'auto');
  assert.equal(sent.executables.opencode,'');assert.equal(sent.executables.codex,'');
  assert.equal(f.prefs.get(key('opencodePath')),'/home/user/bin/opencode');
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
  m.request=async()=>({ok:true,json:async()=>({platform:'wsl',protocolVersion:3})});
  assert.equal(await m.probe(),'wrong-environment');
  m.request=async()=>({ok:true,json:async()=>({platform:'windows',protocolVersion:2})});
  assert.equal(await m.probe(),'outdated');
  m.request=async()=>({ok:true,json:async()=>({platform:'windows',protocolVersion:3})});
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
