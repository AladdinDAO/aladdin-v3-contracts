# CLever CVX Locker PR #278 复核

> 作者:Gilbert
> 状态:v1.4(2026-09-08,新增第 13 节:对主网已部署 implementation 的复验)
> 复核对象:[PR #278](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/278) @ [`680b0c9`](https://github.com/AladdinDAO/aladdin-v3-contracts/commit/680b0c9b453a6c1232901d75cd49c3dc0592df6d)(base = `main` @ `814b87c`)
> 主网 Locker:[`0x96C68D861aDa016Ed98c30C810879F9df7c64154`](https://etherscan.io/address/0x96C68D861aDa016Ed98c30C810879F9df7c64154)
> 基准区块:`25924517`(timestamp `1788772499`,epoch 2957)
> 脚本与数据:[`test/fork/clever/pr278/`](../test/fork/clever/pr278/)

---

## 结论:可以按现有 commit 上线,没有发现代码缺陷

从当前主网区块起做逐周模拟,epoch 2957→2975 的 19 次 `processUnlockableCVX()` 全部成功,最终 484 个用户的账本、三个 global 变量、Convex 17 个物理 tranche 三者逐项对平,差额全部为 `0`;125 笔真实提款(合计 `246,569.350232224123289803 CVX`)零失败。5 个 hardcode 常量与 Convex 历史上真实到期的 tranche 金额逐位一致,漏执行的 epoch 恰好只有代码处理的那 4 个。

已部署到主网的 implementation [`0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534`](https://etherscan.io/address/0xbfb3a7a5fbb9207dea82fe06db4075b8caeda534) 的字节码与本报告审计的 `680b0c9` 编译产物逐字节相同,全部结论已在该地址上重跑确认(第 13 节)。

**代码层面没有发现会造成资金损失、越权或账务不可恢复的缺陷。** 交付物层面有 2 项需要明确接受,都不阻塞上线(第 9 节):`initialize()` 注释掉导致新部署路径失效、迁移全程无事件。

上线的前提是两条硬性执行要求。它们是这套一次性状态机的既定设计,不是缺陷,但漏掉的代价要等几个月才显形(第 8 节量化了每种漏法的后果):

- **epoch 2957 必须完成升级 + 调用**。漏掉后 2958–2973 表面全部正常,epoch 2974 才以 `SafeMath: subtraction overflow` 回滚。
- **epoch 2958 的调用必须在 epoch 2958 之内成功**。漏掉整周后到 epoch 2971 回滚。这一步依赖 Locker 的直接余额不少于 `3,173 CVX`([L784](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L784)),当前直接余额 `15,410.555678854473047879 CVX`,而单个用户 `0xf60240…ce44` 的可提额 `15,451.174919 CVX` 一笔就够把它清零。兜底已验证:备好 `3,173 CVX`,回滚时当周补进去重试(详见 8.2)。

距 epoch 2958 开始(`2026-09-10 08:00` 北京时间)还有约 **35 小时**,执行方是 6-of-9 的 Safe,签名收集时间需要计入。

---

## 1. 复核范围与数据来源

| 项 | 值 |
|---|---|
| 主网状态基准 | 区块 `25924517`,epoch 2957(2026-09-03 08:00 ~ 2026-09-10 08:00 北京时间) |
| 用户集合 | 从部署区块 `14627685` 到基准区块的全部 `Deposit` 事件:`2,325` 笔,`484` 个唯一地址 |
| 用户仓位 | 逐个读取 `getUserInfo` / `getUserLocks`,固定在同一区块 |
| Convex 侧 | `CVXLockerV2.lockedBalances()` 的 17 个 tranche + 全部历史 `Withdrawn` / `KickReward` 事件 |
| 执行环境 | Hardhat fork(EDR),`solc 0.7.6+commit.7338295f`,optimizer runs 200,evmVersion istanbul |

权限关系:

```
ProxyAdmin 0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE  owner = 0xFC08757c...0C5E
Locker     owner()                                     = 0xFC08757c...0C5E
Locker     isKeeper(0xFC08757c...0C5E)                  = true
Locker     isKeeper(0x11E91BB6...B938)                  = true   (EOA keeper bot)
0xFC08757c505eA28709dF66E54870fB6dE09f0C5E              = Safe v1.3.0, 门槛 6/9
```

同一个 Safe 同时是 ProxyAdmin owner、Locker owner 和 keeper,所以「升级 + `processUnlockableCVX()`」可以在一笔 Safe 交易里原子完成。

编译产物指纹(用于核对实际部署的 implementation):

```
deployed bytecode size   = 24,511 bytes   (EIP-170 上限 24,576,余 65)
deployed bytecode keccak = 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
creation bytecode keccak = 0xe51e6f0a0934ca1117903340a1e32635cd48bc81f175c8618ce28f26c4053733
```

## 2. 漂移的成因与范围

`processUnlockableCVX()` 每周把 Convex 到期的 tranche 取出,扣掉当周用户到期的 `pendingUnlocked[currentEpoch]`,余下的原样重新锁回([L720-L757](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L720-L757))。它只读当周那一个槽位([L738](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L738)),因此漏掉一周会同时造成两件事:

1. 该周的 `pendingUnlocked[e]` 永久留存,`totalUnlockedGlobal` 从未加上这笔;用户侧 `_updateUnlocked` 只看 `unlockEpoch <= currentEpoch` 就记入可提额([L1019](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L1019)),于是 `withdrawUnlocked()` 里的 `totalUnlockedGlobal.sub(_unlocked)` 下溢([L441](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L441))。
2. 该周物理到期的本金被推迟到下一次调用才重新锁,`unlockEpoch % 17` 因此换了槽位,产生 residue 漂移。

从 Locker 部署到基准区块,`CVXLockerV2` 针对本合约共发出 `207` 笔 `Withdrawn` 事件,覆盖 epoch 2746–2956 连续区间,缺口正好是:

```
2752  (residue 15)
2817  (residue 12)
2818  (residue 13)
2838  (residue 16)
2957  (residue 16,当周尚未处理)
```

`KickReward` 事件 `0` 笔,历史上没有发生过第三方 kick,也就没有产生过 kick penalty。

链上 `pendingUnlocked` 在 epoch 2600–3010 全区间的非零槽位是 `2817 / 2818 / 2838 / 2957` 加上 2959–2972 的未来周,过去的未处理槽位只有这三个。`unlock()` 只能写入 `currentEpoch + 1 … + 17`([L393](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L393)、[L407](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L407)),扫描区间覆盖了合约的全生命周期。

## 3. 5 个 hardcode 常量与真实 tranche 逐一核对

在每个漏掉的 epoch 开始前一个区块上调用 `CVXLockerV2.lockedBalances()`,取 `unlockTime == epoch * 604800` 那一条 tranche 的金额,和 [L66-L70](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L66-L70) 的常量比较:

| 常量 | 对应 epoch | residue | 该 epoch 真实到期的 tranche | 是否一致 |
|---|---|---|---|---|
| `DRIFT_MOD_15` | 2752 | 15 | `561.911228961951745608` | 一致 |
| `DRIFT_MOD_12` | 2817 | 12 | `76,667.262837450359231536` | 一致 |
| `DRIFT_MOD_13` | 2818 | 13 | `32,351.447410870579373820` | 一致 |
| `DRIFT_MOD_16` | 2838 | 16 | `237,756.223183328739207623` | 一致 |

`DRIFT_MOD_13_ADMIN = 3,173` 对应 admin 此前垫付的那笔。链上可以直接验到这个数额:

```
Convex 物理总额                                   = 3,304,386.843828600669217108
totalLockedGlobal + totalPendingUnlockGlobal      = 3,301,213.843828600669217108
差额                                              =         3,173.000000000000000000
```

代码注释里写的 4 个 `pendingUnlocked` 历史值([L764-L768](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L764-L768))与链上读数逐位一致,`pendingUnlocked[2752] = 0` 也成立。8 个分支的 residue 注释(`2957→16`、`2958→0`、`2970→12`、`2971→13`、`2972→14`、`2973→15`、`2974→16`、`2975→0`)全部正确。

## 4. 升级前的账本状态

484 个用户聚合 vs global:

| 项 | 用户聚合 | Global | 差额 |
|---|---|---|---|
| Locked | `3,131,697.271990648911166696` | `3,131,697.271990648911166696` | `0` |
| 未来 pending | `21,348.723802879316315230` | `169,516.571837951758050412` | `+148,167.848035072441735182` |
| 可提额 | `225,220.626429344806974573` | `77,052.778394272365239391` | `-148,167.848035072441735182` |

`148,167.848035072441735182` 恰好等于 `pendingUnlocked[2817] + [2818] + [2838] + [2957]` 之和:本金没有消失,只是被记在了 global pending 而没有转入 global unlocked,提款时因此下溢。

逐槽对账(内部需求 = 各用户 `epochLocked[r]` + 落在该 residue 的未来 `pendingUnlocked`;物理 = Convex 对应 tranche,当周已到期的 `112,087.541533595236886262` 计入 residue 16):

residue `r` 对应的到期 epoch 是 `2958 + r`(residue 0 → epoch 2958,residue 16 → epoch 2974)。

| residue | 到期 epoch | 内部需求 | 物理 | 差额 |
|---|---|---|---|---|
| 0 | 2958 | `218,801.300076976044019010` | `456,557.523260304783226633` | `-237,756.223183328739207623` |
| 1 | 2959 | `168,122.841794714932859740` | `168,122.841794714932859740` | `0` |
| 2 | 2960 | `664,238.846135833729179723` | `664,238.846135833729179723` | `0` |
| 3 | 2961 | `209,403.614623511257932459` | `209,403.614623511257932459` | `0` |
| 4 | 2962 | `153,707.752122666823471823` | `153,707.752122666823471823` | `0` |
| 5 | 2963 | `100,767.333781936207162626` | `100,767.333781936207162626` | `0` |
| 6 | 2964 | `250,548.743672737876393485` | `250,548.743672737876393485` | `0` |
| 7 | 2965 | `110,345.975162145795330103` | `110,345.975162145795330103` | `0` |
| 8 | 2966 | `57,025.440936901990087075` | `57,025.440936901990087075` | `0` |
| 9 | 2967 | `313,937.628443917140612864` | `313,937.628443917140612864` | `0` |
| 10 | 2968 | `118,771.859125969424732423` | `118,771.859125969424732423` | `0` |
| 11 | 2969 | `84,636.945887733528635367` | `84,636.945887733528635367` | `0` |
| 12 | 2970 | `94,288.315957664625304466` | `17,830.242324006176308194` | `+76,458.073633658448996272` |
| 13 | 2971 | `28,712.054315000040526622` | `1,095.847021582728972155` | `+27,616.207293417311554467` |
| 14 | 2972 | `79,770.497124983521284525` | `188,789.207373304459889881` | `-109,018.710248320938605356` |
| 15 | 2973 | `296,807.215009168667190690` | `296,245.303780206715445082` | `+561.911228961951745608` |
| 16 | 2974 | `203,159.631621666622758925` | `112,361.738381127098977475` | `+90,797.893240539523781450` |

11 个 residue(1–11)完全对平,漂移只集中在 0、12、13、14、15、16 这 6 个槽位。

差额合计与总量关系:

```
sum(diff)                              = -151,340.848035072441735182
内部账本总额 − Convex 物理总额           =      -3,173.000000000000000000
两者之差                                =     148,167.848035072441735182
```

`148,167.848035072441735182` 就是第一张表里那笔已到期未处理的用户债权:它是要以 CVX 兑付的负债,不属于「还锁在 Convex 里的本金需求」,所以不进入逐槽需求,但计入内部账本总额。

这张表把 hardcode 的每一步都对上了:residue 0 的盈余正好是 `DRIFT_MOD_16`(2838 的本金在 epoch 2839 被重锁,`2839 % 17 = 0`);residue 14 的盈余正好是 `DRIFT_MOD_12 + DRIFT_MOD_13`(2817、2818 的本金在 epoch 2819 一起被重锁,`2819 % 17 = 14`);residue 12/13 的缺口就是 2970/2971 两周要归还的数额;residue 13 的缺口已被 admin 的 `3,173` 物理垫上,所以只差 `27,616.207293417311554467`。

## 5. 逐周模拟(从当前区块起)

[`06-weekly-sim.ts`](../test/fork/clever/pr278/06-weekly-sim.ts):fork 到区块 `25924517` → 部署 PR implementation → `ProxyAdmin.upgrade()` → epoch 2957…2975 每周一次 `processUnlockableCVX()`。

19 次调用全部成功。gas:epoch 2957 `236,665`,epoch 2958 `321,237`,其余各周 `274k–300k`。`totalLockedGlobal` 全程不变,`_distribute` 的奖励分配基数因此不受迁移影响([L1121-L1125](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L1121-L1125))。

`netBorrow`(= `totalUnlockedGlobal` − 用户可提额聚合,同时等于内部账本减 Convex 物理额):

| epoch | 本期动作 | 处理后 netBorrow |
|---|---|---|
| 2957 | `pendingUnlocked[2957]` 并入 `[2838]` 并清零,当周到期的 `112,087.541533595236886262` 在 residue 16 原位重锁 | 尚未建立(物理仍多出 `3,173`) |
| 2958 | 合并槽位注入 `pendingUnlocked[2958]`,归还 admin `3,173` | `104,074.280927075760550739` |
| 2959–2969 | 无 hardcode 变化 | `104,074.280927075760550739` |
| 2970 | 回填 residue 12 | `27,616.207293417311554467` |
| 2971 | 回填 residue 13 | `0` |
| 2972 | 从 residue 14 的盈余中截留 `109,018.710248320938605356` | `109,018.710248320938605356` |
| 2973 | 回填 residue 15 | `108,456.799019358986859748` |
| 2974 | 回填 residue 16 | `17,658.905778819463078298` |
| 2975 | 回填 residue 0 | `0` |

epoch 2957 调用后,`112,087.541533595236886262 CVX` 进入到期时间为 epoch 2974 的 tranche(`2974 % 17 = 16`),Convex `unlockable` 归零。owner 在 epoch 2958 收到的 CVX 增量精确为 `3,173.000000000000000000`。

epoch 2975 终局:

```
totalLockedGlobal        = 3,131,697.271990648911166696
totalPendingUnlockGlobal = 0
totalUnlockedGlobal      = 246,569.350232224123289803
totalCVXInPool           = 246,569.350232224123289803
用户可提额聚合            = 246,569.350232224123289803
Convex 物理总额           = 3,131,697.271990648911166696
17 个 residue 的差额       = 全部为 0
```

其中 residue 16(epoch 2991)`203,159.631621666622758925`、residue 0(epoch 2992)`218,801.300076976044019010`,与升级前的内部需求完全相同——这两个槽位的需求在整个迁移过程中没有被改动,只是把物理本金搬回了正确的周次。

## 6. 提款压力测试

[`09-withdrawal-pressure.ts`](../test/fork/clever/pr278/09-withdrawal-pressure.ts):epoch 2958 起,每周处理完立刻让当周所有有可提额的历史用户调用 `withdrawUnlocked()`。

```
成功提款 125 笔,失败 0 笔,合计 246,569.350232224123289803 CVX
epoch 2958 当周一次性提出 225,220.626429344806974573 CVX(102 个地址)
终局 totalUnlockedGlobal = 0,totalCVXInPool = 0,内部与物理差额 = 0
```

受影响账户 `0xb828a33af42ab2e8908dfa8c2470850db7e4fd2a` 的可提额是 `158,982.352179694127953141 CVX`(当前 `totalUnlockedGlobal` 只有 `77,052.778394272365239391`,所以现在提款必然回滚),epoch 2958 处理完成后可以一次全额提出。

这轮测试里,PR 新增的 reward pool 取款分支([L751-L753](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L751-L753))被真实触发了两次:

```
epoch 2970  relock 时从 reward pool 取出 34,026.015422000580637045 CVX
epoch 2971  relock 时从 reward pool 取出 25,640.814884436910832039 CVX
```

原因是用户提款会把直接余额掏空(`withdrawUnlocked()` 缺口部分从 reward pool 补,补完直接余额正好为 `0`,见 [L443-L449](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L443-L449))。以 epoch 2970 为例:

```
调用前直接余额                       =  42,432.058211657868359227
processExpiredLocks 取回 residue 12   =  17,830.242324006176308194
                                        --------------------------
此时直接余额                         =  60,262.300535664044667421
本周要 relock 的量(含 _extraCVX)     =  94,288.315957664625304466
缺口(实测从 reward pool 取出的量)     =  34,026.015422000580637045
```

去掉这三行,`lock()` 会因直接余额不足回滚。在无人提款的干净路径上,直接余额一直充裕,这个分支一次都不会触发;PR 自带的 `fork_test2` 用 `hardhat_setStorageAt` 把 `totalUnlockedGlobal` 置零来构造触发条件([fork_test2.ts:L84-L91](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/test/clever/fork/fork_test2.ts#L84-L91))。

## 7. PR 自带测试的覆盖边界

`fork_test1` / `fork_test2` 在其锁定的区块 `25902896` 上运行并通过(本机 31 秒)。两者锁定区块([fork_test1.ts:L10](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/test/clever/fork/fork_test1.ts#L10))并硬编码期望值([L21-L118](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/test/clever/fork/fork_test1.ts#L21-L118)),作为确定性回归测试是成立的,会一直可复现。

它们覆盖的是锁定区块那一刻的状态。把 `fork_test1` 的区块换成 `25924517` 后第一条断言即失败:

```
expected 169516571837951758050412 to equal 168974130879801758050412
```

差额 `542.440958150000000000 CVX` 来自锁定区块之后一位用户新发起的 `unlock()`,`totalPendingUnlockGlobal` 是随用户行为变动的量。修复逻辑本身对此稳健(第 5 节的逐周模拟就跑在这个新状态上,终局仍然对平)。因此上线当天的 pre-flight 需要另跑一次读取实时 pre-state 的模拟([`06-weekly-sim.ts`](../test/fork/clever/pr278/06-weekly-sim.ts)),不能用锁定区块的测试代替。

## 8. 负面场景测试结果

这套 hardcode 是一次性、严格逐 epoch 的状态机,设计上就要求每一周按时执行。下面这些场景测的是「不按要求做会怎样」,用来量化各条前置条件的代价,不是代码缺陷。

| 场景 | 结果 | 关键数字 |
|---|---|---|
| 漏 epoch 2957,从 2958 起逐周执行 | 2958–2973 全部成功,**epoch 2974 回滚** `SafeMath: subtraction overflow` | 该周要扣 `232,724.884692421166391761`,当时 `totalUnlockedGlobal` 只有 `213,099.157799701467539240` |
| 漏掉整个 epoch 2958 | 2959–2970 成功,**epoch 2971 回滚** `SafeMath: subtraction overflow` | 代价晚 13 周显形 |
| 只漏 hardcode 周 2972,其余全做 | **19 次调用零回滚**,终局账目错 | `totalUnlockedGlobal` 比用户可提额聚合少 `109,018.720248320938605356` |
| epoch 2958 前直接余额被单笔提款清零 | 当周调用回滚 `ERC20: transfer amount exceeds balance` | 触发门槛:任一笔提款 > `15,410.555678854473047879` |
| 上述情形下,批次内固定补 `3,173` | 调用成功,且抗抢跑 | admin CVX 净变化 `0`,终局仅 residue 0 留 `-3,173` |
| 同一 epoch 内第二次调用 | Convex 侧回滚 `no exp locks` | 分支不可能一周执行两次,[L762](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L762) 的注释成立 |
| 升级前的实现在 epoch 2957 调用 | 回滚 `insufficient unlocked CVX` | `112,087.54 < pendingUnlocked[2957] = 141,926.99`,keeper bot 的自动调用烧不掉这个窗口 |

三条需要展开的:

### 8.1 漏 epoch 2957 的失效点在 2974

`pendingUnlocked[2838]` 没有经过 2957 的合并,2974 分支([L807-L808](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L807-L808))算出的扣减额比正常路径的 `90,797.893240539523781450` 多出 `141,926.991451881642610311`:

```
epoch 2974 时 totalUnlockedGlobal                     = 213,099.157799701467539240
pendingUnlocked[2838](未合并,仍是历史值)             =   4,469.427261945621070254
该分支要扣的 DRIFT_MOD_16 − [2838] − DRIFT_MOD_15      = 232,724.884692421166391761
```

中间 16 周表面全部正常。

### 8.2 epoch 2958 的调用依赖直接余额不少于 3,173 CVX

`_fixLockDrift(2958)` 在 `processExpiredLocks()` 与 reward pool 补流动性之前就执行 `safeTransfer(owner(), 3_173e18)`([L784](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L784);`_extraCVX` 与 `processExpiredLocks` 在 [L729-L735](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L729-L735)),只能用 Locker 当时的直接余额。

当前直接余额 `15,410.555678854473047879`,余量 `12,237.555678854473047879`。`withdrawUnlocked()` 在直接余额不足时只补齐缺口([L443-L449](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L443-L449)),补完直接余额恰好归零——任一笔超过当时直接余额的提款都会把它清成 `0`。当前 102 个持有可提额的地址里,`0xf60240e419bb0a3e9d8527e5b045f86dcdd6ce44` 的 `15,451.174919 CVX` 单笔就够:

```
epoch 2957 调用后           direct = 15,410.555678854473047879
0xf60240… 提走 15,451.174919 → direct = 0
epoch 2958 processUnlockableCVX() → 回滚 'ERC20: transfer amount exceeds balance'
```

epoch 2957 与 2958 两次调用之间隔着整整一周,这段时间的提款行为不在运营方控制之内。回滚本身是原子的、状态不变、当周可重试;漏掉整周才会走到上表第二行的结果。

**兜底手段**:备好 `3,173 CVX`,在同一个 Safe batch 里先转给 Locker 再调用。实测在抢跑者已清零直接余额的情况下,批次里固定转 `3,173` 仍然让调用成功。取固定值的原因是抗抢跑——按签名时刻算的「精确缺口」会被执行前的一笔提款打掉。

**兜底的代价是 admin 还款这次不算数**:

```
epoch 2958 调用成功
admin 的 CVX 净变化               = 0.000000000000000000
epoch 2975 终局 totalCVXInPool     = 用户实际可提额聚合(逐位相等)
epoch 2975 终局 内部 − 物理        = -3,173.000000000000000000
17 个 residue 里差额非零的只有      = residue 0: -3,173.000000000000000000
```

补进去的 `3,173` 被 `_extraCVX` 算作盈余重新锁进 Convex,owner 同额收到,admin 净额为零。终局的经济含义等价于这次没做 admin 还款:用户债权仍然足额背书(`totalCVXInPool` 与用户实际可提额逐位相等),16 个 residue 精确对平,residue 0 保留 `3,173 CVX` 的协议盈余——和今天链上的状态相同,仍在 Convex 里为全体锁仓者产生收益。没有人损失,不影响偿付能力。

现有代码里没有权限函数能把 reward pool 的 CVX 搬回直接余额(`withdrawManualSwapRewardTokens` 只处理 `manualSwapRewardToken`;`_distribute` 是往 reward pool 里存,见 [L1133-L1145](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L1133-L1145)),所以直接余额归零后只能靠外部转入。

### 8.3 漏 hardcode 周不回滚,只体现在终局账目上

只跳过 2972 这一周,19 次调用没有任何一次回滚,终局:

```
totalUnlockedGlobal        = 137,550.629983903184684447
用户可提额聚合              = 246,569.350232224123289803
缺口                        = 109,018.720248320938605356
内部账本 − Convex 物理额     = -109,018.710248320938605356
```

本应留作提款准备金的 `109,018.71 CVX` 被锁进了 Convex,`totalUnlockedGlobal` 相对用户账本再次出现缺口,和这次要修的故障同一类型、同一量级。资金在 Convex 里没有丢,但要拿回来需要再做一次迁移。

因此 `processUnlockableCVX()` 返回成功不足以说明账务正确,2970–2975 每一周都要另外核对当周处理后的 `netBorrow` 是否精确等于第 5 节表格里的数值。

### 8.4 迁移期间不能清理的存储槽位

epoch 2957 只清零 `[2957]`,把值并入 `[2838]`([L772-L773](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L772-L773));`[2838]` 此后一直保持 `146,396.418713827263680565`,被 2974、2975 两个分支再次读取([L807](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L807)、[L813](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L813));`[2817]`、`[2818]` 同样被 2970、2971 读取。这三个槽位在迁移期间不能做任何清理。

代码层面正常业务不会改动它们:`unlock()` 只写未来 epoch、`processUnlockableCVX()` 只清当周槽位。epoch 2975 之后它们仍分别留有 `209.189203791910235264`、`1,562.240117453267819353`、`146,396.418713827263680565`,不影响经济账务。

## 9. 发现的问题

按代码缺陷的标准衡量,本次复核没有发现会造成资金损失、越权或账务不可恢复的缺陷。以下两项是交付物层面需要明确接受的:

### 9.1 `initialize()` 被注释掉

[L174-L202](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L174-L202) 整段注释,这个 implementation 只能用于已初始化的主网代理,新部署路径失效。调用 `initialize` 的 `test/clever/CLeverCVXLocker.spec.ts` 在 `main` 上就已经因为 ethers v5 写法(`ethers.utils.parseEther`)跑不起来,所以不构成新增的 CI 回归。迁移完成后应升级到恢复该函数的长期版本。

### 9.2 迁移全程无事件,`netBorrow` 无链上真值

`_fixLockDrift` 不发任何事件,`netBorrow` 只存在于注释里,链下只能靠内部交易 trace 和常量表重建迁移进度。加事件或加 `netBorrow` 的 view 函数都需要先腾字节码空间:当前 `24,511 / 24,576`,余 `65` 字节。

`setConvexGaugeDelegate` 一类函数在这个 commit 里不存在(`delegate()`、`commitUserSurrogate()` 在 `main` 上就已注释掉,只保留了 `setConvexVotingSurrogate`,见 [L825-L831](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L825-L831)),要取消 gauge delegate 需要另发一个临时 implementation。

## 10. 稳健性上可以确认的几点

- **`require(_unlocked >= _pending)` 不会因用户行为失败。** hardcode 往 `pendingUnlocked[2972]` 注入 `109,018.710248320938605356`([L797-L798](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L797-L798));用户在 2955–2971 期间最多还能往这个槽位追加自己 `epochLocked[14]` 的全部,即 `79,770.497124983521284525`。两者之和 `188,789.207373304459889881` 正好等于 residue 14 的物理 tranche。epoch 2974 同理:`pendingUnlocked[2974]` 的上限是 residue 16 的内部需求 `203,159.631621666622758925`,等于该周到期的物理量。最坏情况下取等号,`require` 仍成立。
- **`totalUnlockedGlobal.sub(...)` 不会因用户提款而下溢。** 2970/2971/2973/2974/2975 每次扣减的数额都不超过当时的 `netBorrow`,而 `totalUnlockedGlobal = 用户可提额聚合 + netBorrow ≥ netBorrow`,提款只会消耗前一项。
- **迁移期间的正常存取款不破坏对账。** epoch 2957–2974 之间的 `deposit()` 同时增加内部需求和同 residue 的物理量([L351-L356](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L351-L356));`unlock()` 写入的未来槽位由各周正常流程处理。本次模拟本身就跑在含有一笔新增 `542.44 CVX` unlock 的状态上,终局仍然对平。
- **hardcode 只固定了已经冻结的量,还会变的量都是运行时读的。** `DRIFT_MOD_*` 是 2752/2817/2818/2838 四个已过去 epoch 的到期额,不可能再变;`pendingUnlocked[2838]`、`[2817]`、`[2818]`、`[2957]` 全部在调用时从 storage 读取,往 `pendingUnlocked[2958]`/`[2972]` 注入时用的是 `.add()`([L778-L779](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L778-L779)、[L797-L798](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L797-L798)),因此用户在迁移期间继续 `unlock()` 不会破坏这些分支。`pendingUnlocked[2957]` 在当前 epoch 已经冻结(`unlock()` 只写未来 epoch),这是 epoch 2957 那次合并可以依赖它的前提。
- **`_distribute` 的 reward pool 存款不会抢走 `3,173` 转账所需的直接余额。** `stakePercentage = 80%`、`stakeThreshold = 10 CVX`,而当前已质押 `61,642.222715417892191512`、直接余额 `15,410.555678854473047879`,目标质押量低于已质押量,`harvest()` 不会再往 reward pool 存([L1138](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L1138));epoch 2958 处理后直接余额升到 `267,652.68` 一档时,`harvest()` 会存入约 20 万,剩余仍远高于 `3,173`。

## 11. 奖励补偿基数

按各周处理后的 `netBorrow` 累加(epoch 2958–2975):

```
104,074.280927075760550739 × 12 周  (2958–2969)
+ 27,616.207293417311554467          (2970)
+          0                          (2971)
+ 109,018.710248320938605356          (2972)
+ 108,456.799019358986859748          (2973)
+  17,658.905778819463078298          (2974)
+          0                          (2975)
= 1,511,641.993464825826706737 CVX-weeks
```

这部分 CVX 在被截留期间是 Locker 的直接余额或 reward pool 仓位,不进入 vlCVX,所以缺失的是 vlCVX 侧的收益;`stakePercentage = 80%` 意味着其中一部分会因 `harvest()` 而在 CVXRewardPool 里产生收益,实际补偿口径应扣掉这部分或明确按整周全额补偿。

## 12. 上线前核对清单

**epoch 2957(截止 `2026-09-10 08:00` 北京时间)**——单笔原子 Safe batch:

1. `ProxyAdmin.upgrade(0x96C68D86…4154, <PR #278 implementation>)`
2. `CLeverCVXLocker.processUnlockableCVX()`

执行前先按当天最新区块重跑一次 [`06-weekly-sim.ts`](../test/fork/clever/pr278/06-weekly-sim.ts)(它读实时 pre-state,不依赖锁定区块),再核对以下读数([`01-chain-state.mjs`](../test/fork/clever/pr278/01-chain-state.mjs)):

```
currentEpoch                  == 2957
pendingUnlocked[2838]         == 4,469.427261945621070254
pendingUnlocked[2957]         == 141,926.991451881642610311
pendingUnlocked[2817]         == 209.189203791910235264
pendingUnlocked[2818]         == 1,562.240117453267819353
pendingUnlocked[2752]         == 0
Convex unlockable             == 112,087.541533595236886262
implementation deployed keccak == 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
```

执行后立即核对:`pendingUnlocked[2957] == 0`、`pendingUnlocked[2838] == 146,396.418713827263680565`、Convex `unlockable == 0`、新 tranche 的 `unlockTime / 604800 == 2974`。这一步不修复用户提款,`0xB828…Fd2a` 要等 epoch 2958 之后。

**epoch 2958 之前**:准备 8.2 的兜底——手上备好 `3,173 CVX`,并预先准备好一个「转 `3,173` 给 Locker + `processUnlockableCVX()`」的 Safe batch 作为 plan B。这一周必须有人盯,漏掉整周会在 epoch 2971 崩(见第 8 节)。

**epoch 2958**:先读直接余额,尽早执行(直接余额不足 `3,173` 时走 plan B);执行后核对 `pendingUnlocked[2958] == 0`、`totalCVXInPool == totalUnlockedGlobal`、`netBorrow == 104,074.280927075760550739`、`0xB828…Fd2a` 的 `withdrawUnlocked()` 模拟成功。

**epoch 2959–2975**:每周执行,并按第 5 节表格核对当周处理后的 `netBorrow`;2970–2975 是 hardcode 周,漏一周不会回滚,但会留下缺口(见 8.3)。

**epoch 2975 之后**:确认 `netBorrow == 0`、三项 global 与用户聚合逐项相等、17 个 residue 差额全为 `0`,再升级到去掉一次性 hardcode 的长期版本。

## 13. 已部署 implementation 的复验

上线用的 implementation 已部署到主网。本节的全部数据都取自该地址,不再使用本地编译产物。

### 13.1 身份与字节码

```
address        0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
部署交易        0x31cbe9452d9b0025bdbe2d5e0ef98dd78f6f09787fae40b789b1841f73a825a0
部署区块        25931637   2026-09-08T09:04:47Z
部署者          0x83fC663840aaebCc97031d9fE2FEaF9b707Cb4BE   (EOA)
gasUsed        5,348,223

deployed bytecode size    = 24,511 bytes
deployed bytecode keccak  = 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
第 1 节记录的期望 keccak    = 0xc84c87dcb24aa0afcda4ae018391c163f1f2e6e291c7c33f657250a75df50d52
```

逐字节相同。Etherscan 已验证为 Exact Match,合约名 `CLeverCVXLocker`,`v0.7.6+commit.7338295f`,optimizer 200 runs——与第 1 节记录的编译设置一致。5 个 `DRIFT_MOD_*` 常量的立即数都能在字节码中定位到。

字节码同一意味着第 5–8、10 节的 EVM 层结论对这份部署原样成立;下面重跑的意义在于覆盖**基准区块之后的链上状态变化**,以及验证升级路径本身。

### 13.2 implementation 自身的状态

```
owner()                = 0x0000000000000000000000000000000000000000
isKeeper(Safe / bot)   = false / false
clevCVX / furnace      = 0x0000000000000000000000000000000000000000
CVX 余额               = 0
源码中 selfdestruct / delegatecall = 不存在
```

`initialize()` 被注释掉(9.1)在这里是安全的一面:没有人能初始化这个 implementation 去占据 `owner`,因此其上所有 `onlyOwner` / `onlyKeeper` 函数都无人可调。合约内没有 `selfdestruct`,不存在把 implementation 销毁、连带打死代理的路径;唯一的任意 `.call` 点由 `approvedTargets` 白名单管控,而该白名单在 implementation 自身的存储里是空的。

### 13.3 复验用的链上基准

区块 `25932658`,仍处于 epoch 2957。与第 1 节基准区块 `25924517` 相比,只有一项变化:

```
totalLockedGlobal   3,131,764.415383843553497959   (+67.143393194642331263,一笔新 deposit)
其余全部未变:totalPendingUnlockGlobal、totalUnlockedGlobal、totalCVXInPool、
            直接余额、reward pool 余额、Convex unlockable、
            pendingUnlocked[2817] / [2818] / [2838] / [2957] / [2752]
```

hardcode 依赖的量一个都没动。新增的 deposit 落在 epoch 2957(residue 16),按第 10 节的性质它同时增加 residue 16 的内部需求和同一 tranche 的物理量——下面的逐槽对账实测确认了这一点。

### 13.4 升级路径

fork 到区块 `25932658`,以 Safe 身份通过 ProxyAdmin 升级:

```
升级前 proxy implementation  0xDFC1F72D5604020463318ff256433eca02B355d2
升级后 proxy implementation  0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534
isKeeper(bot) = true    isKeeper(Safe) = true    owner = 0xFC08757c...0C5E
```

### 13.5 逐周执行与全量对账

epoch 2957→2975 共 19 次 `processUnlockableCVX()` 全部成功,gas 与 `netBorrow` 轨迹与第 5 节逐位相同(2957 `236,665`,2958 `321,237`)。按区块 `25932658` 重新读取全部 484 个用户后:

```
升级前   用户 locked = global locked,差 = 0            (已含那笔新 deposit)
         17 槽差额非零项与第 4 节表格完全相同(0 / 12 / 13 / 14 / 15 / 16 六项)

epoch 2958 后  netBorrow = 104,074.280927075760550739
               global pending − 用户未来 pending = 0

epoch 2975 终局  netBorrow = 0
                 totalCVXInPool − 用户可提额 = 0
                 内部账本 − Convex 物理额 = 0
                 17 槽差额非零项 = 无

owner 在 epoch 2958 收到 = 3,173.000000000000000000
奖励补偿基数 = 1,511,641.993464825826706737 CVX-weeks
```

### 13.6 提款压力

2958 起每周处理完立刻让当周全部有可提额的账户提款:

```
125 笔提款成功,0 笔失败,合计 246,569.350232224123289803 CVX
受影响账户 0xB828…Fd2a 在 epoch 2958 一次提出 158,982.352179694127953141 CVX
epoch 2958 当周 102 笔、225,220.626429344806974573 CVX
reward pool 取款分支触发于 epoch 2970(34,026.015422000580637045)与 2971(25,640.814884436910832039)
终局 totalUnlockedGlobal = 0,totalCVXInPool = 0,内部 − 物理 = 0
```

epoch 2970/2971 两周的直接余额为 `0`,全靠 [L751-L753](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/680b0c9b453a6c1232901d75cd49c3dc0592df6d/contracts/clever/CLeverCVXLocker.sol#L751-L753) 从 reward pool 补齐才能 relock——第 6 节的结论在部署字节码上确认。

### 13.7 第 8 节全部负面场景的复现

| 场景 | 结果 | 关键数字 |
|---|---|---|
| 升级前的实现在 epoch 2957 调用 | 回滚 `insufficient unlocked CVX` | keeper bot 烧不掉这个窗口 |
| 同一 epoch 内第二次调用 | 回滚 `no exp locks` | 第 1 次 gas `236,665` |
| 跳过 epoch 2957 | **epoch 2974 回滚** `SafeMath: subtraction overflow` | 当时 `totalUnlockedGlobal` = `213,099.157799701467539240`;该分支要扣 `232,724.884692421166391761` |
| 只跳过 hardcode 周 2972 | **19 次调用零回滚**,终局账目错 | `totalUnlockedGlobal` 比用户可提额少 `109,018.720248320938605356` |
| 2957 后单笔提款清零直接余额 | epoch 2958 回滚 `ERC20: transfer amount exceeds balance` | `0xf60240…ce44` 提走 `15,451.174919`,直接余额 `15,410.555678854473047879` → `0` |
| 上述情形整周无人补款 | **epoch 2971 回滚** `SafeMath: subtraction overflow` | 代价晚 13 周显形 |
| 批次内固定补 `3,173` | 2958–2975 全部成功 | admin CVX 净变化 `0`;终局内部−物理 `-3,173`,仅 residue 0 不平 |
| 抢跑清零后仍固定补 `3,173` | epoch 2958 成功 | 固定值抗抢跑成立 |

八项结果与第 8 节逐位一致。

### 13.8 本节所用脚本

[`13-verify-deployed-impl.ts`](../test/fork/clever/pr278/13-verify-deployed-impl.ts)(升级 + 逐周)、[`14-refresh-snapshot.mjs`](../test/fork/clever/pr278/14-refresh-snapshot.mjs)(按当前区块刷新用户快照)、[`15-reconcile-latest.mjs`](../test/fork/clever/pr278/15-reconcile-latest.mjs)(全量对账)、[`16-withdrawals-deployed.ts`](../test/fork/clever/pr278/16-withdrawals-deployed.ts)(提款压力)、[`17-scenarios-deployed.ts`](../test/fork/clever/pr278/17-scenarios-deployed.ts)(全部负面场景)。

这五个脚本都以「升级到部署地址 + 手写 ABI」的方式工作,不引用仓库里的合约源码,因此在任何分支上运行都测的是链上那份字节码。`07`–`12` 则是用 `getContractFactory` 本地编译部署的,必须在 `fix/clever-lock-drift` 分支上运行才有意义。

## 附:复现命令

```bash
export RPC=https://eth-mainnet.public.blastapi.io
export HARDHAT_FORK_URL=https://eth-mainnet.public.blastapi.io

# 链上状态 + pendingUnlocked 全区间扫描
node test/fork/clever/pr278/01-chain-state.mjs

# 用户集合(Deposit 事件全史)/ Convex 事件全史 / 常量核对 / 用户仓位
node test/fork/clever/pr278/02-user-list.mjs
node test/fork/clever/pr278/03-convex-history.mjs
node test/fork/clever/pr278/04-drift-constants.mjs
node test/fork/clever/pr278/05-user-positions.mjs

# 逐周模拟 / 负面场景 / 活性场景 / 提款压力 / 漏周场景(需切到 PR 分支)
npx hardhat run test/fork/clever/pr278/06-weekly-sim.ts
SCEN=AFB npx hardhat run test/fork/clever/pr278/07-negative.ts
SCEN=E   npx hardhat run test/fork/clever/pr278/08-liveness.ts
SCEN=D1  npx hardhat run test/fork/clever/pr278/09-withdrawal-pressure.ts
SCEN=E2  npx hardhat run test/fork/clever/pr278/09-withdrawal-pressure.ts
npx hardhat run test/fork/clever/pr278/11-missed-epochs.ts
npx hardhat run test/fork/clever/pr278/12-admin-transfer-severity.ts

# 全用户 + 逐槽对账
node test/fork/clever/pr278/10-reconciliation.mjs

# 对主网已部署 implementation 的复验(第 13 节,不依赖仓库合约源码)
node  test/fork/clever/pr278/14-refresh-snapshot.mjs
FORK_BLOCK=<刷新得到的区块> npx hardhat run test/fork/clever/pr278/13-verify-deployed-impl.ts
node  test/fork/clever/pr278/15-reconcile-latest.mjs
FORK_BLOCK=<同上> npx hardhat run test/fork/clever/pr278/16-withdrawals-deployed.ts
FORK_BLOCK=<同上> npx hardhat run test/fork/clever/pr278/17-scenarios-deployed.ts
```

各场景对应关系:[`07`](../test/fork/clever/pr278/07-negative.ts) 的 `A` = 升级前的实现在 epoch 2957 调用、`F` = 同 epoch 二次调用、`B` = 跳过 2957;[`08`](../test/fork/clever/pr278/08-liveness.ts) 的 `E` = 单笔提款清零直接余额后的 epoch 2958;[`09`](../test/fork/clever/pr278/09-withdrawal-pressure.ts) 的 `D1` = 逐周全额提款压力、`E2` = 外部补款后跑到 2975;[`11`](../test/fork/clever/pr278/11-missed-epochs.ts) = 跳过 2957 与跳过 2972 两条漏周路径;[`12`](../test/fork/clever/pr278/12-admin-transfer-severity.ts) 的 `F1` = 漏掉整个 epoch 2958、`F2` = admin 固定补款的终局账目、`F3` = 抢跑下固定补款是否仍能通过。

`02`、`03`、`04`、`05` 走 `https://mainnet.gateway.tenderly.co`(归档 `eth_getLogs` 与历史 `eth_call`);[`data/`](../test/fork/clever/pr278/data/) 下已存有本次运行的全部中间产物。
