# CLever CVX Locker — Convex 链上投票迁移 — 测试报告

> 作者:Gilbert
> 状态:v1.0(2026-07-29)
> 测试脚本:[`test/fork/clever/CLeverConvexVotingMigration.spec.ts`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-clever-vlcvx-gz/test/fork/clever/CLeverConvexVotingMigration.spec.ts)(36 个用例)
> 分支:[`feat/test-clever-vlcvx-gz`](https://github.com/AladdinDAO/aladdin-v3-contracts/tree/feat/test-clever-vlcvx-gz)(基于 `feat/vlcvx-migration` / [PR #274](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/274))

测试全程在本地 Hardhat fork 上进行,impersonate 真实的 CLever 多签和 Convex Core 操作员地址,直接驱动已部署在主网上的合约,不做任何 mock;所有涉及 Convex 侧合约的结论均对照其真实开源代码([`convex-eth/voting`](https://github.com/convex-eth/voting/tree/main/src))逐行核实,关键状态均对主网当前实时数据发起 `eth_call` 复核。

---

## 结论:测试通过,可以上线

**36/36 断言全部通过。合约层面的迁移逻辑(升级、授权、DAO/Gauge 投票、撤销更换、回滚)行为符合预期,没有发现阻碍上线的问题。** 本次发现的几个点(第 3 节)都是需要知道、但不构成上线阻塞的运行细节,详见各节说明。整条生产流程(升级→设置 surrogate→投票→撤销→更换→回滚)已完整走过真实 Safe 的 6-of-9 签名执行(第 5 节),不是只测了其中一步。

---

## 1. 测试范围概览

- 在真实 mainnet fork 上完整重放了这次迁移:从合约当前"已部署新实现、尚未升级"的状态开始,执行升级、设置 surrogate、DAO 投票、Gauge 投票、撤销/更换 surrogate、权重精度核对、遗留委托核查、业务回归、回滚,共 **36/36 断言全部通过**。
- 在这之上,把整条生产流程(升级 → 设置 surrogate → 投票 → 撤销 → 更换 → 回滚)完整地又用真实 Safe 的 6-of-9 签名执行机制跑了一遍,而不是只用 impersonate 直接调用(第 5 节)。
- 验证了 PR 的核心授权模型:只有 owner 能设置 surrogate;设置之后,只有 Locker 自己或被登记的 surrogate 地址能代表 Locker 投票,连 owner 多签自己都无法绕过这一限制。
- Gauge 投票的合规校验只查一个可被延迟同步的缓存状态,不查 gauge 的实时存活状态(第 3.1 节),用 fork 上一个确定性、可重复执行的实例复现了这条路径。
- Locker 目前对 owner 多签仍有一笔历史 Gauge 委托,owner 可以直接用自己的账户、绕开 surrogate 机制,动用 Locker 的投票权重(第 3.2 节)。
- DAO 投票平台和 Gauge 投票平台的满权重精度不同(10,000 对 1,000,000,第 3.3 节)。
- 主网当前 `rewardTokens` 数组为空,直接调用 `rewardTokens(0)` 会 revert(第 3.4 节)。

---

## 2. 测试用例明细

### 方法

Locker 代理 [`0x96C68D8...4154`](https://etherscan.io/address/0x96C68D861aDa016Ed98c30C810879F9df7c64154) 目前仍指向旧实现,新实现 [`0xDFC1F72...55d2`](https://etherscan.io/address/0xDFC1F72D5604020463318ff256433eca02B355d2) 已部署在链上但尚未激活。测试脚本 fork 在链的最新高度(而不是固定历史区块),这样才能拿到一个当前真实处于投票窗口内的 DAO 提案,而不是自己伪造一个。

### 用例明细(36 个)

| # | 用例 | 为什么需要这个用例 | 测试了什么 | 最终状态 |
|---|---|---|---|---|
| 0.1 | 代理当前指向旧实现;新实现已部署但未激活 | 确认迁移当前所处的真实阶段,后续所有测试都建立在这个真实起点上,而不是假设的状态 | 读取 EIP-1967 implementation slot,比对旧/新实现地址;确认新实现已有字节码部署在链上 | 通过 |
| 0.2 | owner 是 CLever 多签(Locker 和 ProxyAdmin 都是) | 后续"非 owner 不能操作""owner 也不能绕过 surrogate"这两条权限断言都依赖这个前提先成立 | 分别读取 `locker.owner()`、`proxyAdmin.owner()` | 通过 |
| 0.3 | Locker 当前未注册任何 surrogate | 建立"升级前没有任何投票代理权限"的干净基线,避免后续断言受历史状态污染 | 查询 `SurrogateRegistry.surrogateInfo(locker)` | 通过 |
| 1.1 | 新实现字节码大小在 EIP-170 24,576 字节上限内 | 新增了 `setConvexVotingSurrogate` 等代码,必须确认没有把合约撑爆导致完全无法部署/升级 | 读取新实现 `eth_getCode` 长度,换算字节数并与上限比较 | 通过(24,139 字节,余量 437 字节) |
| 1.2 | 升级前对 `owner`/`totalLockedGlobal`/`totalDebtGlobal`/`clevCVX` 拍快照 | 为下一条"升级后状态不变"的断言提供比对基准 | 逐项读取并暂存这几个核心状态变量 | 通过 |
| 1.3 | `ProxyAdmin.upgrade` 切换 implementation slot | 确认多签真实能执行升级操作,且升级动作本身生效 | 调用 `proxyAdmin.upgrade(LOCKER, NEW_IMPL)`,复读 implementation slot | 通过 |
| 1.4 | 升级前后状态逐项比对,完全不变 | 这是最基本的"升级不能破坏用户资产记账"安全网,任何一项对不上都是严重问题 | 比对升级后 `owner`/`totalLockedGlobal`/`totalDebtGlobal`/`clevCVX` 与升级前快照 | 通过,逐项一致 |
| 2.1 | 非 owner 调用 `setConvexVotingSurrogate` 必须 revert | 这是新增函数的第一道权限闸门,必须先确认它真的挡住了非授权调用者 | 用未授权 EOA 调用该函数 | 通过,revert `Ownable: caller is not the owner` |
| 2.2 | owner 调用后,注册表记录的账户是 Locker 代理本身(不是 owner 自己) | 确认 `setConvexVotingSurrogate` 真正把 surrogate 登记在 Locker 名下,这是整个 surrogate 模型能成立的前提 | owner 调用该函数,检查事件参数和 `SurrogateRegistry.isSurrogate(voter, LOCKER)` | 通过 |
| 3.1 | 定位当前真实生效的 DAO 提案 | 后续的投票测试需要一个真实、当前处于投票窗口内的提案,而不是自己伪造一个不存在的提案 ID | 从 `proposalCount()-1` 向前遍历,找到 `startTime<=now<=endTime` 的提案 | 通过 |
| 3.2 | 未授权 EOA 不能代表 Locker 投 DAO 票 | 确认授权闸门在真实投票路径上真的生效,不是只在理论上存在 | 未授权 EOA 调用 `daoVote.vote(pid, LOCKER, ...)` | 通过,revert `NotSigner` |
| 3.3 | owner 多签本身也不是 surrogate,同样不能代投 | 这是最容易被误以为"owner 应该有特权"的地方,必须明确验证 owner 身份本身不构成投票授权 | owner 直接调用 `daoVote.vote(pid, LOCKER, ...)` | 通过,revert `NotSigner` |
| 3.4 | 被授权的 surrogate EOA 投票成功,链上记录的账户/名单是 Locker 不是这个 EOA | 这是整个迁移要达成的核心目标——第三方奖励平台按投票账户识别归属,必须确认归属方是 Locker | surrogate 投票后核对 `getVote(pid, LOCKER)`、`getVote(pid, voterEOA)`、`getVoterAtIndex` | 通过 |
| 4.1 | 创建一个仅在 fork 上生效的 Gauge 提案 | 主网 Gauge Vote Platform 当前没有提案,必须 impersonate 真实操作员自建一个才能测试投票路径 | impersonate Convex Core 调用 `createProposal` | 通过 |
| 4.2 | 未授权 EOA 不能代表 Locker 投 Gauge 票 | 和 DAO 投票同理,确认 Gauge 投票平台的授权闸门同样生效 | 未授权 EOA 调用 `gaugeVote.vote(LOCKER, ...)` | 通过,revert `NotSigner` |
| 4.3 | surrogate 对合法 gauge 投满权重,归属 Locker | 确认正向路径本身能走通,权重确实记到 Locker 名下 | surrogate 调用 `vote`,核对 `gaugeTotal` | 通过 |
| 4.4 | gauges/weights 数组长度不匹配 revert | 覆盖一个明显的入参校验分支,防止畸形调用被静默接受 | 传入长度不一致的数组 | 通过,revert `Mismatch` |
| 4.5 | 零权重条目 revert | 覆盖另一个入参校验分支 | 传入 `[0]` 权重 | 通过,revert `NoWeight` |
| 4.6 | 未注册的 gauge 地址 revert | 确认平台不会接受任意地址作为 gauge | 传入一个随意构造的地址 | 通过,revert `NotGauge` |
| 4.7 | **[live-executable proof]** 已被 kill 但仍缓存为"已注册"的 gauge,投票不会被拦截 | 这是本次测试发现的一个运行细节(见 3.1 节),用真实交易端到端复现这条路径 | 翻转一个真实 gauge 的 `is_killed` storage,确认 `isValidGauge` 变 false 但 `isRegisteredGauge` 仍是 true,再对它投票 | 通过,交易不 revert(复现成功) |
| 4.8 | 重复投票是替换,不是累加 | 确认同一 proposal 内改票不会导致权重被重复计算 | 对同一 gauge 连续投两次相同权重,比较前后总量 | 通过,总量不变(替换而非累加) |
| 5.1 | 撤销 surrogate(设为零地址)后旧 surrogate 立即失效 | 确认撤销操作是即时生效的,不存在"撤销后还能再投一次"的窗口 | owner 撤销后,旧 surrogate 再次尝试投票 | 通过,revert `NotSigner` |
| 5.2 | 设置新 surrogate 后,旧的保持失效、新的立即生效 | 确认更换流程干净,不会出现新旧两个地址同时有效 | 设置新 surrogate,核对 `isSurrogate` 状态并用新地址实际投票 | 通过 |
| 6.1 | DAO 和 Gauge 投票平台的 `max_weight()` 精度是否一致 | 这是本次测试发现的一个运行细节(见 3.3 节):两个平台如果精度不同,生产投票脚本很容易写错 | 分别读取两个已部署合约的 `max_weight()` 常量 | 通过(确认不相等:10,000 对 1,000,000) |
| 7.1 | Locker 当前是否对 owner 多签有生效中的 Gauge Delegation | 这是本次测试发现的另一个运行细节(见 3.2 节):这套委托和 surrogate 机制是两条独立的授权路径,必须先确认它当前是否真的生效 | 查询 `Delegation` 合约里 Locker 当前 epoch 的委托对象 | 通过,确认委托对象就是 owner 多签 |
| 7.2 | owner 能否直接用自己的账户、绕开 surrogate,动用 Locker 的委托权重投票 | 验证这条遗留授权路径是否真的可用,而不是名义上存在但实际走不通 | owner 直接调用 `gaugeVote.vote(ADMIN, ...)` | 通过,交易不 revert,且权重明显来自 Locker(owner 自身无持仓) |
| 7.3 | 新版 Locker 有没有任何函数能改掉这笔委托 | 确认这条遗留授权路径当前是否有办法被团队自己收回 | 构造 `Delegation.setDelegate(address)` 的调用数据直接发给 Locker 代理 | 通过,交易 revert(确认新版 Locker 没有对应函数) |
| 8.1 | 升级后 `deposit` 是否正常入账,记账不受影响 | 确认这次改动没有影响任何原有的核心业务路径 | 用真实 CVX 大户资金调用 `deposit`,比对 `totalLockedGlobal` 前后差值 | 通过 |
| 9.1 | 撤销 surrogate 后把代理降级回旧实现 | 确认出现问题时有真实可执行的回退路径,而不是"理论上能回滚" | 撤销 surrogate,调用 `proxyAdmin.upgrade` 切回旧实现,确认新函数消失、核心状态完好 | 通过 |
| 10.1 | ADMIN 是不是一个真实的多签,而不是普通 EOA | 后面要模拟真实签名流程,必须先确认这个地址真的是 Gnosis Safe,以及签名门槛是多少 | 读取 `getOwners()`、`getThreshold()` | 通过(9 个签名人,6-of-9 门槛) |
| 10.2 | 步骤 1/6:Safe 执行 `ProxyAdmin.upgrade(LOCKER, NEW_IMPL)` | 之前 0-9 全部测试都是直接 impersonate 多签地址发起调用,唯独升级这一步——最高风险的操作——还没有验证过真实 Safe 签名执行能否跑通 | impersonate 6 个真实签名人各自调用 `approveHash`,拼出签名,调用 Safe 自己的 `execTransaction` 执行升级 | 通过,implementation slot 切换成功 |
| 10.3 | 步骤 2/6:Safe 执行 `setConvexVotingSurrogate(VOTER_EOA)` | 验证设置 surrogate 这一步也能通过真实 Safe 签名执行,不只是被 impersonate 出来的假设 | 同上流程,目标换成 `setConvexVotingSurrogate` | 通过,surrogate 状态生效 |
| 10.4 | 步骤 3/6:被设置好的 surrogate(普通 EOA,不是多签)正常投票 | 确认 Safe 执行完设置之后,整条链路能继续走到投票这一步,不是断开的 | surrogate EOA 直接对当前生效的 DAO 提案投票 | 通过 |
| 10.5 | 步骤 4/6:Safe 执行 `setConvexVotingSurrogate(address(0))` 撤销 | 验证撤销这一步也走真实 Safe 签名执行 | 同上流程,参数换成零地址 | 通过,旧 surrogate 状态清零 |
| 10.6 | 步骤 5/6:Safe 执行 `setConvexVotingSurrogate(VOTER_EOA_2)` 更换 | 验证更换这一步也走真实 Safe 签名执行 | 同上流程,目标换成新地址 | 通过,新 surrogate 生效、旧的保持失效 |
| 10.7 | 步骤 6/6:Safe 执行 `ProxyAdmin.upgrade(LOCKER, OLD_IMPL)` 回滚 | 验证回滚这一步——同样是高风险操作——也能通过真实 Safe 签名执行完成,不是只能靠 impersonate | 同上流程,目标换成旧实现地址 | 通过,implementation slot 切回旧实现 |

运行方式:

```bash
HARDHAT_FORK_URL=https://eth-mainnet.public.blastapi.io \
npx hardhat test test/fork/clever/CLeverConvexVotingMigration.spec.ts --network hardhat
```

---

## 3. 运行细节与需要注意的点

以下几点都不影响本次上线,是这套 Convex 投票系统本身的运行细节,记录下来供后续运维参考。

### 3.1 Gauge 投票只校验"已注册"缓存,不校验"当前存活"状态

**现象**:Convex 的 [`GaugeVotePlatform._vote()`](https://github.com/convex-eth/voting/blob/main/src/GaugeVotePlatform.sol#L237-L318) 在接受一次投票前,只检查这个 gauge 是否在 `CurveGaugeRegistry` 里被标记为 `isRegisteredGauge`(L318:`if (!gaugeRegistry.isRegisteredGauge(_gauges[i])) revert NotGauge();`),从未检查过它的 `isValidGauge`(是否仍然存活、未被 Curve 官方 kill)。

**原理**([`CurveGaugeRegistry.sol`](https://github.com/convex-eth/voting/blob/main/src/CurveGaugeRegistry.sol)):这个注册表维护两套状态,含义完全不同。

- `isRegisteredGauge(gauge)`:查一个内部数组 `activeGaugeIndex`,这是一份缓存,只有在有人调用 `setGauge()` / `setGauges()`(权限不受限,任何人都能调)重新同步时才会更新。
- `isValidGauge(gauge)`:每次调用都实时向 Curve 原始 gauge 合约发起查询,读取它的 `is_killed()` 状态。

`GaugeVotePlatform._vote()` 的合规校验只用了前者,从未用过后者。也就是说:一个 gauge 一旦被缓存进"已注册"名单,就算 Curve 治理之后真的把它 kill 掉,只要没人重新调用 `setGauge()` 去同步这份缓存,它在 Convex 的投票系统里依然会被当作合法 gauge,继续接受投票权重。

**验证**(可完全重现,见测试文件 `[live-executable proof]` 用例):

1. 选定一个当前真实存活、且已被 Convex 注册表标记为 `isRegisteredGauge = true`、`isValidGauge = true` 的真实 Curve gauge([`0x512bC2A...5bFe8`](https://etherscan.io/address/0x512bC2AeE29F8E641f903B339D40947595A5bFe8))。
2. 直接修改这个 gauge 合约自身的 storage(slot 14,通过在一次性本地 fork 上逐槽扫描 `is_killed()` 找到),把它翻转为"已 kill"状态,模拟 Curve 官方治理真实执行了 kill 操作。
3. 复查:`is_killed()` 变为 `true`;`isValidGauge()` 正确实时跟随变为 `false`;但 `isRegisteredGauge()` 因为缓存没人同步,依然是 `true`。
4. 用一个已被 Locker 授权的 surrogate 地址,对这个"已死但仍注册"的 gauge 投出真实的投票交易 —— **交易不 revert,权重被正常接受**。

**现在的状态**:在主网当前状态下扫描 Curve 官方公开的已 kill gauge 列表(324 个),没有一个和 Convex 注册表里的"已注册"名单重合,这份缓存目前维护得比较及时。只要存在"Curve 刚 kill 一个 gauge、还没人去调 `setGauge()` 同步"这段时间差,这条路径就会被走到。

**是否影响上线**:不影响。这是 Convex 自己的投票系统([`GaugeVotePlatform`](https://github.com/convex-eth/voting/blob/main/src/GaugeVotePlatform.sol)/[`CurveGaugeRegistry`](https://github.com/convex-eth/voting/blob/main/src/CurveGaugeRegistry.sol))本身的运行机制,不是本次 PR 改动引入的,CLever 这边也没有能力去修改 Convex 的合约。列在这里是作为运维参考:如果发现某个 gauge 已经被 Curve kill 但 Convex 那边一直没人同步,可以主动调用不受权限限制的 `setGauge()` 去刷新缓存。

### 3.2 Locker 当前对 owner 多签仍有一笔生效中的历史 Gauge 委托,新版合约没有函数能改掉它

**现象**:[`GaugeVotePlatform`](https://github.com/convex-eth/voting/blob/main/src/GaugeVotePlatform.sol#L31) 在部署时就绑定了一个独立的 [`Delegation`](https://github.com/convex-eth/voting/blob/main/src/Delegation.sol) 合约(构造函数 L482 传入,存成 immutable),这是一套完全独立于 `SurrogateRegistry` 的授权体系。直接查询主网当前状态确认:Locker 目前在这个 `Delegation` 合约里,当前 epoch 的委托对象就是 CLever 的 owner 多签。

**这笔委托从何而来**:不是 `CLeverCVXLocker` 主动调用产生的——查证过合约里唯一可能相关的旧函数(被注释掉的 `delegate()`,见 [`CLeverCVXLocker.sol#L766-772`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/vlcvx-migration/contracts/clever/CLeverCVXLocker.sol#L766-L772))调用的是 Snapshot/L2 委托系统的旧接口,和这套新的 `Delegation` 合约完全不兼容,根本不可能是它写入的。这笔委托记录的产生时间早于本次升级测试,是 Convex 自己上线新投票系统时,通过 [`Delegation.seedDelegates()`](https://github.com/convex-eth/voting/blob/main/src/Delegation.sol#L72-L100) 对旧系统里已有的委托关系做的一次性批量迁移写入的。

**实测影响**:用真实交易验证——owner 多签**不需要**任何 surrogate 授权,直接以自己的账户对一个 Gauge 提案投票,交易成功,且拿到的权重明显来自 Locker(owner 自己没有 vlCVX 持仓,基础权重为 0)。也就是说,即使 owner 完全不通过 `setConvexVotingSurrogate` 这条新路径,它仍然拥有一条现成的、能动用 Locker 全部 Gauge 投票权重的通道。

**新版 Locker 无法处理这个遗留状态**:这套 `Delegation` 合约修改委托的唯一入口是 [`setDelegate(address)`](https://github.com/convex-eth/voting/blob/main/src/Delegation.sol#L123),而且要求必须由委托人自己(`msg.sender`)发起调用——也就是说只有 Locker 合约自己才能改掉这笔委托。直接构造这个函数的调用数据发给 Locker 代理,确认会 revert:新版 [`CLeverCVXLocker.sol`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/vlcvx-migration/contracts/clever/CLeverCVXLocker.sol) 里完全没有实现这个转发函数,也没有任何通用的 `execute`/`delegatecall` 出口(合约里唯一的兜底只有 [L198](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/vlcvx-migration/contracts/clever/CLeverCVXLocker.sol#L198) 一个空的 `receive()`)。也就是说,只要新版实现保持现状,Locker 就永远没有办法自己撤销或更换这笔委托,唯一的出路是再做一次实现升级、加一个专门转发 `setDelegate` 的函数。

**影响范围**:这笔委托只影响 Gauge 投票权的归属,不涉及资产——owner 多签本来就无法通过这条路径转移或解锁 Locker 的 CVX/vlCVX,也无法借款、还款或动用用户资产;DAO 投票有自己独立的委托登记,不受这笔 Gauge 委托影响。需要注意的是:如果 Locker 自己(通过 surrogate)还没有对某一轮 Gauge 提案投票,owner 多签可以用这笔委托权重把 Locker 的投票导向任意一个合法 gauge,链上记录的投票主体会显示成 owner,不是 Locker——如果后续接入按投票账户识别收益归属的第三方(比如 Votemarket/StakeDAO 类的贿选市场),需要注意这一点。

**是否影响上线**:不影响。owner 多签本身就是 CLever 自己的多签,这笔委托不会被外部第三方拿走或滥用,也不涉及资产安全,只是一个后续可以优化的权限归口问题(要不要收回这笔遗留委托、集中到 surrogate 一条路径),留作后续排期。

### 3.3 DAO 与 Gauge 投票平台的满权重精度不一致

**现象**:直接读取两个已部署合约各自的 `max_weight()` 常量——[`DaoVotePlatform.max_weight() = 10,000`](https://github.com/convex-eth/voting/blob/main/src/DaoVotePlatform.sol#L32),[`GaugeVotePlatform.max_weight() = 1,000,000`](https://github.com/convex-eth/voting/blob/main/src/GaugeVotePlatform.sol#L74)。两者是各自合约里写死的编译期常量,不可配置,也不相等。

**影响**:生产环境的投票脚本如果假设两个平台用同一套精度去拼权重参数,要么会直接 revert(`MaxWeight()`),要么在没有严格加总校验的情况下产生错误的权重分配。脚本需要分别读取目标平台自己的 `max_weight()`。

**是否影响上线**:不影响合约层面,是写投票脚本时需要注意的一个细节。

### 3.4 主网当前 `rewardTokens` 数组为空

**现象**:直接对主网 Locker 发起 `rewardTokens(0)` 的 `eth_call`,确认会 revert(数组越界),即当前这份列表是空的。这是当前主网的真实状态,不是本次改动导致的。

**是否影响上线**:不影响。

---

## 4. PR 代码变更简述

[`contracts/clever/CLeverCVXLocker.sol`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/vlcvx-migration/contracts/clever/CLeverCVXLocker.sol) 新增了 `CONVEX_SURROGATE_REGISTRY` 常量和 `setConvexVotingSurrogate`(L754-760),owner 通过它向 Convex 的 `SurrogateRegistry` 登记一个可代表 Locker 投票的地址。旧的 `delegate(address,bytes32,address)` 和 `commitUserSurrogate(address,address,address)` 两个函数被注释掉(L766-782),不是文本删除,字节码层面等效于已移除,但源码里仍保留着这两段注释掉的代码和对应的未使用 import(`ICommitUserSurrogate`、`ISnapshotDelegateRegistry`)。

---

## 5. 多签执行层面:完整流程走一遍真实 Safe 签名执行

前面 0-9 全部测试用例都是直接 impersonate 多签地址 `0xFC08757c...0C5E` 去发起调用——这样能测出"合约收到这个地址的调用后会怎么处理",但绕过了 Safe 自己的签名校验逻辑,还差一层:真实签名执行这一步,整条流程走不走得通。

先确认了 `0xFC08757c...0C5E` 是一个真实的 [Gnosis Safe](https://etherscan.io/address/0xFC08757c505eA28709dF66E54870fB6dE09f0C5E),9 个签名人、6-of-9 门槛。然后把生产环境里会实际发生的每一步多签操作,都改成通过 Safe 自己的签名执行机制去跑:impersonate 6 个真实签名人各自调用 `approveHash` 完成链上审批,拼出对应的签名数据,再调用 Safe 自己的 `execTransaction` 去执行——不是只测其中一步,而是完整的六步:

1. Safe 执行升级(`ProxyAdmin.upgrade` 切到新实现)
2. Safe 执行设置 surrogate
3. surrogate(普通 EOA)正常投票
4. Safe 执行撤销 surrogate
5. Safe 执行更换 surrogate
6. Safe 执行回滚(`ProxyAdmin.upgrade` 切回旧实现)

六步全部通过。也就是说,不只是"假设多签调用会成功",而是把整条 0→修改→验证→回滚的生产流程,都在真实 Safe 的签名门槛校验下重新跑了一遍,升级和回滚这两步风险最高的操作也没有被跳过。

**这一步测不到的地方**:真正没办法在 fork 上复现的,是 6 个真实签名人实际去点击签名这个动作和协调过程本身,以及正式提交给 Safe Transaction Service 后大家在 Safe 网页上看到的解码信息是否清楚无误。这部分需要走一遍正式的多签签名流程去确认,不是技术上做不到模拟,而是这一步的核心是人的操作和协作过程,不是代码逻辑。
