// No model calls. Used only by the isolated Runtime integration checks.
const fs=require('node:fs'),crypto=require('node:crypto');
if(process.argv.includes('--version')) { console.log('ZotAgent fake CLI 1.0'); process.exit(0); }
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',()=>{
  if(input==='CANCEL_TEST') {
    console.log(JSON.stringify({type:'message.delta',text:'partial answer'}));
    setTimeout(()=>process.exit(0),30000);return;
  }
  if(input==='FAIL_TEST') { console.log('specific fake CLI failure');process.exitCode=1;return; }
  const args=process.argv.slice(2);
  const files=args.flatMap((arg,i)=>['--image','--file'].includes(arg)?[args[i+1]]:[]);
  const result={bytes:Buffer.byteLength(input),sha256:crypto.createHash('sha256').update(input).digest('hex'),args,files:files.map(file=>({file,exists:fs.existsSync(file)}))};
  console.log(JSON.stringify({type:'message.delta',text:JSON.stringify(result)}));
});
