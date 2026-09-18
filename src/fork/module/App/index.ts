import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { Base } from '../Base'
import { machineId } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { arch } from 'os'
import axios from 'axios'
import { publicDecrypt } from 'crypto'
import { appDebugLog, isLinux, isMacOS, isWindows } from '@shared/utils'
import YAML from 'yamljs'
import { compareVersions } from '@shared/compare-versions'
import type { SoftInstalled } from '@shared/app'
import { isDEB } from '../../util/Linux'
import { GitHubAccountService } from './GitHubAccount'

class App extends Base {
  private readonly githubAccount = new GitHubAccountService()

  constructor() {
    super()
  }

  githubUserFetch() {
    return new ForkPromise(async (resolve) => {
      resolve({ user: { login: 'wkongxiaojie', uuid: 'wkongxiaojie' }, license: [] })
    })
  }

  githubLicenseFetch() {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }

  githubLicenseDelete(uuid: string, license: string) {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }

  githubLicenseAdd(uuid: string, license: string) {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }

  private getRSAKey() {
    return `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4to/NFaQ7rRH4GzaDXne
qXsslxpdYnq/mSmFCMUyHzJZVw/w6dDtaqH//hz676dokMORXbhSMAFSjD/jxnL5
k77D2+r2LzOolyrWV5uOTqzueD6wfWXlk5joHP8LoPkKIcInMkLih3wzMeVp9ju/
cAgpXxq8n4AFEcxuDsqxwLzeM0/rOMPebx8u1R1WHDorfy6kDF0BqhXdliYJj8CI
yx1KKl0gJU9ZE2wGEjLa/ajxg4swWwTjoNYgTGbL7sBO0CHGy8PhnvfCcom7gm5K
27wEI6McWep1AS951q5LCjPme56EyW423xGhBcQMyTzYN8QqtulqzyjpOqYeXE+t
QQIDAQAB
-----END PUBLIC KEY-----`
  }

  private verifyLicense(license: string, currentUuid: string): boolean {
    if (!license || !currentUuid) return false
    try {
      const uid = publicDecrypt(
        this.getRSAKey(),
        Buffer.from(license, 'base64') as any
      ).toString('utf-8')
      return uid.trim() === currentUuid.trim()
    } catch (e) {
      return false
    }
  }

  private async fetchRemoteLicenses(): Promise<Record<string, string>> {
    const urls = [
      'https://raw.githubusercontent.com/wkongxiaojie/FlyEnv/refs/heads/master/licenses.json',
      'https://cdn.jsdelivr.net/gh/wkongxiaojie/FlyEnv@master/licenses.json'
    ]
    for (const url of urls) {
      try {
        const res = await axios({
          url,
          method: 'get',
          timeout: 5000,
          proxy: this.getAxiosProxy()
        })
        if (res?.data && typeof res.data === 'object') {
          return res.data
        }
      } catch (e) {
        // continue
      }
    }

    // 降级兜底：尝试读取本地内置或同目录的 licenses.json
    const candidatePaths = [
      process.resourcesPath ? join(process.resourcesPath, 'licenses.json') : '',
      join(process.cwd(), 'licenses.json'),
      join(__dirname, '../../../licenses.json'),
      join(global.Server?.AppDir ?? '', 'licenses.json'),
      join(global.Server?.Static ?? '', 'licenses.json')
    ].filter(Boolean)
    for (const p of candidatePaths) {
      try {
        if (existsSync(p)) {
          const content = readFileSync(p, 'utf-8')
          return JSON.parse(content)
        }
      } catch {}
    }

    return {}
  }

  start(version: string) {
    return new ForkPromise(async (resolve) => {
      resolve(true)
    })
  }

  feedback(info: any) {
    return new ForkPromise(async (resolve) => {
      resolve(true)
    })
  }

