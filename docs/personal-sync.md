# 飞阅个人同步服务

本服务为个人设备提供素材同步与受保护的安装包下载。私人素材和安装包只写入 Private Blob，不写入公开仓库、网页资源目录或日志。代码仓库只保留协议、通用测试和公开版本说明。

## 服务配置

- 正式地址：`https://fly-view-personal.vercel.app`
- `FLY_VIEW_SYNC_TOKEN`：至少 16 字符、无空白的随机配对凭据，设置为服务器环境变量。不要加 `VITE_`、`NEXT_PUBLIC_` 前缀。
- `BLOB_STORE_ID`：连接到此项目的 Private Blob store。SDK 默认使用该变量及 Vercel OIDC；本地维护如需访问 Blob，应使用独立授权配置，不能把 Blob 凭据交给客户端。
- `FLY_VIEW_ALLOWED_ORIGINS`：可选，逗号分隔的额外网页 origin。默认允许正式网页、`capacitor://localhost`、Android 和本地开发使用的 `http(s)://localhost` / `http(s)://127.0.0.1`。
- `FLY_VIEW_RELEASE_JSON`：可选的已验证安装包 manifest JSON；未设置时读取 `server/release-manifest.mjs` 的 `releaseManifest`。未发布 manifest 时返回 404。
- 安装包默认路径由 `server/release-info.mjs` 的 `pathname` 决定，服务器可通过 `FLY_VIEW_APK_PATH` 覆盖。
- `FLY_VIEW_PUBLIC_ORIGIN`：可选的正式发布 origin，用于校验 manifest。默认使用上述正式地址。

入口采用 Vercel Node.js Web Standard `fetch` 导出。应用部署配置应保留 `api/*.mjs` 和导入的 `server/*.mjs`，下载函数应具有足够的执行时间。安装包上传直接使用 Blob SDK/CLI，不经过小文件 JSON 接口。

## 素材 API

所有素材请求必须携带 `Authorization: Bearer <配对凭据>`。凭据只放请求头；不放 URL、JSON 素材、二维码的公开网页内容或日志。响应明确禁止浏览器和 CDN 缓存。CORS 不代替 Bearer 鉴权。

`GET /api/materials?limit=10&cursor=...`

返回 `{ materials, hasMore, cursor? }`。`limit` 范围 1–20，默认 10。客户端应持续翻页至 `hasMore:false`；每次同步从第一页开始，避免新素材插入时遗漏。返回每条素材的当前版本，包括带 `deletedAt` 的删除墓碑。也支持 `GET /api/materials?id=<素材ID>` 查询单条。

`POST /api/materials`

请求为 `{ material, baseRevision }`，使用 `Content-Type: application/json`。`material` 字段与 `apps/reader/src/lib/personalLibrary.ts` 的 `PersonalMaterial` 一致，服务器规范化日期并忽略额外传输字段。单次请求限制 3,500,000 字节，素材正文/字段还有与客户端一致的上限；大内容须拆分。

- 首次创建 `baseRevision:0`。
- 更新时 `baseRevision` 为最后确认的云端版本，必须与云端当前版本一致。
- `material.revision` 必须大于 `baseRevision`，可以跳跃。例如离线编辑多次后从云端版本 2 直接提交本地版本 9。
- 更新不允许改变 `createdAt`。删除是提交带 `deletedAt` 的新版本，不物理删除历史。
- 成功返回 HTTP 200：`{ material, revision, idempotent }`。
- 版本冲突返回 HTTP 409：`{ error:{code:'version_conflict',message}, material:<当前云端记录> }`。客户端保留本地修改并展示冲突，不自动覆盖。
- 已经成功的相同请求允许幂等重试，即使随后已有更新版本，也只确认原提交，不回退云端最新版本。
- 其余错误使用 `{error:{code,message}}`。401 为配对失败，400 为内容/版本无效，413 为大小超限，503 为暂时不可用或配置不完整。服务器不回传底层异常、凭据、Blob URL 或原始请求。

## 并发与中断恢复

存储布局全部位于 Private Blob：

```text
personal-heads/{id}.json
personal/{id}/claims/b{baseRevision}.json
personal/{id}/r{revision}.json
```

