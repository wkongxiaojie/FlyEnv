const https = require('https');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function getGitHubToken() {
  try {
    const res = cp.spawnSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8'
    });
    const lines = res.stdout.split('\n');
    for (const line of lines) {
      if (line.startsWith('password=')) {
        return line.slice('password='.length).trim();
      }
    }
  } catch (e) {
    console.error('Failed to get token from git credential:', e);
  }
  return null;
}

const token = getGitHubToken();
if (!token) {
  console.error('未找到有效的 GitHub 授权 Token，无法发布 Release');
  process.exit(1);
}

const owner = 'wkongxiaojie';
const repo = 'FlyEnv';
const tag = 'v4.18.4';
const releaseName = 'FlyEnv v4.18.4';
const releaseBody = `## 🚀 FlyEnv v4.18.4

### 新特性与更新内容：
1. **专属 GitHub OAuth 认证接入**：替换为独立维护的 GitHub OAuth App，实现去中心化授权与账号管理。
2. **全新 RSA 2048 许可证体系**：升级为高强度 RSA 2048 非对称加密算法，实现一机一码永久专属授权。
3. **云端自动下发与离线兜底**：客户端启动/刷新时自动从项目仓库 \`licenses.json\`（及国内镜像源）下发激活码；安装包内置离线映射，免网初次安装即激活。
4. **手动激活与体验优化**：在【设置 -> 许可证】新增一键复制本机 UUID、手动粘贴激活码即时激活以及从 GitHub 同步授权。
5. **强化许可证权限限制（合规性保障）**：未激活设备全面拦截站点、多语言项目管理与高级工具试用，必须拥有合法许可证才可使用。
`;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: body, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function uploadAsset(uploadUrlTemplate, filePath, assetName) {
  const uploadUrl = uploadUrlTemplate.replace(/\{.*?\}$/, '') + `?name=${encodeURIComponent(assetName)}`;
  const urlObj = new URL(uploadUrl);
  const fileSize = fs.statSync(filePath).size;
  console.log(`正在上传资产: ${assetName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'FlyEnv-Release-Uploader',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize
      }
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`资产上传成功: ${assetName}`);
          resolve(true);
        } else {
          console.error(`资产上传失败 [${res.statusCode}]: ${body}`);
          reject(new Error(`Upload failed with code ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(req);
  });
}

async function main() {
  console.log(`正在检查/创建 Release: ${tag} (${releaseName})...`);

  // 1. 检查是否存在同名 Release
  const releases = await request({
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/releases`,
    method: 'GET',
    headers: {
      'User-Agent': 'FlyEnv-Release-Uploader',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  let targetRelease = (releases.data || []).find((r) => r.tag_name === tag);

  if (!targetRelease) {
    console.log(`创建新 Release ${tag}...`);
    const createRes = await request({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases`,
      method: 'POST',
      headers: {
        'User-Agent': 'FlyEnv-Release-Uploader',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, JSON.stringify({
      tag_name: tag,
      target_commitish: 'master',
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false
    }));

    if (createRes.status !== 201) {
      console.error('创建 Release 失败:', createRes.data || createRes.raw);
      process.exit(1);
    }
    targetRelease = createRes.data;
  } else {
    console.log(`Release ${tag} 已存在，将直接追加/更新资产。`);
  }

  console.log(`Release ID: ${targetRelease.id}, Upload URL: ${targetRelease.upload_url}`);

  // 2. 查找待上传资产
  const releaseDir = path.join(__dirname, '../release');
  if (!fs.existsSync(releaseDir)) {
    console.error('release 目录不存在，请先打包！');
    process.exit(1);
  }

  const files = fs.readdirSync(releaseDir);
  const targetFiles = files.filter(
    (f) => (f.includes('4.18.4') && (f.endsWith('.exe') || f.endsWith('.blockmap'))) || f === 'latest.yml'
  );
  
  if (targetFiles.length === 0) {
    console.error('未在 release 目录下找到安装包或更新文件！');
    process.exit(1);
  }

  console.log('找到以下待上传资产:', targetFiles);

  const existingAssets = targetRelease.assets || [];

  for (const file of targetFiles) {
    // 统一命名为官方发布名
    let assetName = file;
    if (file.startsWith('FlyEnv-Local-Setup-')) {
      assetName = file.replace('FlyEnv-Local-Setup-', 'FlyEnv-Setup-');
    } else if (file.startsWith('FlyEnv-Local-Portable-')) {
      assetName = file.replace('FlyEnv-Local-Portable-', 'FlyEnv-Portable-');
    }

    // 如果已经存在同名资产，先删除旧资产
    const oldAsset = existingAssets.find((a) => a.name === assetName);
    if (oldAsset) {
      console.log(`正在清理已存在的旧资产: ${assetName} (ID: ${oldAsset.id})...`);
      await request({
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/releases/assets/${oldAsset.id}`,
        method: 'DELETE',
        headers: {
          'User-Agent': 'FlyEnv-Release-Uploader',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
    }

    const filePath = path.join(releaseDir, file);
    await uploadAsset(targetRelease.upload_url, filePath, assetName);
  }

  console.log(`\n🎉 发布完成！访问地址: ${targetRelease.html_url}`);
}

main().catch((e) => {
  console.error('发布过程发生错误:', e);
  process.exit(1);
});
