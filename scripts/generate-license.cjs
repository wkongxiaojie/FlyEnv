/**
 * FlyEnv 许可证（激活码）生成与校验工具
 * 使用方式:
 *   node scripts/generate-license.cjs [UUID]
 * 如果不传入 UUID，默认读取并为当前本机生成激活码。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { machineIdSync } = require('node-machine-id');

const privateKeyPath = path.join(__dirname, '../license-keys/private.pem');
const publicKeyPath = path.join(__dirname, '../license-keys/public.pem');

if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
  console.error('错误: 未找到 RSA 密钥文件，请确保 license-keys/ 目录下存在 private.pem 与 public.pem');
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

// 获取目标 UUID
const targetUuid = (process.argv[2] || machineIdSync()).trim();

/**
 * 为指定 UUID 生成永久激活码
 */
function createLicense(uuid) {
  const buffer = Buffer.from(uuid.trim(), 'utf8');
  const encrypted = crypto.privateEncrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    buffer
  );
  return encrypted.toString('base64');
}

/**
 * 校验激活码是否有效
 */
function verifyLicense(uuid, licenseBase64) {
  try {
    const decrypted = crypto.publicDecrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(licenseBase64.trim(), 'base64')
    ).toString('utf8');
    return decrypted === uuid.trim();
  } catch {
    return false;
  }
}

const license = createLicense(targetUuid);
const valid = verifyLicense(targetUuid, license);

console.log('================================================================');
console.log('                FlyEnv 永久许可证生成结果                       ');
console.log('================================================================');
console.log('目标设备 UUID:');
console.log(targetUuid);
console.log('----------------------------------------------------------------');
console.log('永久激活码 (License):');
console.log(license);
console.log('----------------------------------------------------------------');
console.log('RSA 校验状态:', valid ? '验证通过 (VALID)' : '验证失败 (INVALID)');
console.log('================================================================');
