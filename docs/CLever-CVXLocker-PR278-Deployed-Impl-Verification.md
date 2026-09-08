# CLever CVX Locker PR #278 已部署实现复验

> 作者:Gilbert
> 状态:v1.0(2026-09-08)
> 复验对象:主网 implementation [`0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534`](https://etherscan.io/address/0xbfb3a7a5fbb9207dea82fe06db4075b8caeda534)
> 对应源码:[PR #278](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/278) @ [`680b0c9`](https://github.com/AladdinDAO/aladdin-v3-contracts/commit/680b0c9b453a6c1232901d75cd49c3dc0592df6d)
> 主网 Locker 代理:[`0x96C68D861aDa016Ed98c30C810879F9df7c64154`](https://etherscan.io/address/0x96C68D861aDa016Ed98c30C810879F9df7c64154)
> 复验基准区块:`25932658`(epoch 2957)
> 脚本与数据:[`test/fork/clever/pr278/`](../test/fork/clever/pr278/)

---

## 结论:部署的字节码与审计对象逐字节相同,全部验证项在该地址上通过

`0xBfb3A7A5…` 的 deployed bytecode 与 `680b0c9` 的编译产物 keccak 相同、长度相同,Etherscan 验证为 Exact Match 且编译设置一致。在该地址上重跑了升级路径、19 周逐周执行、484 个用户与 17 个 Convex tranche 的全量对账、125 笔提款、以及 8 个负面场景,结果与代码审计阶段逐位一致。

距 epoch 2958 开始(`2026-09-10 08:00` 北京时间)还有约 **35 小时**。执行方是 6-of-9 的 Safe,签名收集时间需要计入。

上线动作是单笔原子 Safe batch:`ProxyAdmin.upgrade(Locker, 0xBfb3A7A5…)` + `processUnlockableCVX()`,必须在 epoch 2957 之内上链。epoch 2958 那一周需要有人盯,并备好 `3,173 CVX` 作为兜底(第 9 节)。

## 1. 部署信息与字节码核对

```
address        0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
部署交易        0x31cbe9452d9b0025bdbe2d5e0ef98dd78f6f09787fae40b789b1841f73a825a0
部署区块        25931637   2026-09-08T09:04:47Z
部署者          0x83fC663840aaebCc97031d9fE2FEaF9b707Cb4BE   (EOA)
gasUsed        5,348,223

deployed bytecode size    = 24,511 bytes    (EIP-170 上限 24,576,余 65)
deployed bytecode keccak  = 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
680b0c9 本地编译的期望值   = 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
```

Etherscan:Exact Match,合约名 `CLeverCVXLocker`,`v0.7.6+commit.7338295f`,optimizer 200 runs,evmVersion istanbul。

字节码中可定位到 5 个迁移常量的立即数([L66-L70](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L66-L70)):

| 常量 | 值 | 对应 epoch / residue |
|---|---|---|
| `DRIFT_MOD_12` | `76,667.262837450359231536` | 2817 / 12 |
| `DRIFT_MOD_13` | `32,351.447410870579373820` | 2818 / 13 |
| `DRIFT_MOD_15` | `561.911228961951745608` | 2752 / 15 |
| `DRIFT_MOD_16` | `237,756.223183328739207623` | 2838 / 16 |
| `DRIFT_MOD_13_ADMIN` | `3,173` | admin 垫付额 |

字节码同一意味着 EVM 层行为与审计阶段完全相同;下面重跑覆盖的是**基准区块之后的链上状态变化**与**升级路径本身**。

## 2. implementation 自身的状态

```
owner()                            = 0x0000000000000000000000000000000000000000
isKeeper(Safe) / isKeeper(bot)     = false / false
clevCVX / furnace                  = 0x0000000000000000000000000000000000000000
CVX 余额                            = 0
源码中 selfdestruct / delegatecall  = 不存在
```

`initialize()` 在这个版本里被注释掉([L174-L202](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L174-L202)),因此无人能初始化该 implementation 去占据 `owner`,其上所有 `onlyOwner` / `onlyKeeper` 函数都无人可调。合约内没有 `selfdestruct`,不存在把 implementation 销毁、连带打死代理的路径。唯一的任意 `.call` 点由 `approvedTargets` 白名单管控([L1096-L1110](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L1096-L1110)),该白名单在 implementation 自身存储里为空。

## 3. 复验基准与状态漂移

区块 `25932658`,仍处于 epoch 2957(该 epoch 结束于 `2026-09-10T00:00:00Z`)。与代码审计阶段的基准区块 `25924517` 相比:

```
!  totalLockedGlobal          3,131,764.415383843553497959   (+67.143393194642331263)
=  totalPendingUnlockGlobal   169,516.571837951758050412
=  totalUnlockedGlobal        77,052.778394272365239391
=  totalCVXInPool             77,052.778394272365239391
=  Locker 直接余额             15,410.555678854473047879
=  reward pool 余额            61,642.222715417892191512
=  Convex unlockable          112,087.541533595236886262
=  pendingUnlocked[2817]      209.189203791910235264
=  pendingUnlocked[2818]      1,562.240117453267819353
=  pendingUnlocked[2838]      4,469.427261945621070254
=  pendingUnlocked[2957]      141,926.991451881642610311
=  pendingUnlocked[2752]      0
```

唯一变化是一笔 `67.143393194642331263 CVX` 的新 deposit。迁移逻辑读取的每一个值都未变动。该 deposit 发生在 epoch 2957,按 `deposit()` 的行为([L351-L356](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L351-L356))它同时增加 residue 16 的内部需求与同一 Convex tranche 的物理量——第 6 节的逐槽对账实测确认了这一点。

## 4. 升级路径

fork 到区块 `25932658`,以 Safe 身份经 ProxyAdmin 升级:

```
升级前 proxy implementation   0xDFC1F72D5604020463318ff256433eca02B355d2
升级后 proxy implementation   0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
isKeeper(bot) = true    isKeeper(Safe) = true    owner = 0xFC08757c...0C5E
```

## 5. 逐周执行

epoch 2957→2975 共 19 次 `processUnlockableCVX()`,全部成功。

| epoch | gas | 处理后 netBorrow |
|---|---|---|
| 2957 | `236,665` | 尚未建立(物理仍多出 `3,173`) |
| 2958 | `321,237` | `104,074.280927075760550739` |
| 2959–2969 | `273,979`–`299,942` | `104,074.280927075760550739` |
| 2970 | `290,330` | `27,616.207293417311554467` |
| 2971 | `293,946` | `0` |
| 2972 | `287,327` | `109,018.710248320938605356` |
| 2973 | `288,214` | `108,456.799019358986859748` |
| 2974 | `290,559` | `17,658.905778819463078298` |
| 2975 | `290,647` | `0` |

owner 在 epoch 2958 收到的 CVX 增量精确为 `3,173.000000000000000000`。

## 6. 全用户与 17 槽对账

按区块 `25932658` 重新读取全部 484 个用户(含基准区块之后的新 Deposit 事件,无新增地址)。

**升级前**

```
用户 locked 聚合 = global locked = 3,131,764.415383843553497959    差 = 0
17 槽差额非零项:
  residue  0   -237,756.223183328739207623
  residue 12    +76,458.073633658448996272
  residue 13    +27,616.207293417311554467
  residue 14   -109,018.710248320938605356
  residue 15       +561.911228961951745608
  residue 16    +90,797.893240539523781450
  其余 11 个槽位(1–11)全部为 0
```

**关键节点**

| 处理后 | netBorrow | pool − 用户可提额 | global pending − 用户未来 pending |
|---|---|---|---|
| epoch 2958 | `104,074.280927075760550739` | `104,074.280927075760550739` | `0` |
| epoch 2970 | `27,616.207293417311554467` | `27,616.207293417311554467` | `0` |
| epoch 2971 | `0` | `0` | `0` |
| epoch 2972 | `109,018.710248320938605356` | `109,018.710248320938605356` | `0` |
| epoch 2975 | `0` | `0` | `0` |

**epoch 2975 终局**

```
用户 locked = global locked           差 = 0
用户未来 pending = global pending      差 = 0
用户可提额 = totalUnlockedGlobal       netBorrow = 0
totalCVXInPool − 用户可提额            = 0
内部账本 − Convex 物理额                = 0
17 槽差额非零项                        = 无

奖励补偿基数(2958–2975 逐周 netBorrow 累加)= 1,511,641.993464825826706737 CVX-weeks
```

那笔新增的 `67.14 CVX` deposit 对六项漂移额和终局对账均无影响,与审计阶段逐位相同。

## 7. 提款压力

epoch 2958 起,每周处理完立刻让当周全部有可提额的账户调用 `withdrawUnlocked()`。

```
125 笔提款成功,0 笔失败,合计 246,569.350232224123289803 CVX
受影响账户 0xB828…Fd2a 在 epoch 2958 一次提出 158,982.352179694127953141 CVX
epoch 2958 当周 102 笔、225,220.626429344806974573 CVX
终局 totalUnlockedGlobal = 0,totalCVXInPool = 0,内部 − 物理 = 0
```

epoch 2970 与 2971 两周的 Locker 直接余额被提款掏空至 `0`,relock 所需资金由 PR 新增的 reward pool 取款分支([L751-L753](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L751-L753))补齐:

```
epoch 2970  从 reward pool 取出 34,026.015422000580637045 CVX
epoch 2971  从 reward pool 取出 25,640.814884436910832039 CVX
```

## 8. 负面场景复现

这些场景测的是「不按要求执行会怎样」,用来量化各条前置条件的代价。

| 场景 | 结果 | 关键数字 |
|---|---|---|
| 升级前的实现在 epoch 2957 调用 | 回滚 `insufficient unlocked CVX` | keeper bot 的自动调用消耗不掉这个窗口 |
| 同一 epoch 内第二次调用 | 回滚 `no exp locks` | 第 1 次 gas `236,665` |
| 跳过 epoch 2957 | 2958–2973 全部成功,**epoch 2974 回滚** `SafeMath: subtraction overflow` | 当时 `totalUnlockedGlobal` = `213,099.157799701467539240`;该分支要扣 `232,724.884692421166391761` |
| 只跳过 hardcode 周 2972 | **19 次调用零回滚**,终局账目错 | `totalUnlockedGlobal` 比用户可提额聚合少 `109,018.720248320938605356` |
| 2957 后单笔普通提款清零直接余额 | epoch 2958 回滚 `ERC20: transfer amount exceeds balance` | `0xf60240…ce44` 提走 `15,451.174919`,直接余额 `15,410.555678854473047879` → `0` |
| 上述情形整周无人补款 | 2959–2970 成功,**epoch 2971 回滚** `SafeMath: subtraction overflow` | 代价晚 13 周显形 |
| 批次内固定补 `3,173` | epoch 2958–2975 全部成功 | admin CVX 净变化 `0`;终局内部−物理 `-3,173`,仅 residue 0 不平 |
| 抢跑清零后仍固定补 `3,173` | epoch 2958 成功 | 固定值抗抢跑成立 |

八项结果与代码审计阶段逐位一致。

## 9. 上线前核对清单

**epoch 2957(截止 `2026-09-10 08:00` 北京时间)**——单笔原子 Safe batch:

1. `ProxyAdmin.upgrade(0x96C68D86…4154, 0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534)`
2. `CLeverCVXLocker.processUnlockableCVX()`

执行前按当天最新区块重跑一次逐周模拟(读实时 pre-state),再核对:

```
currentEpoch                     == 2957
proxy 当前 implementation         == 0xDFC1F72D5604020463318ff256433eca02B355d2
待升级目标的 bytecode keccak       == 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
pendingUnlocked[2838]            == 4,469.427261945621070254
pendingUnlocked[2957]            == 141,926.991451881642610311
pendingUnlocked[2817]            == 209.189203791910235264
pendingUnlocked[2818]            == 1,562.240117453267819353
pendingUnlocked[2752]            == 0
Convex unlockable                == 112,087.541533595236886262
```

执行后立即核对:`pendingUnlocked[2957] == 0`、`pendingUnlocked[2838] == 146,396.418713827263680565`、Convex `unlockable == 0`、新 tranche 的 `unlockTime / 604800 == 2974`。这一步不修复用户提款,`0xB828…Fd2a` 要等 epoch 2958 之后。

**epoch 2958 之前**:手上备好 `3,173 CVX`,并预先准备一个「转 `3,173` 给 Locker + `processUnlockableCVX()`」的 Safe batch 作为 plan B。这一周必须有人盯——漏掉整周会在 epoch 2971 崩。

**epoch 2958**:先读直接余额,尽早执行(不足 `3,173` 时走 plan B);执行后核对 `pendingUnlocked[2958] == 0`、`totalCVXInPool == totalUnlockedGlobal`、`netBorrow == 104,074.280927075760550739`、`0xB828…Fd2a` 的 `withdrawUnlocked()` 模拟成功。

**epoch 2959–2975**:每周执行,并按第 5 节表格核对当周处理后的 `netBorrow`。2970–2975 是 hardcode 周,漏一周不会回滚,但会留下缺口。

**epoch 2975 之后**:确认 `netBorrow == 0`、三项 global 与用户聚合逐项相等、17 个 residue 差额全为 `0`,再升级到去掉一次性 hardcode 的长期版本。

## 附:复现命令

```bash
export HARDHAT_FORK_URL=https://eth-mainnet.public.blastapi.io

# 按当前区块刷新用户快照(远端 Multicall3)
node test/fork/clever/pr278/14-refresh-snapshot.mjs

# 升级到部署地址 + 逐周执行
FORK_BLOCK=<上一步得到的区块> npx hardhat run test/fork/clever/pr278/13-verify-deployed-impl.ts

# 全用户 + 17 槽对账
node test/fork/clever/pr278/15-reconcile-latest.mjs

# 提款压力 / 全部负面场景
FORK_BLOCK=<同上> npx hardhat run test/fork/clever/pr278/16-withdrawals-deployed.ts
FORK_BLOCK=<同上> npx hardhat run test/fork/clever/pr278/17-scenarios-deployed.ts
```

[`13`](../test/fork/clever/pr278/13-verify-deployed-impl.ts)–[`17`](../test/fork/clever/pr278/17-scenarios-deployed.ts) 这五个脚本以「升级到部署地址 + 手写 ABI」的方式工作,不引用仓库里的合约源码,因此在任何分支上运行都测的是链上那份字节码。本次运行的原始输出存于 [`data/out_16_withdrawals.log`](../test/fork/clever/pr278/data/out_16_withdrawals.log) 与 [`data/out_17_scenarios.log`](../test/fork/clever/pr278/data/out_17_scenarios.log)。
