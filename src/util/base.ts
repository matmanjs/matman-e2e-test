import path from 'path';
import axios from 'axios';
import fs from 'fs-extra';
import { createLogger } from './logger';

const logger = createLogger('base');

interface URLOrFileAvailableOptions {
  retryLimit?: number;
  count?: number;
  timeout?: number;
  debug?: boolean
}

/**
 * 获得绝对路径地址
 *
 * @param {String} targetPath 目标路径
 * @param {String} [basePath] 根路径，如果目标路径为相对路径，则将用该路径作为其根路径
 * @return {String}
 * @author linjianghe
 */
export function getAbsolutePath(targetPath: string, basePath: string): string {
  if (!targetPath) {
    return '';
  }

  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return basePath ? path.resolve(basePath, targetPath) : path.resolve(targetPath);
}

/**
 * 通过字符串获得一个 base64 值
 *
 * @param {String} data 字符串
 * @param {Number} length 保留多少位
 * @return {String}
 * @author linjianghe
 */
export function getBase64(data: string, length?: number): string {
  const buff = Buffer.from(`${data}`);
  const base64data = buff.toString('base64');
  return length ? base64data.slice(-1 * length) : base64data;
}

type targetFunc<P, T> = (...params: P[]) => T;
/**
 * 根据传入的字符串或函数来获得最终的字符串
 *
 * @param {String | Function} target 判断目标
 * @param args 如果 target 为函数，则该值将传入给该函数
 * @return {String}
 * @author linjianghe
 */
export function getFromStrOrFunc<T, P>(
  target: string | targetFunc<P, T>,
  ...args: P[]
): string | T {
  return typeof target === 'function' ? target(...args) : target;
}

/**
 * 检查是否能访问，一直到能够访问或者访问超时为止
 *
 * @param {String} url 请求地址
 * @param {Object} [opts] 选项
 * @param {Number} [opts.retryLimit] 最多重试次数
 * @param {Number} [opts.count] 当前重试次数
 * @param {Number} [opts.timeout] 每次重试之后需要等待的时间，单位为ms
 * @return {Promise}
 * @author linjianghe
 */
export async function checkAndWaitURLAvailable(
  url: string,
  opt: URLOrFileAvailableOptions = {},
): Promise<boolean> {
  const opts = Object.assign({}, opt);

  const result = await axios.get(url).catch((e) => {
    logger.error(e);
  });

  if (!opts.count) {
    opts.count = 0;
  }
  if (!opts.retryLimit) {
    opts.retryLimit = 10;
  }
  if (!opts.timeout) {
    opts.timeout = 1000;
  }

  if (result) {
    logger.info('checkAndWaitURLAvailable return true!', url, opts);
    if (opts.debug) {
      logger.info(result.data);
    }
    return true;
  }
  if (opts.count >= opts.retryLimit) {
    logger.error(`retry max! ${opts.count}/${opts.retryLimit}`);
    return Promise.reject(new Error('retry max'));
  }
  opts.count = opts.count + 1;

  logger.info(`check ${url} again: ${opts.count}/${opts.retryLimit}, waiting ${opts.timeout}ms`);

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      checkAndWaitURLAvailable(url, opts)
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          reject(err);
        });
    }, opts.timeout);
  });
}

/**
 * 检查某个文件是否存在，一直到能够查到或者超时为止
 *
 * @param {String} checkFile 本地文件
 * @param {Object} [opts] 选项
 * @param {Number} [opts.retryLimit] 最多重试次数
 * @param {Number} [opts.count] 当前重试次数
 * @param {Number} [opts.timeout] 每次重试之后需要等待的时间，单位为ms
 * @return {Promise}
 * @author linjianghe
 */
export async function checkAndWaitFileAvailable(
  checkFile: string,
  opt: URLOrFileAvailableOptions = {},
): Promise<boolean> {
  const opts = Object.assign({}, opt);
  if (!opts.count) {
    opts.count = 0;
  }
  if (!opts.retryLimit) {
    opts.retryLimit = 10;
  }
  if (!opts.timeout) {
    opts.timeout = 1000;
  }

  const result = await fs.pathExists(checkFile);

  if (result) {
    logger.info('checkAndWaitFileAvailable return true!', checkFile, opts);
    return true;
  }
  if (opts.count >= opts.retryLimit) {
    logger.error(`retry max! ${opts.count}/${opts.retryLimit}`);
    return Promise.reject(new Error('retry max'));
  }
  opts.count = opts.count + 1;

  logger.info(`check ${checkFile} : ${opts.count}/${opts.retryLimit}, waiting ${opts.timeout}ms`);

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      checkAndWaitFileAvailable(checkFile, opts)
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          reject(err);
        });
    }, opts.timeout);
  });
}
