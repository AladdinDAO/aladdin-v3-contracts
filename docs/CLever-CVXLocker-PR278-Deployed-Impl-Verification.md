# CLever CVX Locker PR #278 已部署实现复验

> 作者:Gilbert
> 状态:v1.3(2026-09-09,新增第 10 节:主网执行的全链路核对)
> 复验对象:主网 implementation [`0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534`](https://etherscan.io/address/0xbfb3a7a5fbb9207dea82fe06db4075b8caeda534)
> 对应源码:[PR #278](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/278) @ [`680b0c9`](https://github.com/AladdinDAO/aladdin-v3-contracts/commit/680b0c9b453a6c1232901d75cd49c3dc0592df6d)
> 主网 Locker 代理:[`0x96C68D861aDa016Ed98c30C810879F9df7c64154`](https://etherscan.io/address/0x96C68D861aDa016Ed98c30C810879F9df7c64154)
> 复验基准区块:`25932658`(epoch 2957)
> 脚本与数据:[`test/fork/clever/pr278/`](../test/fork/clever/pr278/)

---

## 结论:主网 epoch 2957 批次已执行,全链路核对通过

上线批次已于 `2026-09-09T12:26:11Z`(epoch 2957 窗口内)在主网执行成功:[`0x76f130e6…1034ff`](https://etherscan.io/tx/0x76f130e6d92a30ed5c0335c0ea7d6760e8e3139ef393565b77cd11ce3b1034ff),区块 `25939803`,gasUsed `319,581`。批次内容逐字节解码、6 个签名人、执行前后 40 项状态读数、9 条事件、以及全用户与 17 槽对账,**48 项核对全部通过**,与验证阶段的预测逐位一致(第 10 节)。主网这一笔的 `safeTxHash` 与验证阶段在 fork 上执行的那一笔相同。

`0xBfb3A7A5…` 的 deployed bytecode 与 `680b0c9` 的编译产物 keccak 相同、长度相同,Etherscan 验证为 Exact Match 且编译设置一致。在该地址上重跑了升级路径、19 周逐周执行、484 个用户与 17 个 Convex tranche 的全量对账、125 笔提款、以及 8 个负面场景,结果与代码审计阶段逐位一致。

**下一个动作是 epoch 2958 的 `processUnlockableCVX()`**,窗口在 `2026-09-10 08:00` 北京时间开启,距今约 **11 小时**。按执行后的真实状态重算,该周处理后应得 `netBorrow = 104,074.280927075760550739`,与原预期逐位相同;受影响账户 `0xB828…Fd2a` 届时可一次提出 `158,982.352179694127953141 CVX`(第 10.7 节)。

`3,173 CVX` 这项要求落在 **Locker 的直接余额**上,与 Safe 的余额无关:实测把 Safe 的 CVX 清为 `0` 后,epoch 2957 与 2958 两步仍然全部成功。Locker 当前持有 `15,410.555678854473047879`,**主路径不需要任何人补钱**。

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

### 3.1 链上前置条件

```
Convex CVXLockerV2
  isShutdown             = false          (lock() 可用;若为 true 则 relock 会失败)
  rewardsDuration        = 604800
  kickRewardEpochDelay   = 4 epoch
  已到期那笔的到期 epoch   = 2957
  → 最早可被第三方 kick 的 epoch = 2961

代理与多签
  ProxyAdmin.getProxyAdmin(Locker)          = 0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE
  ProxyAdmin.getProxyImplementation(Locker) = 0xDFC1F72D5604020463318ff256433eca02B355d2
  ProxyAdmin.owner                          = 0xFC08757c505eA28709dF66E54870fB6dE09f0C5E
  Locker owner()                            = 0xFC08757c505eA28709dF66E54870fB6dE09f0C5E  (同一个 Safe)
  Safe v1.3.0,门槛 6/9,nonce 287
  Safe CVX 余额                              = 2,020.968392124635998893   (兜底需 3,173,详见第 9 节)

基准区块以来 Convex 侧事件
  Withdrawn  = 0 笔        KickReward = 0 笔
```

`kickRewardEpochDelay = 4` 意味着当周到期的 `112,087.541533595236886262 CVX` 在 epoch 2961 之前不可能被第三方 kick 走,因此 epoch 2957 与 2958 两个窗口不存在 kick 风险。

## 4. 升级路径与真实上线批次

fork 到区块 `25932658`。

**基础升级**:

```
升级前 proxy implementation   0xDFC1F72D5604020463318ff256433eca02B355d2
升级后 proxy implementation   0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
isKeeper(bot) = true    isKeeper(Safe) = true    owner = 0xFC08757c...0C5E
```

**存储布局回归**——升级后立即读取、不调用任何函数,比对 31 项(16 个公开 getter、6 个 `pendingUnlocked` 槽位、8 个原始 storage slot、一个用户结构):

```
全部一致 —— 存储布局无变化
```

这与 diff 的形态相符:新版本只增加了 `constant`(不占存储)并注释掉一个函数,没有新增或改动状态变量。

**真实 6-of-9 原子批次**——`Safe.execTransaction` → delegatecall `MultiSendCallOnly v1.3.0`(`0x40A2aCCbd92BCA938b02010E17A5b8929b49130D`)→ `[ProxyAdmin.upgrade, Locker.processUnlockableCVX]`,由前 6 个 owner 逐个 `approveHash` 后执行:

```
Safe nonce = 287,门槛 6/9
execTransaction 成功,gasUsed = 308,178

执行后 proxy implementation = 0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
pendingUnlocked[2957]       = 0
pendingUnlocked[2838]       = 146,396.418713827263680565
Convex unlockable           = 0
epoch 2974 的 tranche        = 执行前 tranche(341.340240726504422476)
                              + 执行前 unlockable(112,087.541533595236886262)
                              = 112,428.881774321741308738
```

`processUnlockableCVX()` 在批次里由 Safe 发起,`isKeeper(Safe) = true` 成立。

**批次原子性**——把批次故意改成 `[upgrade, process, process]`(第二次 `process` 必然以 `no exp locks` 失败):

```
execTransaction 回滚 GS013
代理 implementation 仍为 0xDFC1F72D5604020463318ff256433eca02B355d2 —— 升级随整批回滚
```

因此批次不会停在「已升级但未执行 2957 前置」的中间状态。

**safeTxHash 需要交叉校验**:准备批次时,合约 `getTransactionHash()` 的读数应与按 EIP-712 独立复算的值(`domainSeparator` + `SafeTx` structHash)比对一致后再拿去签名。本次验证中曾出现单次读数与真值不一致的情况,双算即可发现。

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

### 7.1 两次调用之间的无权限函数干扰

epoch 2957 与 2958 之间隔着整整一周,期间任何人都能调用 `donate()` 与 `harvest()`。实测(出资来自一个与本协议无关的 CVX 大户,不动 Locker 自身余额):

```
2957 调用后直接余额        = 15,410.555678854473047879
donate(100) 成功后         = 15,410.555678854473047879   (未变)
harvest 回滚 'Furnace: distribute zero CVX'(未移动任何资金)
epoch 2958                = 成功
```

`donate()` 收到的 CVX 会在同一笔交易里全额转给 Furnace,而 `_distribute` 的 80% 质押目标当前恰好等于已质押量([L1138](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L1138)),因此不会再往 reward pool 转移直接余额。**能把直接余额清零的只有用户提款**——这把 epoch 2958 的风险面收窄到了单一来源。

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

> epoch 2957 这一步已于 `2026-09-09T12:26:11Z` 在主网执行完成,核对结果见第 10 节。以下保留原清单,`2958` 起的部分仍待执行。

**epoch 2957(截止 `2026-09-10 08:00` 北京时间)**——单笔原子 Safe batch:

1. `ProxyAdmin.upgrade(0x96C68D86…4154, 0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534)`
2. `CLeverCVXLocker.processUnlockableCVX()`

签名前核对 `safeTxHash`:合约 `Safe.getTransactionHash(...)` 的读数,与按 EIP-712 独立复算的值比对一致(见第 4 节)。

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

执行后立即核对:

```
pendingUnlocked[2957]          == 0
pendingUnlocked[2838]          == 146,396.418713827263680565
Convex unlockable              == 0
epoch 2974 的 tranche 增量       == 执行前的 Convex unlockable
```

最后一项要按「执行前 tranche + 执行前 unlockable」这个关系核,不要写死金额——epoch 2957 内的任何新 deposit 都会同额抬高这个 tranche(本次复验时它已从 `112,361.738381127098977475` 变成 `112,428.881774321741308738`,差值正是那笔 `67.14` 新存款)。

这一步不修复用户提款,`0xB828…Fd2a` 要等 epoch 2958 之后。

**epoch 2958 之前**——先厘清 `3,173 CVX` 这项要求落在哪。

硬性条件是 **epoch 2958 调用时 Locker 的直接余额不低于 `3,173`**,与 Safe 持有多少 CVX 无关。实测:

```
Safe 余额清为 0,Locker 保持原有余额
  epoch 2957  成功 gas=236,665
  epoch 2958  成功 gas=338,337,owner() 收到 3,173

阈值(Locker 直接余额,Safe 仍为 0)
  恰好 3,173             → epoch 2958 成功
  3,173 差 1 wei         → epoch 2958 回滚 ERC20: transfer amount exceeds balance
```

Locker 当前持有 `15,410.555678854473047879`,余量 `12,237.555678854473047879`。**主路径不需要任何人补钱。**

以下是**兜底路径,不是上线前提**——只在 epoch 2958 的调用真的回滚时才用得上。兜底批次需要 Safe 自己有 `3,173`:

```
Safe 当前 CVX 余额   = 2,020.968392124635998893
兜底批次所需          = 3,173
缺口                 = 1,152.031607875364001107
```

按当前余额执行兜底批次会以 `GS013` 回滚(实测);补足后成功(gasUsed `400,123`)。`owner()` 就是 Safe 本身,这 `3,173` 在同一笔交易内原路返回,**Safe 净变化为 `0`**——只需要在执行时刻账上有这笔钱,用完不减少。

建议(非必须)在 epoch 2958 之前给 Safe 补上这 `1,152.031607875364001107`,并预先准备好批次 `[CVX.transfer(Locker, 3173), Locker.processUnlockableCVX()]`(同样 6-of-9)。转账金额固定为 `3,173`,这样执行前若发生一笔提款也不影响(第 8 节)。代价为零而收益明确:整周的余量只有 `12,237.55`,单个持有 `15,451.174919` 可提额的账户一笔提款即可击穿(第 8 节),而漏掉整个 epoch 2958 会在 epoch 2971 崩。

这一周必须有人盯。能把直接余额清零的只有用户提款,`donate()` / `harvest()` 做不到(第 7.1 节)。

**epoch 2958**:先读直接余额,尽早执行(不足 `3,173` 时走 plan B);执行后核对 `pendingUnlocked[2958] == 0`、`totalCVXInPool == totalUnlockedGlobal`、`netBorrow == 104,074.280927075760550739`、`0xB828…Fd2a` 的 `withdrawUnlocked()` 模拟成功。

**epoch 2959–2975**:每周执行,并按第 5 节表格核对当周处理后的 `netBorrow`。2970–2975 是 hardcode 周,漏一周不会回滚,但会留下缺口。

**epoch 2975 之后**:确认 `netBorrow == 0`、三项 global 与用户聚合逐项相等、17 个 residue 差额全为 `0`,再升级到去掉一次性 hardcode 的长期版本。

## 10. 主网执行的全链路核对

### 10.1 交易与执行窗口

```
tx            0x76f130e6d92a30ed5c0335c0ea7d6760e8e3139ef393565b77cd11ce3b1034ff
区块           25939803   区块哈希 0x6efcc5061d0269878c7aaa181f2a1aae45c67872ad48621064a31c5887c8eb1f
时间           1788956771   2026-09-09T12:26:11Z
epoch          2957        (窗口要求:必须落在 2957)
from           0x38a93e70b0D8343657f802C1c3Fdb06aC8F8fe99   (多签 owner 之一)
to             0xFC08757c505eA28709dF66E54870fB6dE09f0C5E   (CLever 多签)
selector       0x6a761202  execTransaction
status         1  成功
gasUsed        319,581     手续费 0.000110950560519804 ETH
```

执行后区块仍在规范链上,已有 59 个以上确认。

### 10.2 批次内容逐字节解码

```
外层 to                  = 0x40A2aCCbd92BCA938b02010E17A5b8929b49130D  MultiSendCallOnly v1.3.0
operation                = 1  delegatecall
value / safeTxGas / baseGas / gasPrice = 0 / 0 / 0 / 0
gasToken / refundReceiver = 零地址 / 零地址

内层恰好 2 步,均为 CALL、value 0:
  [1] ProxyAdmin 0x1F57286F…87EE
      upgrade(0x96C68D861aDa016Ed98c30C810879F9df7c64154,
              0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534)
  [2] Locker 0x96C68D86…4154
      processUnlockableCVX()   selector 0xc5cae252
```

`safeTxHash = 0x1eac9425aaca0894c377fd8297a3257e0734ba90e8e6c9fea286fb5074925a05`,与本地按 EIP-712 独立复算的值一致,也与验证阶段在 fork 上以 nonce `287` 执行的那一笔相同——上链的批次与验证过的批次在内容上逐字节相同。

### 10.3 签名

执行时 Safe nonce `287`,门槛 `6/9`,签名 `390` 字节 = 6 个,全部为 ECDSA,签名人全部属于当前 owner 集合:

```
0x18411aB626c9b3B3Dd5b7356574D8ff396436744
0x38a93e70b0D8343657f802C1c3Fdb06aC8F8fe99
0x74390470F4001Ca85D93bD546A4Ab1724359654B
0x85DB62FdFA9Ee6050f8b422F74D75D2069dA102B
0xC8Be49a9b1ca1A1cc654491a7cBbD27aBfA06A81
0xe3522d85d37F55735e9327CD7a5cDe3abaf28E03
```

### 10.4 执行前后的状态

以执行区块 `25939803` 与其前一区块 `25939802` 对比。

```
proxy implementation      0xDFC1F72D5604020463318ff256433eca02B355d2
                        → 0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
新 implementation 字节码 keccak 仍为 0xc84c87dc…50d52

epoch 2957 分支的三项效果:
  pendingUnlocked[2957]   141,926.991451881642610311 → 0
  pendingUnlocked[2838]     4,469.427261945621070254 → 146,396.418713827263680565
                                                       (= 旧值 + 原 [2957],与预测一致)
  Convex unlockable       112,087.541533595236886262 → 0
  epoch 2974 的 tranche          341.340240726504422476 → 112,428.881774321741308738
                                 增量 112,087.541533595236886262 = 执行前 unlockable
  2974 % 17 = 16,重锁落在 residue 16
  Convex 物理总额 3,304,453.987221795311548371 未变(取出即重锁)
```

不该动的 13 项全部未变:`totalLockedGlobal`、`totalPendingUnlockGlobal`、`totalUnlockedGlobal`、`totalCVXInPool`、`totalDebtGlobal`、`accRewardPerShare`、Locker 直接余额、reward pool 余额、Safe CVX 余额、`pendingUnlocked[2817]` / `[2818]` / `[2752]` / `[2958]`。

### 10.5 事件

```
[0] Locker.Upgraded(0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534)
[1] CVXLockerV2.Withdrawn(Locker, 112,087.541533595236886262, relocked=false)
[2] CVX.Transfer(CVXLockerV2 → Locker, 112,087.541533595236886262)
[3] CVX.Approval(Locker → CVXLockerV2, 0)
[4] CVX.Approval(Locker → CVXLockerV2, 112,087.541533595236886262)
[5] CVX.Transfer(Locker → CVXLockerV2, 112,087.541533595236886262)
[6] CVX.Approval(Locker → CVXLockerV2, 0)
[7] CVXLockerV2.Staked(Locker, epoch起点 1788998400, 112,087.541533595236886262, ...)
[8] Safe.ExecutionSuccess(0x1eac9425…5a05, payment 0)
```

取出额与重锁额相等,`Staked` 的 epoch 起点 `1788998400` 对应 epoch 2958 起锁、2974 到期。执行后至今 Locker 侧无任何事件,Convex 侧 `Withdrawn` / `KickReward` 均为 0 笔。

### 10.6 执行后的账目形态

按执行区块重新读取全部 484 个用户:

```
用户 locked 聚合 = totalLockedGlobal = 3,129,715.602283843553497959    差 0

global pending − 用户未来 pending    = 148,167.848035072441735182
用户可提额 − global unlocked         = 148,167.848035072441735182
pendingUnlocked[2817]+[2818]+[2838] = 148,167.848035072441735182      三者吻合

17 槽差额非零项:
  residue  0   -237,756.223183328739207623
  residue 12    +76,458.073633658448996272
  residue 13    +27,616.207293417311554467
  residue 14   -109,018.710248320938605356
  residue 15       +561.911228961951745608
  residue 16    +90,797.893240539523781450
  其余 11 槽为 0

内部账本 − Convex 物理额 = -3,173.000000000000000000
```

这是 epoch 2958 之前应有的形态:已到期未处理的用户债权集中在那三个槽位,按设计要到 epoch 2958 的调用才转入 global unlocked;`-3,173` 是 admin 垫付额形成的物理盈余,同样在 2958 结清。六项 residue 漂移额与执行前逐位相同——residue 16 两侧都因期间的新存款各增 `67.143393194642331263`,差额不变。

### 10.7 epoch 2958 的预期读数(按执行后真实状态重算)

验证阶段之后有用户新发起 unlock,`pendingUnlocked[2958]` 已从 `0` 变为 `2,048.813077317612995107`(该笔 unlock 共 `2,048.8131`,其余 `0.000022682387004893` 溢到后续槽位)。以执行区块为基准 fork 后逐周执行:

```
epoch 2958 执行后
  pendingUnlocked[2958]     = 0
  totalUnlockedGlobal       = 331,343.720433738180520419
  totalCVXInPool            = 331,343.720433738180520419   == totalUnlockedGlobal
  totalPendingUnlockGlobal  = 21,348.723825561703320123    == 用户未来 pending,差 0
  netBorrow                 = 104,074.280927075760550739
  owner 收到 CVX             = 3,173.000000000000000000
  Locker 直接余额            = 269,701.497718320288328907
  受影响账户 0xB828…Fd2a 可一次提出 158,982.352179694127953141
  gas ≈ 319,237
```

2958–2975 的逐周 `netBorrow` 轨迹与第 5 节表格**逐位相同**,终局 `netBorrow = 0`、内部与物理差额 `0`、17 槽全部对平。

`netBorrow` 对普通存取款不敏感:新增的 unlock 同额进入 global unlocked 与用户可提额两侧,相减后不变。因此逐周核对应以 `netBorrow` 和两个恒等式(`totalCVXInPool == totalUnlockedGlobal`、`global pending == 用户未来 pending`)为准,`totalUnlockedGlobal` 等绝对读数会随用户活动变化。

### 10.8 兜底余额现状

```
Locker 直接余额   15,410.555678854473047879   门槛 3,173,余量 12,237.555678854473047879
Safe CVX 余额      2,194.515305096139675971   兜底批次需 3,173,缺 978.484694903860324029
```

主路径不受影响(第 9 节)。兜底批次按当前 Safe 余额仍无法执行。

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

# 存储布局回归 / 真实 6-of-9 原子批次 / 批次原子性 / 无权限干扰 / plan B
FORK_BLOCK=<同上> npx hardhat run test/fork/clever/pr278/18-safe-batch-deployed.ts

# 3,173 CVX 的位置与阈值
FORK_BLOCK=<同上> npx hardhat run test/fork/clever/pr278/19-cvx-requirement.ts

# 主网执行的全链路核对(第 10 节)
node test/fork/clever/pr278/20-verify-mainnet-execution.mjs      # 交易、批次、签名
node test/fork/clever/pr278/21-verify-mainnet-state.mjs          # 执行前后状态与事件
BLOCK=25939803 node test/fork/clever/pr278/14-refresh-snapshot.mjs
node test/fork/clever/pr278/22-forward-from-mainnet.mjs           # 执行后账目形态
NO_WITHDRAW=1 FORK_BLOCK=25939803 npx hardhat run test/fork/clever/pr278/23-next-window-expectations.ts
```

[`13`](../test/fork/clever/pr278/13-verify-deployed-impl.ts)–[`17`](../test/fork/clever/pr278/17-scenarios-deployed.ts) 这五个脚本以「升级到部署地址 + 手写 ABI」的方式工作,不引用仓库里的合约源码,因此在任何分支上运行都测的是链上那份字节码。本次运行的原始输出存于 [`data/out_16_withdrawals.log`](../test/fork/clever/pr278/data/out_16_withdrawals.log) 、[`data/out_17_scenarios.log`](../test/fork/clever/pr278/data/out_17_scenarios.log) 、[`data/out_18_safe_batch.log`](../test/fork/clever/pr278/data/out_18_safe_batch.log) 与 [`data/out_19_cvx_requirement.log`](../test/fork/clever/pr278/data/out_19_cvx_requirement.log)。
