export interface ConcentratorCvxCRVDeployment {
  CvxCRVCompounder: {
    proxy: string;
    implementation: string;
  };
  LegacyConcentratorVault: {
    proxy: string;
    implementation: string;
  };
  ConcentratorVault: {
    proxy: string;
    implementation: string;
  };
  CvxCrvStakingWrapperStrategy: string;
}
