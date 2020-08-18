import { MapData, TestResult } from './dwt/business';

export type StringObject<T> = { [key: string]: T };

export interface addOutputDataParams {
  unionResult?: {
    resultCode: number | undefined;
    summary: string;
  };
  archiveConfig?: {
    path: string;
    entryFile: string;
    tag: string;
  };
  outputZipRelativePath?: string;
  unitTestRelativePathToOutput?: string;
  unitTestCoverageRelativePathToOutput?: string;
  unitTest?: TestResult;
  unitTestCoverage?: MapData;
  e2eTest?: TestResult;
  e2eTestCoverage?: MapData;
  e2eTestRelativePathToOutput?: string;
  e2eTestCoverageRelativePathToOutput?: string;
  outputPath?: string;
  outputRelativePath?: string;
  isRunUnitTest?: boolean;
  isRunE2ETest?: boolean;
}

export interface DWTRunnerConfig {
  outputPath: string;
  workspacePath: string;
  NPM?: string;
  isDev?: boolean;
  isRunUnitTest?: boolean;
  isRunE2ETest?: boolean;
}
