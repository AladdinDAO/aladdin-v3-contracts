# StakeDAO vlSDT 迁移 — 测试报告 & 上线风险清单

> 作者:Gilbert
> 状态:v0.5(2026-07-20)
> 测试脚本:[`test/fork/concentrator/stakedao/StakeDaoVlSDTMigrationE2E.spec.ts`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-gz/test/fork/concentrator/stakedao/StakeDaoVlSDTMigrationE2E.spec.ts)(32 断言)
> 辅助工具:[`scripts/rehearsal/stakedao_main_batch.ts`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-gz/scripts/rehearsal/stakedao_main_batch.ts)(生成 Safe JSON + 实测 gas)、[`scripts/rehearsal/frontend_selector_check.js`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-gz/scripts/rehearsal/frontend_selector_check.js)(前端交易 selector 自动化回归)
> 分支:[`feat/test-stakedao-gz`](https://github.com/AladdinDAO/aladdin-v3-contracts/tree/feat/test-stakedao-gz)(基于 `feat/stakedao-migration` / PR #273)

---

## 1. 结论(TL;DR)

- 在真实 mainnet fork 上,impersonate 真实多签,完整重放了整个迁移流程:临时路由注册 → 23 笔主批次交易(含权限修复补丁)→ 清理路由 → 14 天后 finalize → vlSDT 委托与领取。**32/32 断言全部通过**,详见第2节。
- 生成了一份可执行、可直接导入 Safe Transaction Builder 的 23 笔交易 JSON([`safe_mainnet_main_23tx.json`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-gz/docs/safe-txs/safe_mainnet_main_23tx.json)),已在 fork 上逐笔跑通,23 笔总 gas 仅占块上限的 3.8%。
- 用浏览器自动化(Playwright 注入钱包)实测了 asdPENDLE 和 asdCRV 的存款流程:asdPENDLE 存款(含压力测试)一切正常;asdCRV 存入 sdVeCRV 会在链上 revert,已查清根因和影响范围。
- **发现两个高优先级问题**(详见第3节):委托合约在无人委托期间收到的奖励会永久卡死,且核对过 Google Sheet 里的多签执行清单,确认这一步目前没有被安排;asdCRV 存入 sdVeCRV 必然失败。

---

## 2. 测试范围与结果

### 方法

在本地 Hardhat 搭建真实 mainnet fork,impersonate 主多签、管理多签、keeper 等真实地址,直接驱动已经部署在主网上的迁移合约,不做任何 mock。测试脚本按迁移流程的真实顺序组织,断言覆盖以下环节:

| 编号 | 验证内容 | 结果 |
|---|---|---|
| 1 | wrapper 升级前后余额、totalSupply 完全不变 | 通过 |
| 2 | sPENDLE 抢救:updateStash 必须先于 sweepToken,否则资金会进错 stash | 通过 |
| 3 | 抢救前必须先跑一次正常 harvest,否则会 revert `unsupported poolType` | 通过 |
| 4 | wrapper 的 reward distributor 权限修复:不打补丁直接复现 `NotRewardDistributor` revert,补丁后复现成功 | 通过(双向验证) |
| 5 | compounder 的 `REWARD_DEPOSITOR_ROLE` 权限修复:同上双向验证 | 通过 |
| 6 | vlSDT 委托与领取机制:委托当周注入的奖励领不到(0),跨周后新注入的奖励按份额精确到账 | 通过 |
| 7 | sPENDLE 14 天 cooldown → finalize → 复利:+15 天后二次 harvest,`totalAssets` 增长、cooldown 归零 | 通过 |
| 8 | 无 veCTR 锁仓的地址调用 harvester 入口应被拒绝 | 通过,revert `insufficient lock amount` |
| 9 | 迁移后地址/字节码 sanity:全部指针指向新合约、burner 字节码含新地址不含旧地址 | 通过 |
| 10 | 前端 asdPENDLE Deposit 流程(含 approve/免 approve 两分支、Withdraw/Deposit 交替压力测试共 5 轮实测):交易确认、弹窗关闭、余额刷新 | 通过 |

运行方式:

```bash
HARDHAT_FORK_URL=https://eth.drpc.org \
npx hardhat test test/fork/concentrator/stakedao/StakeDaoVlSDTMigrationE2E.spec.ts --network hardhat
```

---

## 3. 发现的问题

### 3.1 高优先级(会影响资金安全或用户体验,需要处理)

#### 问题一:delegation 合约在无人委托期间会永久卡死奖励资金

**现象**:在委托合约还没有任何人委托(`totalSupply=0`)时,如果这时候有 bribe burn 把奖励代币转进来,这笔钱会永久无法分配给任何人——委托合约的领取逻辑只从用户委托当周开始往后算,委托之前的历史周即使有奖励也会被永久跳过。

**验证**:用测试脚本做了精确验证:在 `totalSupply=0` 时注入 500 SDT 探针 → 让一个用户完成委托 → 推进 8 周反复 checkpoint 和 claim → 结果这笔资金(实测累计卡住 1,753 SDT,含探针本金)始终无人可领。

**原理**([`VlSDTDelegation.sol`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-gz/contracts/concentrator/stakedao/VlSDTDelegation.sol)):合约收到 SDT 时(`_checkpointReward`,L342-384)不会检查有没有人委托,无条件把这笔钱按周记进 `weeklyRewards` 账本;而用户领取时(`_claim`,L250-276)是"某一周全网委托总量为 0 就跳过那一周",不是报错,是悄悄跳过、不分给任何人;更关键的是每个用户的领取起点(`claimIndex`,在 `_boost` 里设置,L211-223)是从他自己第一次委托那一周开始算的,不会往回追溯到他委托之前发生的事——所以"委托之前进的钱"对所有人来说永远在时间线之外,谁都碰不到。这个合约也没有管理员紧急提取函数,一旦发生,连主多签自己都拿不回来。

**怎么修**:这不是一笔能加进 MAIN 批次 20 笔清单里的多签交易——委托(`boost`)是任何 vlSDT 持有者自己调用的函数,不受角色权限控制,主多签或管理多签不能代为执行。正确的做法是在 Google Sheet 的执行顺序里,加一条前置检查项,插在"MAIN 批次第20笔(发起新 harvest)"之后、"Keeper 发起 CRV/sdPENDLE bribe burn"这两个后续动作之前:

> 确认 `VlSDTDelegation.totalSupply() > 0`。如果是 0,必须先安排至少一个地址(团队自己持有 vlSDT 的地址,或联系一个愿意配合的用户)完成一次委托(`vlBoost.setOperator` + `VlSDTDelegation.boost`),确认到账后才允许 Keeper 继续执行 burn。

#### 问题二:asdCRV 存入 sdVeCRV 必然链上失败

**现象**:用浏览器自动化实测,asdCRV 支持的四种存款代币(CRV / sdCRV / sdVeCRV / sdCRV-gauge)里,选 sdVeCRV 存入时交易会 revert `!authorized`。

**根因**:wrapper 合约里硬编码了 StakeDAO 的一个 CRV Depositor 合约地址,StakeDAO 已经把 sdCRV 的铸造权限轮换给了另一个新的 Depositor,旧地址永久失去铸造权限,这条路径必然失败。

**影响范围**:检查了 `withdraw`(取款)和 `depositWithGauge`(存 sdCRV-gauge)的源码,两者都不依赖这个失效地址,完全不受影响,只有"存 sdVeCRV"这一个入口会必挂。

**修复方式**:前端下架这个入口可以立即止损;合约层面重新部署换个地址修不了,因为新 Depositor 的函数接口已经完全重新设计,需要重写调用代码,而且 sdVeCRV 对应的迁移方法在新合约里已经找不到了——这是一个独立于本次 vlSDT 迁移的合约任务。

### 3.2 需要关注、但不阻塞上线

#### "存 CRV"里有一条分支潜伏着同一个根因,现在没坏,以后可能会坏

**现象**:`depositWithCRV` 内部有一条自动比价逻辑,会在"锁仓铸造"和"Curve 池兑换"两条路线之间自动选收益更高的一条。其中"锁仓铸造"这条路调用的是和上面 sdVeCRV 问题**同一个已失效的 Depositor 地址**,现在因为 Curve 池里 sdCRV 相对 CRV 有 68% 的价格溢价,代码每次都自动选了"Curve 池兑换"这条安全的路,从未真正走到会失败的分支上,所以用户现在存 CRV 完全正常。

**判断**:现在不紧急,不阻塞这次上线,但需要留意。触发条件是市场价格,不受任何人控制——一旦这个溢价消失、价格回归平价,代码会自动切换到那条已经坏掉的路径,用户存 CRV 会毫无征兆地全部开始失败。修复方案和 sdVeCRV 问题共享(重写调用代码接入新 Depositor),不需要单独处理,但建议在监控里加一条:跟踪 Curve 池的 CRV/sdCRV 兑换价格,接近平价时提前预警。

### 3.3 Safe 多签上线注意事项

以下不是 bug,是执行主批次交易时需要留意的操作要点:

- **交易文件核对**:已经根据合约 ABI 自动生成一份 23 笔 Safe Transaction Builder JSON([`safe_mainnet_main_23tx.json`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-gz/docs/safe-txs/safe_mainnet_main_23tx.json)),两处权限修复补丁的插入位置(分别在 wrapper 升级后、compounder 升级后)已在 fork 上逐笔跑通,可以直接拿去和实际要签的交易文件核对是否一致。
- **Gas**:23 笔总 gas 实测 2,287,716,占块上限 60,000,000 的 3.8%,不构成风险,不需要拆批(拆批反而会在 EmergencyConverter 挂载期间打开一个任何人可利用的窗口,应保持单一原子批次)。
- **状态新鲜度**:预演基于某个历史区块快照,待救 sPENDLE 数量、gauge 奖励等状态每天都在变,建议签署前用最新区块重跑一次测试脚本(耗时约 10 秒)。
- **跨多签顺序**:临时路由注册(管理多签)→ 主批次(主多签)→ 清理路由(管理多签)三笔交易跨两个 Safe,顺序没有链上强制约束,需要人工确认每一步的前置条件已满足。
- **失败预案**:逐笔评估过可逆性,`updateConverter`/`updateRewardDistributor`/`updateBribeBurner`/`updateStash` 均可逆,`ProxyAdmin.upgrade` 可升回旧实现,`locker.updateOperator` 可切回;唯一不可逆的是锁仓 3000 CTR 四年和已执行的 `sweepToken`,执行前需确认这两步没有回头路。
- **veCTR 锁仓前提**:`create_lock` 要求主多签当前没有未到期的锁仓(否则会 revert,需要改用 `increase_amount`),链上核实目前没有锁仓;另外锁仓的解锁时间是写死的绝对时间戳,不会随执行日期自动调整,目前离到期还有 1400 多天,不紧急。

### 3.4 已检查、确认不影响正常发布

- 新 vlSDT 代理合约的 admin 存储槽指向主多签本身,不是仓库统一使用的标准 ProxyAdmin。这个合约目前的业务函数基本不依赖 onlyOwner,不影响当前的正常使用,只是一处部署不一致,后续找个多签窗口归一处理即可。
- 真实 merkle 参数的 bribe burn 完整经济分账流程还没有实测过,目前只验证过构造参数下的分账逻辑是等价的。
- 新策略硬编码了 sPENDLE 地址并依赖其 cooldown 相关行为,外部协议未来若调整参数需要留意,和 sdVeCRV 那个问题是同一类风险(依赖的外部合约被对方单方面改动)。
- 旧的委托合约(约 16 万历史 SDT)按计划保留不动,供老用户继续领取历史奖励。

---

## 附 A:关键地址(Etherscan)

| 合约 | 地址 |
|---|---|
| 新 VlSDTDelegation proxy | [`0x322c76e1205dE5ee4146e40644563B482B1CDA43`](https://etherscan.io/address/0x322c76e1205dE5ee4146e40644563B482B1CDA43) |
| 新 sdCRV wrapper impl | [`0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08`](https://etherscan.io/address/0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08) |
| 新 SdCRVBribeBurnerV2 | [`0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27`](https://etherscan.io/address/0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27) |
| 新 SdPendleCompounder impl | [`0x8D985f7842A5e347CB668377e88B9fF659259D34`](https://etherscan.io/address/0x8D985f7842A5e347CB668377e88B9fF659259D34) |
| 新 SdPendleBribeBurner | [`0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb`](https://etherscan.io/address/0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb) |
| 新 SdPendleGaugeStrategy / stash | [`0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a`](https://etherscan.io/address/0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a) / [`0x32c9C5fa9f38475626bc9Bc115cC6363188F78A1`](https://etherscan.io/address/0x32c9C5fa9f38475626bc9Bc115cC6363188F78A1) |
| EmergencyConverter | [`0x9677f8Cc01226060C61733741E50Bb1B251561Cb`](https://etherscan.io/address/0x9677f8Cc01226060C61733741E50Bb1B251561Cb) |
| 旧 VeSDTDelegation(保留) | [`0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64`](https://etherscan.io/address/0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64) |
| 主多签 / 管理多签 | [`0xA0FB1b...4E99`](https://etherscan.io/address/0xA0FB1b11ccA5871fb0225B64308e249B97804E99) / [`0xc40549...23F`](https://etherscan.io/address/0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F) |
| StakeDAO 旧 CRV Depositor(sdVeCRV/CRV 存款问题根因) | [`0x88C88Aa6a9cedc2aff9b4cA6820292F39cc64026`](https://etherscan.io/address/0x88C88Aa6a9cedc2aff9b4cA6820292F39cc64026) |
| StakeDAO 新 CRV Depositor(接口不兼容) | [`0xa50CB9dFfcC740eE6B6f2D4B3CbC3a876B28c335`](https://etherscan.io/address/0xa50CB9dFfcC740eE6B6f2D4B3CbC3a876B28c335) |

链上状态核对入口:[wrapper Read as Proxy](https://etherscan.io/address/0x09B0E3A114135F528F762DB8363b4f5eae3F3bF1#readProxyContract) · [compounder Read as Proxy](https://etherscan.io/address/0x606462126E4Bd5c4D153Fe09967e4C46C9c7FeCf#readProxyContract) · [locker Read as Proxy](https://etherscan.io/address/0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09#readProxyContract)

## 附 B:副作用披露

1. 前端浏览器自动化测试往共享 Tenderly 验收 fork(`67b94a-12dbba`)写入了状态:以 SdPendleGauge 地址执行了 1 笔 approve + 5 笔 deposit(累计约 114 万+ sdPENDLE),该 fork 上后续做数值断言时会看到这些多出来的存款。
2. 本仓库 `yarn.lock`/`.yarn/`/`.yarnrc.yml` 因本地 yarn v4 安装依赖被改动,与本次迁移无关,可还原。
