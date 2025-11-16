# funny-steam-watcher

一个简单的 Steam 工具，当好友开始游玩关注的游戏时，推送通知到其他设备（当前仅支持 Bark）。

------

建议通过 docker 镜像运行：`docker pull dreamerblue/funny-steam-watcher`，也可以安装依赖手动运行（需要 Node.js 环境）。

设置环境变量后启动容器，或通过 `npm start` 手动启动：

- `CONFIG_PATH`：YAML 配置文件路径，默认为项目当前目录下的 `config.yaml`
- `STEAM_USERNAME`：Steam 用户名（必须）
- `STEAM_PASSWORD`：Steam 密码（当没有已存在的 refresh token 时必须）
- `STEAM_AUTH_CODE`：Steam 邮件验证码（当启用邮箱验证码时可传入，也可以在 stdin 手动输入任何验证码）
- `STEAM_2FA_CODE`：Steam 认证验证码（当启用移动应用令牌且时可传入，也可以在 stdin 手动输入任何验证码）
- `STEAM_DATA_DIR`：Steam 数据目录，默认为项目当前目录下的 `steam-data`
- `STEAM_MACHINE_NAME`：机器名，默认为空
- `STEAM_CLIENT_OS`：客户端 OS，默认自动获取，参考 [EPersonaState](https://github.com/DoctorMcKay/node-steam-user/blob/master/enums/EPersonaState.js)
- `STEAM_PERSONA_STATE`：设置登录后切换的 Steam 个人状态，默认为 `7`（隐身），参考 [EOSType](https://github.com/DoctorMcKay/node-steam-user/blob/master/enums/EOSType.js)
- `BARK_DOMAIN`：Bark 服务器地址，默认为 `https://api.day.app`
- `BARK_KEY`：Bark 推送 Key
- `LOGOUT_BEFORE_EXIT`：是否在程序退出前登出 Steam，默认为 `false`
- `USE_TIME_PREFIX`：是否在日志前添加时间前缀，默认为 `false`
- `DEBUG_STEAM`：是否启用 Steam 调试日志，默认为 `false`

## 配置文件

示例：

```yaml
watch: # 要关注游戏状态的好友
  '1': # Steam 好友 ID
    - 570 # 关注的游戏 App ID
    - 730
  '2':
    - '*' # 关注任何游戏
```

游戏的 App ID 可以从 [SteamDB](https://steamdb.info/apps/) 查询。
