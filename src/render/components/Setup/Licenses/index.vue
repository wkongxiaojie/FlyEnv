<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <div class="p-3 flex flex-col gap-4">
        <el-card>
          <template #header>
            <div class="flex items-center justify-between">
              <span>{{ I18nT('licenses.currentLicenseState') }}</span>
              <div class="flex items-center gap-2">
                <el-button
                  v-if="store.isActive"
                  type="danger"
                  size="small"
                  plain
                  :loading="store.fetching"
                  @click="doClear"
                >
                  清除许可证
                </el-button>
                <el-tag v-if="store.isActive" type="success" effect="dark">
                  {{ I18nT('licenses.licenseActivated') }}
                </el-tag>
                <el-tag v-else type="danger" effect="dark">
                  {{ I18nT('licenses.licenseNoActivated') }}
                </el-tag>
              </div>
            </div>
          </template>
          <template #default>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1 p-3 rounded bg-stone-100 dark:bg-stone-800">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-stone-500">机器识别码 (UUID)</span>
                  <el-button size="small" type="primary" link @click="copyText(store.uuid)">
                    {{ I18nT('base.copy') }}
                  </el-button>
                </div>
                <div class="font-mono text-sm break-all select-all text-stone-800 dark:text-stone-200">
                  {{ store.uuid }}
                </div>
              </div>

              <div
                v-if="store.isActive"
                class="flex flex-col gap-1 p-3 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-green-700 dark:text-green-400">
                    专属永久授权已生效
                  </span>
                  <el-button
                    size="small"
                    type="success"
                    link
                    @click="copyText(store.activeCode)"
                  >
                    {{ I18nT('base.copy') }}
                  </el-button>
                </div>
                <div class="font-mono text-xs break-all select-all text-stone-600 dark:text-stone-300">
                  {{ store.activeCode }}
                </div>
              </div>

              <div class="flex flex-col gap-2 pt-2 border-t border-stone-200 dark:border-stone-700">
                <span class="text-xs text-stone-500 font-semibold">
                  {{ store.isActive ? '更换或重新激活许可证' : '输入激活码激活' }}
                </span>
                <el-input
                  v-model="manualCode"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  placeholder="在此粘贴专属许可证激活码 (Base64)"
                  clearable
                />
                <div class="flex gap-2 justify-end">
                  <el-button
                    v-if="store.isActive"
                    type="danger"
                    plain
                    :loading="store.fetching"
                    :disabled="store.fetching"
                    @click="doClear"
                  >
                    清除许可证
                  </el-button>
                  <el-button
                    type="primary"
                    :loading="store.fetching"
                    :disabled="!manualCode.trim() || store.fetching"
                    @click="doManualActivate"
                  >
                    立即激活
                  </el-button>
                  <el-button
                    :loading="store.fetching"
                    :disabled="store.fetching"
                    @click="doRefresh"
                  >
                    从 GitHub 同步授权
                  </el-button>
                </div>
              </div>
            </div>
          </template>
        </el-card>

        <el-card>
          <template #header>
            <div class="w-full flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span>{{ I18nT('licenses.myLicense') }}</span>
                <span v-if="store.githubUser?.login">{{ store.githubUser?.login }}</span>
              </div>
              <div class="flex items-center gap-1">
                <template v-if="store.githubUser?.uuid">
                  <el-button
                    class="button"
                    :disabled="!!store.githubAuthing"
                    link
                    @click="store.githubLicenseFetch()"
                  >
                    <yb-icon
                      :svg="import('@/svg/icon_refresh.svg?raw')"
                      class="w-[20px] h-[20px]"
                      :class="{ 'fa-spin': store.githubAuthing }"
                    ></yb-icon>
                  </el-button>
                  <el-button link @click.stop="store.githubAuthLogout()">
                    <yb-icon
                      :svg="import('@/svg/logout.svg?raw')"
                      class="w-[20px] h-[20px]"
                    ></yb-icon>
                  </el-button>
                </template>
                <template v-else>
                  <div
                    v-if="!store.githubAuthing"
                    class="flex h-full aspect-square items-center justify-center"
                  >
                    <yb-icon
                      class="hover:text-blue-400 cursor-pointer"
                      :svg="import('@/svg/github.svg?raw')"
                      width="20"
                      height="20"
                      @click.stop="store.githubAuthStart()"
                    />
                  </div>
                  <el-button v-else size="small" @click.stop="store.githubAuthCancel()">{{
                    I18nT('base.cancel')
                  }}</el-button>
                </template>
              </div>
            </div>
          </template>
          <template #default>
            <el-empty
              v-if="!store.githubUser?.uuid"
              v-loading="store.githubAuthing"
              :description="I18nT('licenses.loginTips')"
            >
              <template #image>
                <yb-icon
                  class="text-blue-400 cursor-pointer hover:text-blue-400"
                  :svg="import('@/svg/github.svg?raw')"
                  @click.stop="store.githubAuthStart()"
                />
              </template>
              <template v-if="store.githubAuthing" #description>
                <span>{{ I18nT('licenses.logingTips') }}</span>
              </template>
            </el-empty>
            <el-table v-else :data="store.githubLicense" show-overflow-tooltip>
              <el-table-column type="index"></el-table-column>
              <el-table-column
                :label="I18nT('licenses.licenseNo')"
                prop="license"
              ></el-table-column>
              <el-table-column
                :label="I18nT('licenses.licenseBindUUID')"
                prop="uuid"
              ></el-table-column>
              <el-table-column :label="I18nT('common.label.action')" width="100px">
                <template #default="scope">
                  <el-dropdown>
                    <template #default>
                      <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                    </template>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          :disabled="!!store.githubAuthing || !scope.row.uuid"
                          @click.stop="store.githubAuthDelBind(scope.row.uuid, scope.row.license)"
                          >{{ I18nT('licenses.delBind') }}</el-dropdown-item
                        >
                        <el-dropdown-item
                          :disabled="
                            !!store.githubAuthing ||
                            !!scope.row.uuid ||
                            store.githubLicense?.some((s) => s.uuid === store.uuid)
                          "
                          @click.stop="store.githubAuthAddBind(store.uuid, scope.row.license)"
                          >{{ I18nT('licenses.bindCurrentUUID') }}</el-dropdown-item
                        >
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </el-card>

        <el-card v-if="!store.isActive">
          <template #header>
            <span>{{ I18nT('common.label.licenseDescription') }}</span>
          </template>
          <template #default>
            <div class="flex flex-col gap-2 items-start">
              <div class="text-xl">{{ I18nT('common.label.licenseDescription') }}</div>
              <p>{{ I18nT('licenses.description') }}</p>
              <p>{{ I18nT('licenses.restrictions.title') }} </p>
              <p>1. {{ I18nT('licenses.restrictions.items.0') }}</p>
              <p>2. {{ I18nT('licenses.restrictions.items.1') }}</p>
              <p>3. {{ I18nT('licenses.restrictions.items.2') }}</p>
              <p>4. {{ I18nT('licenses.restrictions.items.3') }}</p>
              <p>5. {{ I18nT('licenses.restrictions.items.4') }}</p>
              <p>{{ I18nT('licenses.licenseInfo') }}</p>
              <div class="text-xl">{{ I18nT('licenses.howToObtain.title') }}</div>
              <p>{{ I18nT('licenses.howToObtain.description') }}</p>
              <p>1. {{ I18nT('licenses.howToObtain.methods.0.title') }} </p>
              <p>
                {{ I18nT('licenses.howToObtain.methods.0.description') }}
                <el-button
                  type="primary"
                  link
                  @click.stop="toUrl('https://github.com/wkongxiaojie/FlyEnv')"
                  >https://github.com/wkongxiaojie/FlyEnv</el-button
                >
              </p>
              <p>2. {{ I18nT('licenses.howToObtain.methods.1.title') }} </p>
              <p>
                {{ I18nT('licenses.howToObtain.methods.1.description') }}
                <el-button
                  type="primary"
                  link
                  @click.stop="toUrl('https://github.com/wkongxiaojie/FlyEnv')"
                  >https://github.com/wkongxiaojie/FlyEnv</el-button
                ></p
              >
              <p> 3. {{ I18nT('licenses.howToObtain.methods.2.title') }} </p>
              <p>
                {{ I18nT('licenses.howToObtain.methods.2.description') }}
                <el-button
                  type="primary"
                  link
                  @click.stop="toUrl('https://github.com/wkongxiaojie/FlyEnv')"
                  >https://github.com/wkongxiaojie/FlyEnv</el-button
                >
              </p>
              <p>{{ I18nT('licenses.submitInfo') }}</p>
              <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
                <el-input v-model="store.uuid" readonly></el-input>
              </el-form-item>
              <el-form-item
                class="w-full mb-0"
                label-position="top"
                :label="I18nT('licenses.messageLabel')"
              >
                <el-input
                  v-model="store.message"
                  class="mt-4"
                  type="textarea"
                  resize="none"
                  :rows="6"
                  :placeholder="I18nT('licenses.messagePlaceholder')"
                ></el-input>
              </el-form-item>
              <div class="mt-4">
                <el-button
                  :loading="store.fetching"
                  :disabled="store.fetching || !store.message.trim()"
                  type="primary"
                  @click.stop="doRequest"
                  >{{ I18nT('licenses.requestButton') }}</el-button
                >
                <el-button
                  :loading="store.fetching"
                  :disabled="store.fetching"
                  @click.stop="doRefresh"
                  >{{ I18nT('licenses.refreshButton') }}</el-button
                >
              </div>
            </div>
          </template>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>
<script lang="ts" setup>
  import { ref } from 'vue'
  import { SetupStore } from '@/components/Setup/store'
  import { I18nT } from '@lang/index'
  import { shell, clipboard } from '@/util/NodeFn'
  import { ElMessage } from 'element-plus'

  const store = SetupStore()
  const manualCode = ref('')

  const toUrl = (url: string) => {
    shell.openExternal(url)
  }
  const doRequest = () => {
    store.postRequest()
  }
  const doRefresh = () => {
    store.refreshState()
  }
  const doClear = () => {
    store.clearLicense()
  }
  const doManualActivate = () => {
    store.manualActivate(manualCode.value).then(() => {
      manualCode.value = ''
    }).catch(() => {})
  }
  const copyText = (text: string) => {
    if (!text) return
    clipboard.writeText(text)
    ElMessage.success(I18nT('base.copySuccess'))
  }
</script>
