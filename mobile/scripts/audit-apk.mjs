// SPDX-License-Identifier: GPL-3.0-only
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const apk = process.argv[2];
if (!apk) throw new Error('Usage: npm run audit:apk -- PATH_TO_SIGNED_APK');
const script = String.raw`
import pathlib,zipfile,json,re,hashlib,sys
apk=pathlib.Path(sys.argv[1]).resolve()
root=pathlib.Path(sys.argv[2]).resolve()
findings=[]
checked=[]
text_rules=[
 ('personal-windows-path',re.compile(rb'[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\x00\s"<>]+',re.I)),
 ('private-key',re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),
 ('github-token',re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,})')),
 ('provider-key',re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}')),
 ('private-ip',re.compile(rb'\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b')),
]
with zipfile.ZipFile(apk) as archive:
    if archive.testzip():raise SystemExit('APK ZIP CRC verification failed')
    names=set(archive.namelist())
    for required in ['AndroidManifest.xml','classes.dex','assets/index.html','assets/app.js','assets/assets/icon.png','assets/assets/hero.webp','assets/legal/GPL-3.0.txt','assets/legal/THIRD_PARTY_NOTICES.md','assets/legal/Marked-LICENSE.txt','assets/legal/DOMPurify-LICENSE.txt']:
        if required not in names:findings.append({'file':required,'rule':'required-file-missing'})
    for entry in archive.infolist():
        if entry.is_dir():continue
        name=entry.filename
        if name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:findings.append({'file':name,'rule':'unsafe-path'})
        leaf=pathlib.PurePosixPath(name).name
        if re.search(r'\.(?:jks|keystore|p12|pfx|pem|key|dpapi|log|dmp)$',leaf,re.I) or leaf in {'auth.json','credentials.json','local.properties','keystore.properties','signing.properties','preview-session.json'} or leaf.startswith('.env'):
            findings.append({'file':name,'rule':'private-file'})
        data=archive.read(entry)
        checked.append({'file':name,'sha256':hashlib.sha256(data).hexdigest()})
        for rule,pattern in text_rules:
            if pattern.search(data) or pattern.search(data.replace(b'\x00',b'')):
                findings.append({'file':name,'rule':rule})
        if name.startswith('assets/') and name not in {'assets/legal/THIRD_PARTY_NOTICES.md'}:
            corresponding=root/'www'/name[len('assets/'):]
            if corresponding.is_file() and corresponding.read_bytes()!=data:
                findings.append({'file':name,'rule':'packaged-source-hash-mismatch'})
    legal=archive.read('assets/legal/GPL-3.0.txt') if 'assets/legal/GPL-3.0.txt' in names else b''
    if legal!=(root/'LICENSE').read_bytes():findings.append({'file':'assets/legal/GPL-3.0.txt','rule':'license-not-original'})
result={'ok':not findings,'apk':apk.name,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'entries':len(checked),'findings':findings,'scope':'APK contents, signatures checked separately; no OCR or all Git history claim'}
(root/'work').mkdir(exist_ok=True)
(root/'work'/'apk-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
if findings:sys.exit(1)
`;
const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', script, path.resolve(apk), root], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
