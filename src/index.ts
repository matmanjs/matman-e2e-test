import E2ERunner from './E2ERunner';

import compress from './util/compress';
import { runByExec, runBySpawn } from './util/run-cmd';
import { findAvailablePort, portIsOccupied } from './util/port';
import {
  checkAndWaitFileAvailable,
  checkAndWaitURLAvailable,
  getAbsolutePath,
  getBase64,
  getFromStrOrFunc
} from './util/base';

import {
  BuildProjectOpts,
  E2ERunnerConfig,
  RunE2ETestOpts,
  StartMatmanOpts,
  StartMockstarOpts,
  StartWhistleOpts,
  StringObject
} from './types';

export {
  E2ERunner,
  compress,
  runBySpawn,
  runByExec,
  findAvailablePort,
  portIsOccupied,
  getAbsolutePath,
  getFromStrOrFunc,
  checkAndWaitURLAvailable,
  checkAndWaitFileAvailable,
  getBase64,
  BuildProjectOpts,
  E2ERunnerConfig,
  RunE2ETestOpts,
  StartMatmanOpts,
  StartMockstarOpts,
  StartWhistleOpts,
  StringObject
};
