export interface ConcentratorGovernanceDeployment {
  CTR: string;
  veCTR: string;
  SmartWalletWhitelist: string;
  PlatformFeeDistributor: string;
  GaugeRewardDistributor: string;
  Vesting: { [symbol: string]: string };
  PlatformFeeSplitter: string;
  MultipleVestHelper: string;
  FeeDistributor: string;
  Burner: {
    PlatformFeeBurner: string;
    ConvexFraxCompounderBurner: string;
    StakeDAOCompounderBurner: string;
  };
}
