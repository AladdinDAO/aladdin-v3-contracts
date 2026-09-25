# f(x) ezETH Wind-Down 上线前复核

> 作者:Gilbert
> 状态:v1.0(2026-09-25)
> 复核对象:主网已部署的三个 implementation
> [`0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd`](https://etherscan.io/address/0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd) `FxUSD`
> [`0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC`](https://etherscan.io/address/0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC) `WrappedTokenTreasuryV2WindDown`
> [`0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5`](https://etherscan.io/address/0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5) `FxUSDShareableRebalancePoolWindDown`
> 对应源码:[PR #275](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/275) @ [`2c0b9e5`](https://github.com/AladdinDAO/aladdin-v3-contracts/commit/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38)

## 结论:三个 implementation 与审计对象逐字节相同,可以升级;上线批次必须在每个 `windDown()` 之前补 10 笔 `checkpoint`,否则两个 Rebalance Pool 的 10 个存款人中将有 8 个无法领取

三个地址的 deployed bytecode 与 `2c0b9e5` 的本地编译产物 keccak 完全相同(含 metadata 尾部),constructor immutable 与目标 market 逐项吻合,四个代理升级后 640 个存储槽零差异。升级路径、固定比例赎回、rUSD 迁移、市场与池移除、赎回压力、模糊与不变量测试全部通过。

**有一个真实缺陷,必须在上线批次里规避(第 3 节)。** 两个 Pool 执行 `windDown()` 后,每池只有第一个被 checkpoint 的账户能领取,其余以 `panic 0x12` 除零回滚,公开 view `claimable()` 同样回滚。实测滞留 `0.491089056498529122` ezETH + `0.116218067037616642` FXN。资金不会灭失,可由 `Pool.adminClaim()` 全额回收后线下退款。

**规避办法:在每个 `windDown()` 之前,对该池的全部存款人各调用一次 `checkpoint(address)`。** 该函数无权限,可与 `windDown` 放进同一笔 MultiSend。补齐后的完整三笔 Safe 批次参数与 JSON 见第 7 节,已用真实 6/9 多签流程在主网分叉上跑通,**31 项断言全部通过,10 个存款人全部足额领取**。

**分配权重是唯一不被合约校验的参数,须由治理在 `initializeWindDown` 之前书面确认取值与快照区块(第 4 节)。** ezETH 预言机已于 `2026-08-19T09:41:11Z`(区块 `25788322`)失效,`fezETH.nav()` / `xezETH.nav()` 已无法读取,权重只能外部给定;不同口径之间相差约 `1.6` ezETH。

上线批次另有 5 项前置条件(第 6 节),漏掉任意一项会导致整批回滚。

## 1. 部署产物核对

```plain text
FxUSD                                0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd
  链上 / 本地   18,905 bytes   keccak 0x868e422357ceb1b354a551ef52d61d015a2476833dd8f5da49ba47fa71aa3e6a
WrappedTokenTreasuryV2WindDown       0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC
  链上 / 本地   13,020 bytes   keccak 0xd4407b9078a47ae5ea68bd5c132c66e0797732525d2bf9850b00cd9f07209d90
FxUSDShareableRebalancePoolWindDown  0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5
  链上 / 本地   20,799 bytes   keccak 0xf7a5e6fa5b7f3c759f5a3b6d285418ddd287064533f5b181d175c2aa4239e877
```

```plain text
Treasury immutables   baseToken / fToken / xToken = ezETH / fezETH / xezETH        ✓
Pool immutables       fxn / ve / veHelper / minter 与两个现网 Pool 逐项相同         ✓
implementation 自身    Treasury 与 Pool 的 initialize 均已锁死;三者 ezETH 余额为 0
部署交易              均由 EOA 0x83fC663840aaebCc97031d9fE2FEaF9b707Cb4BE 发出,
                      三个 implementation 不持有任何角色,无需后续移交
```

**存储布局回归**:升级后逐槽比对 ezETH Treasury `0..59`、rUSD `0..259`、两个 Pool 各 `0..159`,**共 640 槽零差异**。这与 diff 形态相符:新实现只追加变量,未插入或改动父合约槽位。

**升级路径**:ProxyAdmin [`0x9B54B770…dDA4`](https://etherscan.io/address/0x9B54B7703551D9d0ced177A78367560a8B2eDDA4) 的 owner 是延迟 `259,200` 秒(3 天)的 TimelockController [`0x68863fb8…4e61a`](https://etherscan.io/address/0x68863fb8855b04509a835082478D6E3D0bE4E61a),Safe 持有 `PROPOSER` 与 `EXECUTOR`。实测延迟未到 `executeBatch` 回滚,3 天后四个代理全部升级成功,Timelock operation 置为 done。

## 2. 两个 Rebalance Pool 的实际形态

池名指的是清算收益被转换成什么,不是存入的 token。**两个池存的都是 fezETH。**

```plain text
RebalancePool.ezETH   0xf58c499417e36714e99803Cb135f507a95ae7169
  asset(存入)   = 0x50B4DC15…13f9  fezETH
  baseToken     = 0xbf5495Ef…2110  ezETH
  wrapper       = 自身 -> 收益直接留作 ezETH
  totalSupply   = 715.048379107106908888 fezETH
  奖励 token     = ezETH, FXN

RebalancePool.xezETH  0xBa947cba270D30967369Bf1f73884Be2533d7bDB
  asset(存入)   = 0x50B4DC15…13f9  fezETH      同一个 token
  baseToken     = 0xbf5495Ef…2110  ezETH       同一个 token
  wrapper       = 0xBeb42894…742b  src=ezETH, dst=xezETH -> 收益被包成 xezETH
  totalSupply   = 3121.801949478423314608 fezETH
  奖励 token     = ezETH, FXN, xezETH
```

两个池合计持有 `3,836.850328585530223496` fezETH,占 fezETH 总供应的 `49.44%`(其余 `50.56%` 在 rUSD 手中)。

`windDown()` 会绕过 wrapper,两池都直接把赎回所得 ezETH 计入用户奖励。实测 xezETH 池在 `windDown` 后 xezETH 余额为 `0`,wrapper 未被调用——这条路径依赖已被永久禁用的 `mintXToken`,绕过是必要的。

## 3. 发现的问题

### 3.1 `windDown()` 后每池只有第一个被 checkpoint 的账户能领取

**位置**:[`ShareableRebalancePool._computeBoostRatio` L894](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/contracts/f%28x%29/rebalance-pool/ShareableRebalancePool.sol#L894)

```solidity
_boostedBalance = (_boostedBalance * _balance) / _ownerBalance;
```

函数开头的 `if (_balance == 0) return (PRECISION * 4) / 10;` 保护的是 `_balance`,除数是 `_ownerBalance`,两者可以独立为零。

**触发链路**(逐步实测):

```plain text
[windDown 之前]   pool totalSupply 715.048379107106908888   history 最新档 epoch = 0
                  voteOwnerBalances(0xd11a4Ee0…)  epoch = 0  amount = 715.048379107106908888

[windDown 之后]   _notifyLoss 走 100% 清零分支,epoch + 1,totalSupply 归零
                  voteOwnerBalances 未被触碰      epoch = 0  amount = 715.048379107106908888

[第 1 人 claim]   成功,领到 0.144264565892259398 ezETH
                  其 checkpoint 把共享 voteOwner 折算到新 epoch:
                  voteOwnerBalances 变为          epoch = 1  amount = 0  updateAt = 当前

[第 2 人 claim]   claimable() 读数仍为 0.114875745112543818
                  但 _getVoteOwnerHistoryBalances 因 updateAt 已是当前,回溯循环不执行,
                  直接返回 amount = 0;而 _realBalance 取自清零前的历史档仍大于 0
                  -> 除以 0,panic 0x12
```

`_notifyLoss` 只在 `_loss >= _supply.amount` 时提升 epoch([L699-L717](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/contracts/f%28x%29/rebalance-pool/ShareableRebalancePool.sol#L699-L717));部分清算走 else 分支,epoch 不变,不触发。

**三个必要条件**:账户接受了投票共享、所在池被 100% 清零、不是清零后第一个被 checkpoint 的账户。三者缺一不发生。

`claim(address,address)` 与 [`checkpoint(address)`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/contracts/common/rewards/accumulator/MultipleRewardCompoundingAccumulator.sol#L176) 均无权限,任何人可替任意地址触发。即使只调 `checkpoint` 不领取,那个唯一名额也会被占掉。

受影响账户在合约内无其他出路:`claim` / `checkpoint` 除零回滚,`rejectSharedVote` / `toggleVoteSharing` 在新实现中以 `ErrorWindDownNotAllowed` 回滚,`rUSD.redeemFrom` 因 `withdrawFrom` 被禁用同样回滚。

### 3.2 影响面

扫描两个池自区块 `18,000,000` 起的全部 `Deposit` / `Withdraw` 事件(取 owner 与 receiver 两个 topic),逐地址读当前余额:

```plain text
ezPool    历史出现 54 个地址,当前有余额 6 个,余额之和 == totalSupply(精确吻合)
xezPool   历史出现 39 个地址,当前有余额 4 个,余额之和 == totalSupply(精确吻合)
10 个金库地址去重后仍是 10 个  -> 两池完全不重叠
背后独立 owner 10 个           -> 无人同时在两个池
```

10 个地址全部是 Convex f(x) 个人金库(pid 23 / 24),`rewardReceiver` 均为默认值,背后是 **10 个互不相同的当事方**(8 个 EOA + 2 个 Safe v1.3.0 个人钱包,无聚合型合约,终端用户数未被放大)。全部共享同一个 vote owner `0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881`,第一个条件对 10 个账户全部成立。

用 5 种不同领取顺序各跑两池:

```plain text
ezPool(6 人)   按份额从大到小 / 从小到大 / 第 2 人先领 / 最后一人先领 / 先 checkpoint 第 3 人
               -> 每种顺序都恰好 1 人成功,其余 5 人除零
xezPool(4 人)  同样 5 种顺序 -> 每种都恰好 1 人成功,其余 3 人除零
```

**幸存者数量恒为每池 1 个,但幸存者是谁取决于谁先动,无法事先指定。因此 10 个当事方全部处于风险中,最终 8 个无法领取。**

滞留额(含清盘所得与清盘前已累积未领的奖励):

```plain text
ezPool    1/6 成功   滞留 0.214375210035782726 ezETH + 0.107941357313012027 FXN
xezPool   1/4 成功   滞留 0.276713846462746396 ezETH + 0.008276709724604615 FXN
合计      2/10      滞留 0.491089056498529122 ezETH + 0.116218067037616642 FXN
```

**资金不会灭失**:`Pool.adminClaim()`(需 Treasury 已 finalize)实测将上述滞留额**一 wei 不差**全额回收到 Safe,可线下退款。

**下游路径变化**:升级后两个 Pool 的 `withdraw` / `withdrawFrom` 以 `ErrorWindDownNotAllowed` 回滚,Convex 金库的撤资路径同样回滚。实测金库 owner 通过 `getReward(bool,address[])` 并把 ezETH 列入 token 列表可足额取出。该变化需提前告知 Convex。

### 3.3 既有 fork 测试为何未覆盖

仓库中的 [`EzETHWindDownFork.t.sol`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/test/foundry/fx/EzETHWindDownFork.t.sol) 通过,本次复核独立复跑确认通过。它未覆盖该缺陷有两个独立原因,均已用继承该测试类的新测试证明。

**原因一:测试 setup 使 `windDown` 走进了部分亏损分支。**

[`_fundUserAndDepositToPools()` L126-L142](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/test/foundry/fx/EzETHWindDownFork.t.sol#L126-L142) 先从池中取走 `2` fezETH 给测试合约(不再放回),再让两个存款人各从池中取 `1` fezETH 并存回。净效果是池的资产余额 `−2`、`totalSupply` `+2`:

```plain text
production:        totalSupply 715.048379107106908888   fezETH 余额 715.048379107106908888   相等
after repo setup:  totalSupply 717.048379107106908888   fezETH 余额 713.048379107106908888   余额低于供应
epoch before windDown: 0
epoch after  windDown: 0        <- 未提升,走的是 else 分支
```

生产环境两池的 `balanceOf == totalSupply` 精确相等,必然走 `if` 分支:

```plain text
epoch before windDown: 0
epoch after  windDown: 1
```

**该测试从未执行过 100% 清零这条代码路径。**

**原因二:测试只给无投票共享的合成账户领过钱。**

[L259-L260](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/test/foundry/fx/EzETHWindDownFork.t.sol#L259-L260) 与 [L291-L292](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/test/foundry/fx/EzETHWindDownFork.t.sol#L291-L292) 只对 `POOL_DEPOSITOR_A` / `POOL_DEPOSITOR_B` 调 `_claimPoolReward`,这两个地址的 `getStakerVoteOwner` 均为 `0x0`,`_ownerBalance == _realBalance`,早退分支挡住。测试从未给任何一个真实存款人调过 `claim()`。

**验证方式**:新增 `EzETHWindDownRealDepositorsTest is EzETHWindDownForkTest`,复用其全部 helper,仅追加断言。同一 forge、同一 fork、同一文件的输出:

```plain text
[PASS] testFork_EzETHWindDownTreasuryAndPools()          原测试一行未改,仍然通过
[PASS] testFork_1_RepoSetupAvoidsTheFullWipeBranch()     证明原因一
[FAIL] testFork_2_RealDepositorsCannotClaim()            ALL real ezPool depositors can claim: 1 != 6
[PASS] testFork_3_WithCheckpointsAllCanClaim()           两池 10/10,实收 == claimable
```

**建议给既有测试补两条断言**,此后同类问题不会再漏:

```solidity
// windDown 前:确认确实会走 100% 清零分支
assertEq(
  IERC20Upgradeable(FEZETH).balanceOf(pool),
  IFxBoostableRebalancePool(pool).totalSupply(),
  "asset balance must equal totalSupply"
);

// windDown 后:对该池全部真实存款人逐个 claim,断言实收 == claimable
```

### 3.4 规避方案

在每个 `windDown()` 之前,对该池的全部存款人各调用一次 `checkpoint(address)`。该调用把账户的 product 刷成清零前的最新值,之后按周回溯只会访问到清零后的 supply 档,`_getCompoundedBalance` 返回 `0`,走进早退分支,到不了除法。

```plain text
未加 checkpoint   ezPool 1/6   xezPool 1/4
加 checkpoint     ezPool 6/6   xezPool 4/4   每人实收 == 各自 claimable
持久性            同块 / +1h / +1d / 跨周边界前后 / +2w / +6w 均有效
```

当前的 10 个地址:

```plain text
ezPool   0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1   0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A
         0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd   0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc
         0xCbE9e9E80b5301956c12FbB40742b144f98d4e63   0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64
xezPool  0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f   0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90
         0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6   0x1090988Cf5569cc811756220AC3160aA028988AA
```

生成正式批次时须按当时链上读数重新枚举。

### 3.5 同类潜在暴露(本次无行动项)

共享 vote owner `0xd11a4Ee0…` 同时挂着另外两个在运行的 Pool:

```plain text
0xc2DeF1E39FF35367F2F2a312a793477C576fD4c3   17 个存款人,5 个共享,占 TVL 83%
0x7EB0ed173480299e1310d55E04Ece401c2B06626    8 个存款人,5 个共享,占 TVL 85%
```

这两个池本次不清盘,不受影响。但同一份代码、同一个共享 owner,将来任何池被 100% 清空会重演,且金额量级更大。建议在下次改动该文件时为 `_computeBoostRatio` 补 `_ownerBalance == 0` 保护。

## 4. 分配权重

`initializeWindDown` 精确校验 `expectedBaseBalance` / `expectedFSupply` / `expectedXSupply`(三项传错值均实测回滚),但 **`fWeight` / `xWeight` 不对任何链上量校验**([L236-L280](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/2c0b9e589063524cf127b1e95f3d6e04cd3b9e38/contracts/f%28x%29/wind-down/WrappedTokenTreasuryV2WindDown.sol#L236-L280),唯一检查是 `fW + xW != 0` 及供应为 0 时权重须为 0)。实测传 `(fW = 1, xW = 0)` 直接成功,xezETH 持有人分到 0。

ezETH 预言机自区块 `25788322`(`2026-08-19T09:41:11Z`)返回 `isValid = false, twap = 0`,`fezETH.nav()` / `xezETH.nav()` 无法读取,权重只能由治理外部给定。

口径敏感度(`B = 19.980850948820418991`、`F = 7,760.089386975109717094`、`X = 97,670.663336056174849810`):

| 价格口径 | fezETH 占比 | fBase | xBase |
|---|---|---|---|
| 预言机最后有效读数(区块 `25788321`,`1,921.957674`) | 18.6427% | 3.724971564391453147 | 16.255879384428965844 |
| 执行当日 Chainlink ETH/USD × Renzo rate | 13.1%–13.4%(随价格变动) | ~2.60–2.68 | ~17.30–17.38 |
| 上一次 settle 的 `referenceBaseTokenPrice` `3,374.553159` | 10.6168% | 2.121340205876323545 | 17.859510742944095446 |

两端相差约 `1.6` ezETH。fezETH 侧按 `rUSD 50.56% / xezPool 40.22% / ezPool 9.21%` 分配;xezETH 侧 `99.993%` 归单一地址 [`0xC01Ac9349396935f60d39737EBe352572d1483A2`](https://etherscan.io/address/0xC01Ac9349396935f60d39737EBe352572d1483A2),**该地址 nonce 为 `0`,从未发起过任何交易**。

`fBase + xBase == B` 在任意权重下精确成立(50/50 权重实测 `9990425474410209495 + 9990425474410209496`,一 wei 不差)。

## 5. 负面场景测试结果

这些场景量化各条前置条件的代价,均为按设计行为。

| 场景 | 结果 |
|---|---|
| 未清零 redeem 费率 | fezETH 实扣 `0.2499%`、xezETH 实扣 `8.9999%`;以固定比例预览作 `_minBaseOut` 时以 `ErrorInsufficientBaseOutput` 回滚 |
| `initializeWindDown` 传错 `expectedBaseBalance` / `F` / `X` | 分别以 `ErrorWindDownUnexpectedBaseBalance` / `FSupply` / `XSupply` 回滚 |
| 向 Treasury 转入 1 wei ezETH | 写死 `B` 的 `initializeWindDown` 回滚,需重新生成批次 |
| weETH Treasury `baseTokenCap` 不足 | rUSD mint 以 `ErrorExceedTotalCap` 回滚,整批回滚 |
| 重复 `initializeWindDown` / 重复 `windDown` / finalize 后赎回 | 分别以 `ErrorWindDownInitialized` / `ErrorWindDownZeroAsset` / `ErrorWindDownFinalized` 回滚 |
| 初始化后向 Treasury 捐赠 ezETH 或 fezETH | 赎回率、`windDownBaseBalance`、`windDownBaseClaimed` 均不变 |
| rateProvider 汇率 `1.0e18` / `+1` / `1.5e18` / `10e18` / `1e18 − 1` | 赎回成功,产出等于固定比例预览 |
| rateProvider 汇率 `0.5e18` / `0` / provider 自身回滚 | 整条赎回路径回滚(`ErrorWindDownRateRoundTrip`) |
| 陌生 EOA 调用 18 个入口 | 全部回滚 |
| Safe 调用 `settle` / `harvest` / `initializeProtocol` / 五个 `update*` / `updateRateProvider` | 全部以 `ErrorWindDownNotAllowed` 回滚 |
| `removeRebalancePools` 之后走 `rUSD.redeemFrom` | 以 `ErrorUnsupportedRebalancePool` 回滚,后备退出路径被关闭 |

模糊与不变量测试(300 次随机赎回,随机方向、金额、顺序、时间跳跃):

```plain text
每笔 out == floor(in × base / supply) 精确成立
用户到账、Treasury 扣减、windDownBaseClaimed 三者逐笔吻合
claimed 单调且始终 <= windDownBaseBalance;Treasury 余额 == B − claimed 恒等
固定参考报价(1e12 token-wei)全程不变:f 侧 480083274,x 侧 166430341
同一组金额跑 5 种不同顺序,每账户产出与总 claimed 逐字节相同
能产出 1 wei 的最小 fezETH 输入为 2083 wei,更小输入以 ErrorWindDownZeroBaseOutput 回滚
previewRedeem(全部供应) 精确等于对应的 windDownFBaseBalance / windDownXBaseBalance
端到端:claimed + Treasury 余额 == windDownBaseBalance
finalize 后 adminClaim 扫走的额度精确等于未赎回持有人的应得额(实测差 2 wei)
```

## 6. 上线前核对清单

**升级批次**

1. 四个代理经 Timelock 升级,最短延迟 `259,200` 秒。
2. 升级完成后确认:四个 implementation slot 精确匹配第 1 节地址、`windDownStatus == 0`、`maxRedeemableFToken/XToken` 均返回 `(0, 0)`、`isUnderCollateral()` 返回 `false`、两个 Pool 的 `deposit` / `withdraw` 静态模拟按新实现回滚。

**操作批次(单笔原子 MultiSend)**

3. `updateRedeemFeeRatio(0, 0, true)` 与 `(0, 0, false)` 必须排在任何赎回之前。
4. `initializeWindDown` 的权重取值与快照区块须经治理书面确认并记入执行记录。
5. weETH Treasury `baseTokenCap` 当前为 `0`,须先抬高。该函数是绝对赋值而非只升不降,须按执行时的实时 `totalBaseToken` 重算,并留出独立于 weETH 输入缓冲的余量。
6. Safe 须持有本次 mint 所需的 weETH(当前余额 `0.05965785976727296`)。
7. **每个 `windDown` 之前,对该池全部存款人各调一次 `checkpoint(address)`**,地址清单以生成批次当时的链上读数为准。
8. `expectedAssetBalance` 取执行时各池实际 fezETH 余额;`minBaseOut` 取 `windDownPreviewRedeem` 值,实测可取等。
9. `B` 在签名前最后一刻重读,并预置重新生成批次的路径。

**持续要求**

10. `xTokenRedeemPausedInStabilityMode` 全程保持 `false`。该开关归 `EMERGENCY_DAO_ROLE`,一旦开启 `redeemXToken` 会调用仍依赖失效预言机的 `collateralRatio()`。
11. 迁移完成后恢复 weETH Treasury 的 `baseTokenCap`。
12. `removeMarket` 后 `autoRedeem` 的 `_minOuts` 长度由 `2` 变为 `1`,须通知集成方。
13. 与 Convex 确认 pid 23 / 24 的 ezETH 领取路径在其前端可用。

**收尾**

14. `finalizeWindDown` 之前确认 `0xC01Ac9349396935f60d39737EBe352572d1483A2` 具备签名能力,否则其持有的 `99.993%` xezETH 对应的 `17.3` ezETH 将由 `adminClaim` 收走。
15. 两个 Pool 的 `adminClaim` 会扫走用户未领的全部 ezETH 与 FXN,之后 `claim()` 回滚;调用前须逐地址确认 `claimable` 归零。

## 7. Safe 执行批次

补齐 `checkpoint` 后的完整三笔批次。下列数值按区块 `26,050,752` 生成用于演示;**正式执行时第三笔的状态相关字段必须在冻结后重新读取并重新生成 JSON**(见第 7.5 节)。

固定地址:

```plain text
Safe            0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF   9 owners / threshold 6
Timelock        0x68863fb8855b04509a835082478D6E3D0bE4E61a   minDelay 259200
ProxyAdmin      0x9B54B7703551D9d0ced177A78367560a8B2eDDA4
MultiSendCallOnly 0x40A2aCCbd92BCA938b02010E17A5b8929b49130D
ezETH Market    0x69518D1D70AD537C41401303BDf96032338E40dE
ezETH Treasury  0x38965311507D4E54973F81475a149c09376e241e
ezPool          0xf58c499417e36714e99803Cb135f507a95ae7169
xezPool         0xBa947cba270D30967369Bf1f73884Be2533d7bDB
rUSD            0x65D72AA8DA931F047169112fcf34f52DbaAE7D18
weETH           0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee
weETH Treasury  0x781BA968d5cc0b40EB592D5c8a9a3A4000063885
```

### 7.1 批次一:排队四个升级

顶层一笔 `Timelock.scheduleBatch`。

```plain text
targets     = [ProxyAdmin × 4]
values      = ["0","0","0","0"]
predecessor = 0x0000000000000000000000000000000000000000000000000000000000000000
salt        = 0x7a1de5f0c2b4498d6e3a0f7c5d2b8e14a9c6037b5e8d1f2a4c7b093e6d5a8f21
delay       = 259200
operationId = 0x0aaf4bd9ba41f8e3e9031261c08f81ae0fa868bf652199a0e7f320d32c2b627a

payloads[0] ProxyAdmin.upgrade(rUSD,           0x13d8dc5B…2fBd)
  0x99a88ec400000000000000000000000065d72aa8da931f047169112fcf34f52dbaae7d1800000000000000000000000013d8dc5b2b45e6ff2182fbd874ceb5e27b822fbd
payloads[1] ProxyAdmin.upgrade(ezETH Treasury, 0xC2f4eb02…96bC)
  0x99a88ec400000000000000000000000038965311507d4e54973f81475a149c09376e241e000000000000000000000000c2f4eb02f1ee9b19f44b5bfdc3225917279396bc
payloads[2] ProxyAdmin.upgrade(ezPool,         0xff0aEa08…5BB5)
  0x99a88ec4000000000000000000000000f58c499417e36714e99803cb135f507a95ae7169000000000000000000000000ff0aea082d2f59f73416cf868caef4be898f5bb5
payloads[3] ProxyAdmin.upgrade(xezPool,        0xff0aEa08…5BB5)
  0x99a88ec4000000000000000000000000ba947cba270d30967369bf1f73884be2533d7bdb000000000000000000000000ff0aea082d2f59f73416cf868caef4be898f5bb5
```

`safe-1-upgrade-schedule.json`:

```json
{
  "version": "1.0",
  "chainId": "1",
  "meta": {
    "name": "ezETH wind-down 1/3 schedule",
    "description": "Timelock.scheduleBatch with 4 ProxyAdmin.upgrade payloads, delay 259200",
    "txBuilderVersion": "1.18.0",
    "createdFromSafeAddress": "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF"
  },
  "transactions": [
    {
      "to": "0x68863fb8855b04509a835082478D6E3D0bE4E61a",
      "value": "0",
      "contractMethod": {
        "name": "scheduleBatch",
        "payable": false,
        "inputs": [
          { "name": "targets", "type": "address[]" },
          { "name": "values", "type": "uint256[]" },
          { "name": "payloads", "type": "bytes[]" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" },
          { "name": "delay", "type": "uint256" }
        ]
      },
      "contractInputsValues": {
        "targets": "[\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\",\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\",\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\",\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\"]",
        "values": "[\"0\",\"0\",\"0\",\"0\"]",
        "payloads": "[\"0x99a88ec400000000000000000000000065d72aa8da931f047169112fcf34f52dbaae7d1800000000000000000000000013d8dc5b2b45e6ff2182fbd874ceb5e27b822fbd\",\"0x99a88ec400000000000000000000000038965311507d4e54973f81475a149c09376e241e000000000000000000000000c2f4eb02f1ee9b19f44b5bfdc3225917279396bc\",\"0x99a88ec4000000000000000000000000f58c499417e36714e99803cb135f507a95ae7169000000000000000000000000ff0aea082d2f59f73416cf868caef4be898f5bb5\",\"0x99a88ec4000000000000000000000000ba947cba270d30967369bf1f73884be2533d7bdb000000000000000000000000ff0aea082d2f59f73416cf868caef4be898f5bb5\"]",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x7a1de5f0c2b4498d6e3a0f7c5d2b8e14a9c6037b5e8d1f2a4c7b093e6d5a8f21",
        "delay": "259200"
      }
    }
  ]
}
```

### 7.2 批次二:暂停 + 执行升级

等待 Timelock ready 后,一笔 MultiSend,三步。`targets` / `values` / `payloads` / `predecessor` / `salt` 必须与批次一逐字节相同。

| 序 | Target | Method | 参数 |
|---|---|---|---|
| 1 | ezETH Market | `updateMintStatus(bool)` | `true` |
| 2 | ezETH Market | `updateRedeemStatus(bool)` | `true` |
| 3 | Timelock | `executeBatch(...)` | 同批次一 |

```json
{
  "version": "1.0",
  "chainId": "1",
  "meta": {
    "name": "ezETH wind-down 2/3 pause+execute",
    "description": "Pause ezETH market mint and redeem, then Timelock.executeBatch",
    "txBuilderVersion": "1.18.0",
    "createdFromSafeAddress": "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF"
  },
  "transactions": [
    {
      "to": "0x69518D1D70AD537C41401303BDf96032338E40dE",
      "value": "0",
      "contractMethod": { "name": "updateMintStatus", "payable": false, "inputs": [{ "name": "_newStatus", "type": "bool" }] },
      "contractInputsValues": { "_newStatus": "true" }
    },
    {
      "to": "0x69518D1D70AD537C41401303BDf96032338E40dE",
      "value": "0",
      "contractMethod": { "name": "updateRedeemStatus", "payable": false, "inputs": [{ "name": "_newStatus", "type": "bool" }] },
      "contractInputsValues": { "_newStatus": "true" }
    },
    {
      "to": "0x68863fb8855b04509a835082478D6E3D0bE4E61a",
      "value": "0",
      "contractMethod": {
        "name": "executeBatch",
        "payable": true,
        "inputs": [
          { "name": "targets", "type": "address[]" },
          { "name": "values", "type": "uint256[]" },
          { "name": "payloads", "type": "bytes[]" },
          { "name": "predecessor", "type": "bytes32" },
          { "name": "salt", "type": "bytes32" }
        ]
      },
      "contractInputsValues": {
        "targets": "[\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\",\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\",\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\",\"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4\"]",
        "values": "[\"0\",\"0\",\"0\",\"0\"]",
        "payloads": "[\"0x99a88ec400000000000000000000000065d72aa8da931f047169112fcf34f52dbaae7d1800000000000000000000000013d8dc5b2b45e6ff2182fbd874ceb5e27b822fbd\",\"0x99a88ec400000000000000000000000038965311507d4e54973f81475a149c09376e241e000000000000000000000000c2f4eb02f1ee9b19f44b5bfdc3225917279396bc\",\"0x99a88ec4000000000000000000000000f58c499417e36714e99803cb135f507a95ae7169000000000000000000000000ff0aea082d2f59f73416cf868caef4be898f5bb5\",\"0x99a88ec4000000000000000000000000ba947cba270d30967369bf1f73884be2533d7bdb000000000000000000000000ff0aea082d2f59f73416cf868caef4be898f5bb5\"]",
        "predecessor": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "salt": "0x7a1de5f0c2b4498d6e3a0f7c5d2b8e14a9c6037b5e8d1f2a4c7b093e6d5a8f21"
      }
    }
  ]
}
```

### 7.3 批次三:22 步 operations

第 11–16 与第 18–21 步是本次复核新增的 `checkpoint`,缺了这 10 笔就会出现第 3 节的问题。

| 序 | Target | Method | 参数 |
|---|---|---|---|
| 1 | ezETH Market | `updateRedeemFeeRatio` | `(0, 0, true)` |
| 2 | ezETH Market | `updateRedeemFeeRatio` | `(0, 0, false)` |
| 3 | ezETH Treasury | `initializeWindDown` | `B, F, X, fWeight, xWeight` |
| 4 | weETH Treasury | `updateBaseTokenCap` | `192892147840252629582` |
| 5 | weETH | `approve` | `rUSD, 1033419732857877241` |
| 6 | rUSD | `mint` | `weETH, 1033419732857877241, Safe, 2925010571359938194510` |
| 7 | ezETH Market | `updateRedeemStatus` | `false` |
| 8 | rUSD | `redeem` | `ezETH, 3923239058389579493598, Safe, 1341606749734942411` |
| 9 | rUSD | `removeMarket` | `ezETH` |
| 10 | rUSD | `removeRebalancePools` | `[ezPool, xezPool]` |
| 11–16 | ezPool | `checkpoint` × 6 | 6 个 ezPool 存款人 |
| 17 | ezPool | `windDown` | `715048379107106908888, 244520845535960275` |
| 18–21 | xezPool | `checkpoint` × 4 | 4 个 xezPool 存款人 |
| 22 | xezPool | `windDown` | `3121801949478423314608, 1067544063571580889` |

关键 calldata:

```plain text
 1  0xe3d65a6f0000…0000 0000…0000 0000…0001         updateRedeemFeeRatio(0,0,true)
 2  0xe3d65a6f0000…0000 0000…0000 0000…0000         updateRedeemFeeRatio(0,0,false)
 3  0xaa5266b0 + (B, F, X, fWeight, xWeight)        initializeWindDown  164 bytes
 4  0x876d20de00000000000000000000000000000000000000000000000a74ea92796c63d24e
 5  0x095ea7b300000000000000000000000065d72aa8da931f047169112fcf34f52dbaae7d180000000000000000000000000000000000000000000000000e5771c590df72f9
 7  0x8373c53b0000000000000000000000000000000000000000000000000000000000000000
 9  0xdb913236000000000000000000000000bf5495efe5db9ce00f80364c8b423567e58d2110
11  0xa972985e0000000000000000000000004a036ab673722468a8e1fcc0f74a2dd5914fd1c1
12  0xa972985e0000000000000000000000004c75a7349b20745daf37e6c348b85e8a03f72f9a
13  0xa972985e0000000000000000000000000fa286332b2d1bbb0c7637cd63ba742a050b5aad
14  0xa972985e0000000000000000000000007dce6d8752a0e2fcf3ce92e9ceadf9857f920acc
15  0xa972985e000000000000000000000000cbe9e9e80b5301956c12fbb40742b144f98d4e63
16  0xa972985e000000000000000000000000492550ddcc5349940a879caf4d3cfffaa1ab0f64
17  0x387710ae000000000000000000000000000000000000000000000026c34a284f29f46ad80000000000000000000000000000000000000000000000000364b669da595cd3
18  0xa972985e000000000000000000000000c68a2ae2b932c472fd4ad4367ff6e093e4e3da8f
19  0xa972985e0000000000000000000000003b0c2e02b0f3a4f507ba8f39ab3ea93bf4863a90
20  0xa972985e0000000000000000000000009af69159d25e213a35a2b6e7274023da2d2bdac6
21  0xa972985e0000000000000000000000001090988cf5569cc811756220ac3160aa028988aa
22  0x387710ae0000000000000000000000000000000000000000000000a93bb47d08f75f40b00000000000000000000000000000000000000000000000ed0adab7342d7d9
```

完整 JSON 见仓库 [`docs/safe/safe-3-operations.json`](../docs/safe/safe-3-operations.json)。`checkpoint` 的 10 笔结构一致,示例:

```json
{
  "to": "0xf58c499417e36714e99803Cb135f507a95ae7169",
  "value": "0",
  "contractMethod": {
    "name": "checkpoint",
    "payable": false,
    "inputs": [{ "name": "_account", "type": "address" }]
  },
  "contractInputsValues": { "_account": "0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1" }
}
```

`windDown` 两笔:

```json
{
  "to": "0xf58c499417e36714e99803Cb135f507a95ae7169",
  "value": "0",
  "contractMethod": {
    "name": "windDown",
    "payable": false,
    "inputs": [
      { "name": "_expectedAssetBalance", "type": "uint256" },
      { "name": "_minBaseOut", "type": "uint256" }
    ]
  },
  "contractInputsValues": {
    "_expectedAssetBalance": "715048379107106908888",
    "_minBaseOut": "244520845535960275"
  }
}
```

### 7.4 真实 6/9 多签验证

三份 JSON 直接载入,按 Safe Transaction Builder 的方式拼 MultiSend,由 6 个真实 owner 逐个 `approveHash` 后 `execTransaction`,在主网分叉上执行:

```plain text
批次一   safeTxHash 0x0d495d9852e46e6d07462ed28f4df55ca5f58dc3020d34721207823b3718939d
         nonce 739   1 步    gas 136,896
批次二   safeTxHash 0xc74f39c974fb02ae958e8d81039bda60415b550811a37c271d58cca7e333870e
         nonce 740   3 步    gas 205,663
批次三   safeTxHash 0xfba77c46530dc9b802927ae5105a659ff6c67c4ce4635cc723c9280a99b72819
         nonce 740   22 步   gas 10,398,809   calldata 3,396 bytes

三个 safeTxHash 均与按 EIP-712 独立复算的值一致
31 项断言全部通过
```

执行后逐个领取,10 个存款人全部实收等于各自 `claimable`:

```plain text
ezPool   0x4A036ab6  0.102759873251054664      0x4c75A734  0.082005196003840236
         0x0Fa28633  0.053597984843570073      0x7DCe6D87  0.012730241177788772
         0xCbE9e9E8  0.002562436447283738      0x492550DD  0.000000254477480432
xezPool  0xC68A2AE2  1.036035343116095415      0x3b0c2E02  0.046092652846276886
         0x9af69159  0.001441195886413543      0x1090988C  0.000407873120303015
合计 1.337633051170106774 ezETH
```

### 7.5 正式执行前必须重新生成的字段

批次一、二完全确定,可在确认 salt 后定稿。批次三的下列字段依赖冻结后的链上状态,必须重读并重新 ABI 编码、重算 checksum、重跑分叉模拟:

```plain text
第 3 步   B / F / X          Treasury ezETH 余额、fezETH 与 xezETH 总供应
         fWeight / xWeight   按治理确认的价格口径计算
第 4 步   newCap             weETH Treasury totalBaseToken + 本次所需 + 独立余量
第 5、6 步 weETHAmountIn      按执行时 weETH 市场报价反推并加缓冲
第 6 步   minRUsdOut         ezManaged − Safe 现有 rUSD
第 8 步   ezManaged / minOut  rUSD 对 ezETH market 的 managed、按固定比例算出的产出
第 11–16、18–21 步 存款人地址  按执行时两池的实际存款人重新枚举
第 17、22 步 expectedAssetBalance / minBaseOut   按执行时两池实际 fezETH 余额
```

## 附:复现命令

```bash
export FORK_RPC=https://mainnet.gateway.tenderly.co
export MAINNET_RPC_URL=https://mainnet.gateway.tenderly.co

# Foundry:既有测试 + 真实存款人断言
forge test --match-path "test/foundry/fx/EzETHWindDownRealDepositors.t.sol" -vv

# 部署产物字节码比对
npx hardhat run test/fork/ezwd/05-bytecode.ts

# 升级路径、存储布局回归、全流程
npx hardhat run test/fork/ezwd/03-full.ts

# 模糊与不变量
npx hardhat run test/fork/ezwd/06-fuzz.ts

# 除零缺陷:逐步追踪、顺序依赖、规避方案与持久性
npx hardhat run test/fork/ezwd/15-trace.ts
npx hardhat run test/fork/ezwd/17-count.ts
npx hardhat run test/fork/ezwd/11-durability.ts

# 生成三份 Safe JSON
npx hardhat run test/fork/ezwd/18-safejson.ts

# 用真实 6/9 多签流程执行三份 JSON 并验证领取
npx hardhat run test/fork/ezwd/19-safeverify.ts

# 影响面全量枚举(只读链上)
node test/fork/ezwd/16-impact.mjs
```

`03`–`19` 通过手写 ABI 与主网已部署 implementation 交互,不引用仓库合约源码,在本分支即可运行;`test/foundry/fx/EzETHWindDownRealDepositors.t.sol` 继承 `EzETHWindDownFork.t.sol`,须在 `feat/ezeth-winddown` 分支上运行。
