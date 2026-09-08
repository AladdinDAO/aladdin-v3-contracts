# 上线前复核归档

> 维护:Gilbert
> 分支:`review/gz`(基于 `main`)

这个分支收集历次上线前复核的报告和测试脚本,只做归档,不用于合并回 `main`。每次新做完一轮复核,把报告和脚本追加到这里。

## 索引

| 日期 | 复核对象 | 版本 | 报告 | 脚本 |
|---|---|---|---|---|
| 2026-07-20 | StakeDAO vlSDT 迁移([PR #273](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/273)) | v0.5 | [StakeDAO-Migration-Fork-Rehearsal.md](StakeDAO-Migration-Fork-Rehearsal.md) | [`StakeDaoVlSDTMigrationE2E.spec.ts`](../test/fork/concentrator/stakedao/StakeDaoVlSDTMigrationE2E.spec.ts)(32 断言)、[`scripts/rehearsal/`](../scripts/rehearsal/) |
| 2026-07-29 | CLever Convex 链上投票迁移([PR #274](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/274)) | v1.0 | [CLever-ConvexVoting-Migration-Fork-Rehearsal.md](CLever-ConvexVoting-Migration-Fork-Rehearsal.md) | [`CLeverConvexVotingMigration.spec.ts`](../test/fork/clever/CLeverConvexVotingMigration.spec.ts)(36 用例) |
| 2026-08-03 | sPENDLE / vlSDT 上线日的两笔真实多签提案 | v1.0 | [sPENDLE-vlSDT-Launch-Day-Multisig-Verification.md](sPENDLE-vlSDT-Launch-Day-Multisig-Verification.md) | [`StakeDaoLaunchDayVerification.spec.ts`](../test/fork/concentrator/stakedao/StakeDaoLaunchDayVerification.spec.ts)(12 用例) |
| 2026-09-08 | CLever CVX Locker lock drift 修复([PR #278](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/278) @ `680b0c9`)代码审计 | v1.3 | [CLever-CVXLocker-PR278-Review.md](CLever-CVXLocker-PR278-Review.md) | [`test/fork/clever/pr278/`](../test/fork/clever/pr278/) `01`–`12` |
| 2026-09-08 | 主网已部署 implementation `0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534` 复验 | v1.1 | [CLever-CVXLocker-PR278-Deployed-Impl-Verification.md](CLever-CVXLocker-PR278-Deployed-Impl-Verification.md) | [`test/fork/clever/pr278/`](../test/fork/clever/pr278/) `13`–`18` |

## 运行说明

前三轮复核的对象已经合入 `main`,脚本在本分支可以直接运行。

PR #278 尚未合入。其中 `13`–`18` 直接升级到主网已部署的 implementation `0xBfb3A7A5FbB9207dEA82fe06dB4075B8CAEDa534` 并使用手写 ABI,不引用仓库合约源码,在本分支即可运行;`06`–`12` 用 `getContractFactory` 本地编译部署,必须切到 `fix/clever-lock-drift`(commit `680b0c9`)才有意义;纯读链的 `01`–`05`、`10`、`14`、`15` 不依赖分支。各脚本的具体命令见该报告的「附:复现命令」。

各报告正文里的脚本链接指向当初做复核的分支(`feat/test-stakedao-gz`、`feat/test-clever-vlcvx-gz`、`feat/test-stakedao-launch-gz`),那些分支仍在,链接有效。