1. 先建立不可覆盖的空 head，使任何后续已提交素材都可被枚举。
2. 以 `claims/b{baseRevision}.json` 的 `allowOverwrite:false` 创建作为提交点。claim 保存完整规范化素材和 SHA-256；同一旧版本只能有一个后继，两个设备即使提交不同的新版本号，也不能同时成功。
3. 创建不可覆盖的 `r{revision}.json` 快照。已存在时只接受完全相同的规范化内容。
4. head 只是加速读取的索引，更新必须携带 `ifMatch:etag`。较新的 head 不会被较旧写入覆盖。
5. 读取使用 `useCache:false`，沿未合并的 claim 前进；若 writer 在提交点后中断，后续读取会从 claim 补齐快照。重试原请求可以继续完成。所有历史快照和 claim 保留。

分页每步只枚举一个 head，最多处理 20 个；响应约束在 3.6 MB 内。每个素材最多追踪 64 个尚未压入 head 的 claim，超限会明确返回错误，不返回可能错误的旧内容。正常写入每次更新 head；长时间持续的索引写入故障需要维护人员检查。此实现针对个人素材规模，未实现多人账号、全文搜索或大规模历史清理。

## 安装包发布与下载

`GET /api/release` 无需配对，返回公开版本元数据：`version`、`versionCode`、`notes`、`apkUrl`、`sha256`、`size`、`publishedAt`。`apkUrl` 固定为同源 `/api/download`，manifest 不包含配对凭据、Blob URL 或私有内容。

`GET /api/download` 必须携带相同 Bearer 凭据。服务器只读取配置中的固定 Private Blob APK，返回 `application/vnd.android.package-archive`，附文件长度，并直接流式交付，不把整包载入内存。响应 `private,no-store`，无客户端路径参数或公开直链。调用者完成下载后仍须校验 manifest 的 SHA-256、文件大小和版本，并交由系统安装程序验证签名。当前不支持分段续传。

Vercel 官方给出鉴权后从 Private Blob 流式响应的方式；其知识库说明流式响应可处理超过普通 4.5 MB 响应限制的内容。实际部署仍应完成真实 APK 整包下载、哈希与手机安装验证。

- [Private Blob 交付方式](https://vercel.com/docs/vercel-blob/private-storage)
- [Vercel 响应大小与流式交付](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Blob SDK 与条件写入](https://vercel.com/docs/vercel-blob/using-blob-sdk)

## 从本聊天或桌面维护素材

配对配置放在项目目录之外的私人文件，内容为 `{ "endpoint": "https://fly-view-personal.vercel.app", "token": "实际私有凭据" }`。此文件由维护流程写入，不能提交 Git。用户日常只需给出内容，维护助手生成素材并执行发布，无需用户手写 JSON。

结构化素材（由维护助手生成）的命令：

```powershell
node scripts/publish-personal-material.mjs --config <外部私人配置路径> --file <外部素材JSON路径>
```

文件可以是完整 `{material,baseRevision}`，也可以是单条 `PersonalMaterial`。更新已有记录时必须提供 `baseRevision`，可通过 `--base-revision` 指定。

普通 Markdown 或纯文本：

```powershell
node scripts/publish-personal-material.mjs --config <外部私人配置路径> --markdown <素材文件路径> --title <标题> --category work --kind article --language en
```

Markdown 内容逐字作为正文保存，不调用 AI、不编造翻译；中文材料使用 `--language zh`。省略标题时读取一级标题或文件名。相同文件和分类会生成稳定 ID，重复发布相同内容可直接确认；需要修改同一条素材时显式给 `--id`，脚本先读取云端当前版本再条件提交。竞争写入时返回冲突，不自动重试覆盖。

脚本只输出 `{ok,id,revision,idempotent}`，失败时输出经过清理的提示，不输出内容、凭据或完整配置。

## 本地验证

```powershell
node scripts/qa-personal-api.mjs
```

测试使用模拟 Blob，无真实网络或密钥，覆盖未授权时不访问存储、客户端与服务端校验一致、非法路径与类型、版本跳跃、两个设备竞争提交、幂等重试、提交后中断恢复、删除墓碑、分页、异常去敏、公开 manifest、鉴权 APK 流及桌面发布。
