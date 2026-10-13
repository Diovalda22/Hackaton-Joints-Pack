// Transpile TypeScript into an isolated directory and execute Node's native test runner.
// No browser, external service, registry access, or mutation of source files is required.
import ts from 'typescript';
import { mkdtemp, readdir, readFile, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve('.');
const target=await mkdtemp(join(tmpdir(),'loopcut-tests-'));
async function compile(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='app')await compile(path);}else if(/\.tsx?$/.test(entry.name)){const output=join(target,relative(root,path).replace(/\.tsx?$/,'.js'));await mkdir(dirname(output),{recursive:true});const result=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:path});await writeFile(output,result.outputText);}}}
try{await compile(join(root,'src'));await compile(join(root,'tests'));await mkdir(join(target,'node_modules','@'),{recursive:true});await symlink(join(target,'src','lib'),join(target,'node_modules','@','lib'));await symlink(join(target,'src','components'),join(target,'node_modules','@','components'));const tests=(await readdir(join(target,'tests'))).filter(f=>f.endsWith('.test.js') && (process.argv.includes('--integration') ? f.includes('.integration.') : !f.includes('.integration.'))).map(f=>join(target,'tests',f));const result=spawnSync(process.execPath,['--test','--test-isolation=none',...tests],{stdio:'inherit',env:{...process.env,NODE_PATH:join(root,'node_modules')}});process.exitCode=result.status??1;}finally{await rm(target,{recursive:true,force:true});}