  licensesInit() {
    return new ForkPromise(async (resolve, reject, on) => {
      let uuid = ''
      try {
        uuid = await machineId()
      } catch (e) {
        appDebugLog(`[machineId][error]`, `${e}`).catch()
      }
      const data = {
        requestSuccess: true,
        uuid,
        activeCode: '',
        isActive: false
      }

      // 1. 优先检查本地已有且有效的许可证
      const localLicense = global.Server?.Licenses
      if (localLicense && this.verifyLicense(localLicense, uuid)) {
        data.activeCode = localLicense
        data.isActive = true
        on({
          'APP-Licenses-Code': data.activeCode
        })
        resolve(data)
        return
      }

      // 2. 尝试从 GitHub 仓库或本地内置 licenses.json 自动匹配
      try {
        const map = await this.fetchRemoteLicenses()
        const code = map[uuid]
        if (code && this.verifyLicense(code, uuid)) {
          data.activeCode = code
          data.isActive = true
          on({
            'APP-Licenses-Code': data.activeCode
          })
          resolve(data)
          return
        }
      } catch {}

      // 3. 未匹配到，处于未激活状态
      resolve(data)
    })
  }

  licensesState() {
    return new ForkPromise(async (resolve, reject, on) => {
      let uuid = ''
      try {
        uuid = await machineId()
      } catch (e) {}
      const obj = {
        uuid,
        activeCode: '',
        isActive: false
      }

      // 尝试重新从远端或本地拉取匹配
      try {
        const map = await this.fetchRemoteLicenses()
        const code = map[uuid]
        if (code && this.verifyLicense(code, uuid)) {
          obj.activeCode = code
          obj.isActive = true
          on({
            'APP-Licenses-Code': obj.activeCode
          })
          resolve(obj)
          return
        }
      } catch {}

      // 检查现有本地许可证
      const localLicense = global.Server?.Licenses
      if (localLicense && this.verifyLicense(localLicense, uuid)) {
        obj.activeCode = localLicense
        obj.isActive = true
        on({
          'APP-Licenses-Code': obj.activeCode
        })
        resolve(obj)
        return
      }

      on({
        'APP-Licenses-Code': ''
      })
      resolve(obj)
    })
  }

  licensesVerify(license: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      let uuid = ''
      try {
        uuid = await machineId()
      } catch (e) {
        reject(e)
        return
      }
      const trimmed = (license || '').trim()
      if (!trimmed) {
        reject(new Error('许可证激活码不能为空'))
        return
      }
      if (this.verifyLicense(trimmed, uuid)) {
        on({
          'APP-Licenses-Code': trimmed
        })
        resolve({
          uuid,
          activeCode: trimmed,
          isActive: true
        })
      } else {
        reject(new Error('激活码无效或与本机 UUID 不匹配'))
      }
    })
  }

  licensesRequest(message: string) {
    return new ForkPromise(async (resolve) => {
      resolve(true)
    })
  }

  checkAppVersionUpdate() {
    return new ForkPromise(async (resolve, reject) => {
      let file = 'latest.yml'
      const a = arch()
      if (isMacOS()) {
        if (a === 'x64') {
          file = 'latest-mac.yml'
        } else {
          file = 'latest-mac-arm64.yml'
        }
      } else if (isLinux()) {
        if (a === 'x64') {
          file = 'latest-linux.yml'
        } else {
          file = 'latest-linux-arm64.yml'
        }
      }
      try {
        const res = await axios({
          url: `https://raw.githubusercontent.com/wkongxiaojie/FlyEnv/refs/heads/master/${file}`,
          method: 'get',
          proxy: this.getAxiosProxy()
        })
        const content = res.data
        const json = YAML.parse(content)
        const version = json['version']
        const check = compareVersions(version, global.Server.APPVersion)
        let name = ''
        if (isMacOS()) {
          if (a === 'x64') {
            name = `FlyEnv-${version}.dmg`
          } else {
            name = `FlyEnv-${version}-arm64.dmg`
          }
        } else if (isLinux()) {
          const isdeb = await isDEB()
          const ext = isdeb ? '.deb' : '.rpm'
          if (a === 'x64') {
            name = `FlyEnv-${version}-x64${ext}`
          } else {
            name = `FlyEnv-${version}-arm64${ext}`
          }
        } else {
          name = `FlyEnv-Setup-${version}.exe`
        }
        const url = `https://github.com/wkongxiaojie/FlyEnv/releases/download/v${version}/${name}`
        resolve({
          app: global.Server.APPVersion,
          online: version,
          check,
          url
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // App 模块负责启动上报/许可证/更新检查，不管理任何服务的配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // App 模块没有独立的运行时日志文件
    return []
  }
}

export default new App()
