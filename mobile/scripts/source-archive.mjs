// SPDX-License-Identifier: GPL-3.0-only
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
// A fixed allowlist prevents HOME, generated outputs, signing materials and local caches entering source.
const script = String.raw`
import pathlib, zipfile, sys, re, hashlib, json
root=pathlib.Path(sys.argv[1]).resolve()
version=sys.argv[2]
output=root/'dist'/('ColdCoffee-Mobile-Source-'+version+'.zip')
include=['src','assets','legal','vendor','scripts','tests','android','LICENSE','README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json']
skip_dirs={'node_modules','www','work','dist','.git','.gradle','.idea','build','__pycache__'}
forbidden_suffixes={'.jks','.keystore','.p12','.pfx','.pem','.key','.dpapi','.log','.dmp','.pyc','.tmp'}
files=[]
for name in include:
    target=root/name
    if not target.exists(): raise SystemExit('Required source entry missing: '+name)
    for item in ([target] if target.is_file() else sorted(target.rglob('*'))):
        if not item.is_file(): continue
        rel=item.relative_to(root)
        if any(part in skip_dirs for part in rel.parts): continue
        if item.is_symlink(): raise SystemExit('Symlink refused: '+str(rel))
        if item.suffix.lower() in forbidden_suffixes or item.name.startswith('.env') or item.name in {'local.properties','keystore.properties','signing.properties','auth.json','credentials.json','credential.dpapi'}:
            raise SystemExit('Private/generated file refused: '+str(rel))
        files.append((item,rel))
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for item,rel in files:
        info=zipfile.ZipInfo('coldcoffee-mobile/'+rel.as_posix(),(2026,11,15,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=(0o100755 if item.name=='gradlew' else 0o100644)<<16
        archive.writestr(info,item.read_bytes())
digest=hashlib.sha256(output.read_bytes()).hexdigest()
print(json.dumps({'archive':output.name,'files':len(files),'sha256':digest,'privateSigningMaterial':False}))
`;
const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', script, root, pkg.version], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
