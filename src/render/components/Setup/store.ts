import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { ElMessage, ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import { AppStore } from '@/store/app'
import { MessageError } from '@/util/Element'
import { reactive } from 'vue'
import localForage from 'localforage'
import { shell } from '@/util/NodeFn'

type GitHubUser = {
  uuid: string
  avatar_url: string
  login: string
}

type GitHubLicenseItem = {
  uuid: string
  license: string
}

interface State {
  tab: string
  uuid: string
  activeCode: string
  isActive: boolean
  message: string
  fetching: boolean
  githubAuthing: boolean

  githubUser?: GitHubUser
  githubLicense?: GitHubLicenseItem[]
}

const state: State = {
  tab: 'base',
  uuid: '',
  activeCode: '',
  isActive: false,
  message: '',
  fetching: false,
  githubAuthing: false
}

export const SetupStore = defineStore('setup', {
  state: (): State => state,
  getters: {},
  actions: {
    init() {
      return new Promise<void>((resolve) => {
        this.message = localStorage.getItem('flyenv-licenses-post-message') ?? ''
        localForage
          .getItem('flyenv-user-github')
          .then((res: any) => {
            if (res?.githubUser) {
              this.githubUser = reactive(res.githubUser)
            }
            if (res?.githubLicense) {
              this.githubLicense = reactive(res.githubLicense)
            }
          })
          .finally(() => this.githubUserRefresh())
        let time = Number(localStorage.getItem('flyenv-init-time') ?? '0')
        if (!time || isNaN(time)) {
          time = Math.round(new Date().getTime() / 1000)
          localStorage.setItem('flyenv-init-time', `${time}`)
        }
        const manuallyCleared = localStorage.getItem('flyenv-license-manually-cleared') === 'true'
        IPC.send('app-fork:app', 'licensesInit', !manuallyCleared).then((key: string, res?: any) => {
          if (res?.code === 200) {
            return
          }
          IPC.off(key)
          console.log('licensesInit: ', res)
          if (res?.code === 0) {
            const data: any = res?.data
            this.uuid = data.uuid
            this.activeCode = data.activeCode ?? ''
            this.isActive = !!data.isActive
            if (this.isActive) {
              const store = AppStore()
              store.config.setup.license = this.activeCode
              store.saveConfig().then().catch()
            }
          }
          resolve()
        })
      })
    },
    refreshState() {
      if (this.fetching) {
        return
      }
      this.fetching = true
      localStorage.removeItem('flyenv-license-manually-cleared')
      IPC.send('app-fork:app', 'licensesState').then((key: string, res?: any) => {
        if (res?.code === 200) {
          return
        }
        IPC.off(key)
        this.fetching = false
        if (res?.code === 1) {
          const errorMsg = typeof res?.msg === 'string' ? res.msg : I18nT('base.fail')
          MessageError(errorMsg)
          return
        }
        console.log('refreshState: ', res)
        const data: any = res?.data
        this.uuid = data?.uuid ?? this.uuid
        this.activeCode = data?.activeCode ?? ''
        this.isActive = !!data?.isActive
        const store = AppStore()
        store.config.setup.license = this.activeCode
        store.saveConfig().then().catch()
        if (this.isActive) {
          ElMessage.success(I18nT('licenses.licenseActivated'))
        } else {
          ElMessage.warning(I18nT('licenses.licenseNoActivated'))
        }
        this.githubLicenseFetch()
      })
    },
    manualActivate(code: string) {
      if (this.fetching) {
        return Promise.reject()
      }
      const trimmed = (code || '').trim()
      if (!trimmed) {
        MessageError(I18nT('base.fail'))
        return Promise.reject()
      }
      this.fetching = true
      return new Promise<void>((resolve, reject) => {
        IPC.send('app-fork:app', 'licensesVerify', trimmed).then((key: string, res?: any) => {
          if (res?.code === 200) {
            return
          }
          IPC.off(key)
          this.fetching = false
          if (res?.code === 0 && res?.data?.isActive) {
            localStorage.removeItem('flyenv-license-manually-cleared')
            this.activeCode = res.data.activeCode
            this.isActive = true
            const store = AppStore()
            store.config.setup.license = this.activeCode
            store.saveConfig().then().catch()
            ElMessage.success(I18nT('licenses.licenseActivated'))
            resolve()
          } else {
            const errorMsg =
              typeof res?.msg === 'string'
                ? res.msg
                : typeof res?.data?.msg === 'string'
                  ? res.data.msg
                  : I18nT('licenses.licenseNoActivated')
            MessageError(errorMsg)
            reject(new Error(errorMsg))
          }
        })
      })
    },
    clearLicense() {
      if (this.fetching) {
        return Promise.reject()
      }
      return ElMessageBox.confirm(
        '确定要清除本地许可证吗？清除后软件将恢复为未激活状态，可用于测试未激活限制或重新激活。',
        '清除许可证',
        {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          type: 'warning'
        }
      )
        .then(() => {
          this.fetching = true
          localStorage.setItem('flyenv-license-manually-cleared', 'true')
          return new Promise<void>((resolve) => {
            IPC.send('app-fork:app', 'licensesClear').then((key: string, res?: any) => {
              if (res?.code === 200) {
                return
              }
              IPC.off(key)
              this.fetching = false
              this.activeCode = ''
              this.isActive = false
              const store = AppStore()
              store.config.setup.license = ''
              store.saveConfig().then().catch()
              ElMessage.success('许可证已清除，已恢复为未激活状态')
              resolve()
            })
          })
        })
        .catch(() => {})
    },
    postRequest() {
      if (this.fetching) {
        return
      }
      const msg = this.message.trim()
      localStorage.setItem('flyenv-licenses-post-message', msg)
      const issueTitle = encodeURIComponent(`[License Request] ${this.uuid}`)
      const issueBody = encodeURIComponent(
        `### 许可证申请 (License Request)\n\n- **UUID**: \`${this.uuid}\`\n- **申请说明**: ${msg || '无'}\n\n---\n*请仓库管理员核实后在 licenses.json 中签发激活码。*`
      )
      const githubIssueUrl = `https://github.com/wkongxiaojie/FlyEnv/issues/new?title=${issueTitle}&body=${issueBody}`
      shell.openExternal(githubIssueUrl)
      ElMessage.success('已打开 GitHub Issue 申请页面！')
    },
    githubInfoSave() {
      localForage
        .setItem(
          'flyenv-user-github',
          JSON.parse(
            JSON.stringify({ githubUser: this.githubUser, githubLicense: this.githubLicense })
          )
        )
        .catch()
    },
    githubUserRefresh() {
      IPC.send('app-fork:app', 'githubUserFetch').then((key: string, res?: any) => {
        IPC.off(key)
        if (res?.code !== 0 || !res?.data?.user) return
        this.githubUser = reactive(res.data.user)
        this.githubLicense = reactive(res.data.license ?? [])
        this.githubInfoSave()
      })
    },
    githubAuthStart() {
      if (this.githubAuthing) {
        return
      }
      this.githubAuthing = true
      IPC.send('GitHub-OAuth-Start').then((key, res?: any) => {
        IPC.off(key)
        this.githubAuthing = false
        if (res?.code === 1) {
          MessageError(res?.msg ?? I18nT('base.fail'))
          return
        }
        const user = reactive(res?.data?.user ?? {})
        const license = reactive(res?.data?.license ?? [])
        this.githubUser = user
        this.githubLicense = license
        const store = AppStore()
        store.config.setup.user_uuid = user?.uuid
        store.saveConfig().then().catch()
        this.githubInfoSave()
      })
    },
    githubAuthCancel() {
      IPC.send('GitHub-OAuth-Cancel').then((key) => {
        IPC.off(key)
        this.githubAuthing = false
      })
    },
    githubAuthLogout() {
      ElMessageBox.confirm(I18nT('licenses.logoutTips'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        this.githubUser = undefined
        this.githubLicense = undefined
        const store = AppStore()
        store.config.setup.user_uuid = ''
        store.saveConfig().then().catch()
        localForage.removeItem('flyenv-user-github').catch()
      })
    },
    githubLicenseFetch() {
      if (this.githubAuthing || !this.githubUser?.uuid) {
        return
      }
      this.githubAuthing = true
      IPC.send('GitHub-OAuth-License-Fetch').then((key, res: any) => {
        IPC.off(key)
        this.githubAuthing = false
        if (res?.code === 0) {
          this.githubLicense = reactive(res?.data ?? [])
          this.githubInfoSave()
        } else if (res?.code === 1) {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
      })
    },
    githubAuthDelBind(uuid: string, license: string) {
      ElMessageBox.confirm(I18nT('licenses.delBindTips'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        this.githubAuthing = true
        IPC.send('GitHub-OAuth-License-Del-Bind', uuid, license).then((key: string, res: any) => {
          IPC.off(key)
          this.githubAuthing = false
          if (res?.code === 0) {
            this.githubLicense = reactive(res?.data ?? [])
            this.githubInfoSave()
            if (uuid === this.uuid) {
              const store = AppStore()
              store.config.setup.license = ''
              store.saveConfig().then().catch()
              this.isActive = false
              window.Server.UserUUID = ''
            }
          } else if (res?.code === 1) {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        })
      })
    },
    githubAuthAddBind(uuid: string, license: string) {
      ElMessageBox.confirm(I18nT('licenses.addBindTips'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        this.githubAuthing = true
        IPC.send('GitHub-OAuth-License-Add-Bind', uuid, license).then((key: string, res: any) => {
          IPC.off(key)
          this.githubAuthing = false
          if (res?.code === 0) {
            this.githubLicense = reactive(res?.data ?? [])
            this.githubInfoSave()
            this.refreshState()
          } else if (res?.code === 1) {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        })
      })
    }
  }
})
