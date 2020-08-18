import { ChildProcess } from 'child_process';
import { runByExec } from '../util/run-cmd';
import { createLogger } from '../util/logger';

const logger = createLogger('process-handler');

/**
 * 杀掉指定关键词的进程
 *
 * @param {String} search 特定关键词
 * @return {Promise}
 * @author linjianghe
 */
export function kill(search: string): Promise<ChildProcess> {
  logger.debug(`kill: ${search}`);

  const command = `ps aux | grep "${search}" | grep -v grep | awk '{print $2}' | xargs kill -9`;

  return runByExec(command)
    .then((data) => {
      logger.debug(`kill by search=${search} success!`);
      return data;
    })
    .catch((err) => {
      logger.error(`kill by search=${search} fail!`, err);
      return Promise.reject(err);
    });
}

/**
 * 杀掉指定的进程ID pid
 *
 * @param {Array | Number} pids 进程ID
 * @return {Promise}
 * @author linjianghe
 */
export function killPids(pids: number[] | number): Promise<ChildProcess> {
  logger.debug('killPids: ', pids);

  const pidList = Array.isArray(pids) ? pids : [pids];
  const command = `kill -9 ${pidList.join(' ')}`;

  return runByExec(command)
    .then((data) => {
      logger.debug(`kill by pids=${pids} success!`);
      return data;
    })
    .catch((err) => {
      logger.error(`kill by pids=${pids} fail!`, err);
      return Promise.reject(err);
    });
}

/**
 * 强行退出当前的进程
 *
 * @param {Number} delay 延时执行时间，单位为 ms
 * @return {Promise}
 */
export function exit(delay = 1000): Promise<void> {
  logger.debug(`exit after ${delay}ms`);

  return new Promise((resolve) => {
    setTimeout(() => {
      process.exit();
      resolve();
    }, delay);
  });
}
