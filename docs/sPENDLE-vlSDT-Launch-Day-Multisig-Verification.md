# sPENDLE / vlSDT 迁移上线 — 真实多签提案验证报告

> 作者:Gilbert
> 状态:v1.0(2026-08-03)
> 测试脚本:[`StakeDaoLaunchDayVerification.spec.ts`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-launch-gz/test/fork/concentrator/stakedao/StakeDaoLaunchDayVerification.spec.ts)(12 个用例)
> 分支:[`feat/test-stakedao-launch-gz`](https://github.com/AladdinDAO/aladdin-v3-contracts/tree/feat/test-stakedao-launch-gz)(基于 `feat/stakedao-migration`)

---

## 结论:两笔真实提案都能正确执行,新增的 3 步权限修复也生效了

**12/12 断言全部通过。** 本次验证的对象不是计划文档本身,而是**已经真实提交到 Safe、当前正在等签名的两笔提案**——E1(sPENDLE→WETH 透传路由注册)和 MAIN(23 步打包批次,含新增的 3 步 burner 权限修复)。所有校验都直接对着 Safe 官方接口查到的真实数据做,不是对着计划文档做。

---

## 1. 验证方法

对这两笔真实提案,依次做四层独立验证:

1. **地址核对**——程序逐字符比对,不是肉眼看
2. **calldata 解码**——自己算函数选择器、手工解码参数,不读计划文档里的文字描述
3. **真实执行**——在 fork 主网最新状态的节点上,用两个 Safe 各自真实的 6-of-9 签名门槛,真实执行
4. **功能性验证**——不满足于"权限调用没 revert",而是用新 burner 的身份真的去调用一次存款函数,确认权限真正生效

## 2. 用例明细

| # | 用例 | 验证了什么 | 结果 |
|---|---|---|---|
| 0.1 | 两个 Safe 都是真实的 6-of-9 多签 | 读取 `getOwners()`/`getThreshold()` | 通过 |
| 0.2 | 两个 Safe 当前的链上 nonce,和真实提案期望的 nonce 完全一致 | E1=205、MAIN=219 | 通过 |
| 1.1 | E1 的真实 calldata 解码后是 `updateRoute(sPENDLE, WETH, [透传路由])` | 自己算 `updateRoute` 选择器解码,不读文字描述 | 通过 |
| 1.2 | E1 通过真实 Safe 签名门槛执行成功 | 6 个真实签名人 `approveHash` + `execTransaction` | 通过 |
| 2.1 | 真实提案实际使用的 MultiSendCallOnly 地址(`0x40A2aCCb...`)是一个有真实代码的合约,且和计划文档某一格里的过期地址(`0xa83c336b...`)不是同一个 | 见第 3 节 | 通过 |
| 3.1 | MAIN 批次如果在 E1 之前执行,会安全地整体失败,不会产生中间状态 | `execTransaction` 触发 `GS013`,整体回滚 | 通过(确认为安全失败模式) |
| 3.2 | MAIN 全部 23 步(E1 执行之后)通过真实 6-of-9 签名门槛执行成功 | 单笔 `execTransaction`,`operation=1` delegatecall 到 MultiSendCallOnly | 通过 |
| 3.3 | 新 sdCRV/CRV burner 被正确登记为 wrapper 的 reward distributor | `wrapper.distributors(sdCRV)`、`distributors(CRV)` 均指向新 burner | 通过 |
| 3.4 | 新 sdPendle burner 被正确授予 compounder 的 `REWARD_DEPOSITOR_ROLE` | `compounder.hasRole(...)` 为 `true` | 通过 |
| 4.1 | 新 sdCRV burner 现在真的能把 sdCRV 存进 wrapper(MAIN 21 之前会因 `NotRewardDistributor` revert) | 真实调用 `depositReward(sdCRV, ...)` | 通过 |
| 4.2 | 新 sdPendle burner 现在真的能存进 compounder(MAIN 23 之前会因缺少角色 revert) | 真实调用 `depositReward(...)` | 通过 |
| 5.1 | MAIN 批次不影响批次外的核心账目 | compounder 基本状态读取正常 | 通过 |

运行方式:

```bash
HARDHAT_FORK_URL=https://eth-mainnet.public.blastapi.io \
npx hardhat test test/fork/concentrator/stakedao/StakeDaoLaunchDayVerification.spec.ts --network hardhat
```

---

## 3. 发现的点:计划文档第 15 行 J 列的 raw calldata 是过期数据

**现象**:计划文档 MAIN 批次那一行,贴着一段可以直接复制去执行的完整 `execTransaction(...)` calldata。把这段十六进制解码后,里面写的目标合约是 `0xa83c336b20401af773b6219ba5027174338d1836`。但 Safe 官方接口查到的、**当前真实排队等签名**的那笔提案(`safeTxHash = 0xb84b500b...1ce2a`),目标合约是 `0x40A2aCCbd92BCA938b02010E17A5b8929b49130D`——两者不是同一个地址。

**核实过程**:

1. 用 Safe 合约自己的 `getTransactionHash(...)` 函数,拿这段 calldata 自己的参数去算,把 nonce 从 0 试到 300,没有任何一个 nonce 能算出旁边写的 `SafeTxHash`——证明这段 calldata 和旁边的哈希根本不是同一笔交易。
2. 把这段 calldata 完整拆开(不只看外层地址,把内层打包的 23 步操作也逐笔解开),发现**内层 23 步的地址、函数、参数,和真实提案逐字节完全一致**——两者的业务内容没有任何差异。
3. 查了 [Safe 官方的部署地址注册表](https://github.com/safe-global/safe-deployments/blob/main/src/assets/v1.3.0/multi_send_call_only.json):`0x40A2aCCbd92BCA938b02010E17A5b8929b49130D` 正是 **Safe 官方文档登记的、`MultiSendCallOnly v1.3.0` 在主网的标准地址**——真实提案用的就是这一个。而 `0xa83c336b...` 不在这份官方地址清单里,虽然经 Sourcify 核实是同一份源码的另一次部署(不是恶意合约),但不是 Safe 官方/真实签名执行会用到的那个。
4. 查了这两个 Safe 从建立到现在的**全部历史交易**,`0xa83c336b...` 这个地址**从未被这两个 Safe 使用过**。

**关于这个地址从哪来**:有同事反馈,`0xa83c336b...` 是 Tenderly 模拟环境自己用的 multicall 合约,`0x40A2aCCb...` 才是真实 Safe 执行时用的——这个说法和上面查到的证据一致:`0x40A2aCCb...` 确认是 Safe 官方登记的标准地址,`0xa83c336b...` 确认从未被这两个真实 Safe 用过、也不在官方地址清单里,业务内容却和真实提案逐字节相同。两条线对得上,可以认为这个解释是对的。

**是否影响这次上线**:不影响。真实提案(Safe 官方接口能查到、当前在排队等签名的那笔)内容已经逐项核对无误,也已经用真实签名流程执行验证通过。只是提醒一下:计划文档里那段可复制粘贴的十六进制文本本身是模拟环境生成的,不是真实提案的原文,如果有人直接复制它去手动执行,会对不上真实提案。完整的字节级对比留档在 [`docs/第15行J列-vs-真实提案-完整数据对比.txt`](https://github.com/AladdinDAO/aladdin-v3-contracts/blob/feat/test-stakedao-launch-gz/docs/第15行J列-vs-真实提案-完整数据对比.txt)。
