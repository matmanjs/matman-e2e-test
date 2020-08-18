import path from 'path';
import fs from 'fs-extra';
import osenv from 'osenv';
import _ from 'lodash';
import { killPids } from './process-handler';
import * as yaml from '../util/yaml';
import { createLogger } from '../util/logger';
import { killPort } from '../util/port';

const logger = createLogger('local-cache');

let cacheFilePath: string;

interface CacheDataItem {
  name: string;
  pid?: number;
  port?: number;
  description?: string;
}

/**
 * 缓存数据的数据格式
 */
interface CacheData {
  [key: string]: {
    list: CacheDataItem[];
    t: number;
  };
}

/**
 * 获得缓存 cache 文件
 *
 * @return {String}
 * @author linjianghe
 */
export function getCacheFilePath(): string {
  if (!cacheFilePath) {
    // 数据缓存的根目录
    const DATA_DIR = path.join(osenv.home(), '.dwt-driver-matman');
    fs.ensureDirSync(DATA_DIR);

    // 启动数据缓存文件路径
    cacheFilePath = path.join(DATA_DIR, 'testAppData.yml');
    fs.ensureFileSync(cacheFilePath);

    logger.debug(`本地临时缓存目录 DATA_DIR=${DATA_DIR}, cacheFilePath=${cacheFilePath}`);
  }

  return cacheFilePath;
}

/**
 * 获得缓存数据
 *
 * @return {Object || null}
 * @author linjianghe
 */
export function getCache(): CacheData {
  const cacheData = yaml.getCache(getCacheFilePath());
  if (!cacheData) {
    logger.debug('local-cache is null');
  }
  return cacheData;
}

/**
 * 获得缓存数据
 *
 * @param {Object} obj 要保持的对象
 * @author linjianghe
 */
export function saveCache<T>(obj: T): void {
  yaml.saveCache(obj, getCacheFilePath());
}

/**
 * 清理指定缓存数据
 *
 * @param {String} seqId 本次启动自动化测试的唯一标志
 * @param {Object} cache 缓存数据
 * @return {Promise}
 * @author linjianghe
 */
export async function cleanTargetCacheItem(seqId: string, cache: CacheData = {}): Promise<void> {
  const cacheData = cache;
  logger.debug(`cleanTargetCacheItem local-cache: ${seqId} ${JSON.stringify(cacheData[seqId])}`);

  const cacheItem = cacheData[seqId];

  if (cacheItem?.list?.length) {
    const pids: number[] = [];
    const ports: number[] = [];

    cacheItem.list.forEach((item) => {
      if (item.pid) {
        pids.push(item.pid);
      }

      if (item.port) {
        ports.push(item.port);
      }
    });

    // 杀掉进程
    if (pids.length) {
      try {
        await killPids(pids);
      } catch (e) {
        logger.error(`killPids failed! pids=${JSON.stringify(pids)}，e=${e?.message || e}`);
      }
    }

    // 杀掉端口
    if (ports.length) {
      try {
        await killPort(ports);
      } catch (e) {
        logger.error(`killPort failed! ports=${JSON.stringify(ports)}，e=${e?.message || e}`);
      }
    }
  }

  // 删除本地缓存对应的记录
  delete cacheData[seqId];

  // 更新到本地缓存
  saveCache(cacheData);
}

/**
 * 清理缓存文件中过期占用的端口和进程
 *
 * @param {String} seqId 本次启动自动化测试的唯一标志
 * @return {Promise}
 * @author linjianghe
 */
export async function clean(seqId: string): Promise<void> {
  const cacheData = getCache();
  if (!cacheData) {
    return;
  }

  const data = cacheData[seqId];

  // 如果存在指定 seqId 的记录，则清理之
  if (data) {
    logger.debug(`${seqId} exist in local-cache`);
    await cleanTargetCacheItem(seqId, cacheData);
  }

  // 同时检查：两个小时过期，避免出现历史未成功清理产生的资源占用
  const EXPIRE = 2 * 60 * 60 * 1000;
  const nowTimestamp = Date.now();
  Object.keys(cacheData).forEach(async (key) => {
    if (nowTimestamp - cacheData[key].t > EXPIRE) {
      await cleanTargetCacheItem(key, cacheData);
    }
  });
}

/**
 * 获得已使用的端口
 *
 * @return {Array}
 * @author linjianghe
 */
export function getUsedPort(): (number | string)[] {
  const cacheData = getCache();
  if (!cacheData) {
    return [];
  }

  const result: (number | string)[] = [];

  Object.keys(cacheData).forEach((key) => {
    const { list } = cacheData[key];
    if (list?.length) {
      list.forEach((cacheDataItem: CacheDataItem) => {
        if (cacheDataItem.port) {
          result.push(cacheDataItem.port);
        }
      });
    }
  });

  return _.uniq(result);
}

/**
 * 保存使用过的 port
 *
 * @param {String} name 自定义的名
 * @param {Number} port 进程ID
 * @param {String} seqId 本次启动自动化测试的唯一标志
 * @param {String} [description] 描述
 * @author linjianghe
 */
export function saveUsedPort(name: string, port: number, seqId: string, describe?: string): void {
  const cacheData = getCache() || {};
  let description = describe;

  if (!description) {
    description = '';
  }

  // 获得该次测试 seqId 对于的数据，每一次执行就会缓存一次
  let data = cacheData[seqId];

  // 如果存在记录，则清理当前id对应的 pid 记录
  if (data?.list) {
    // 如果存在记录，则进行更新，该记录可能来自 saveUsedPid 方法的调用
    // 从列表中找到同样名字的进程记录
    const [item] = data.list.filter(item => item.name === name);
    if (item) {
      // 如果找到同一个进程，则更新 port
      item.port = port;
      item.description = description;
    } else {
      // 如果找不到同一个进程，则新增
      data.list.push({ name, port, description });
    }

    // 更新时间
    data.t = Date.now();
  } else {
    data = {
      list: [{ name, port, description }],
      t: Date.now(),
    };
  }

  // 更新记录
  cacheData[seqId] = data;

  // 保存到本地
  saveCache(cacheData);
}

/**
 * 保存使用过的 pid
 *
 * @param {String} name 自定义的名
 * @param {Number} pid 进程ID
 * @param {String} seqId 本次启动自动化测试的唯一标志
 * @param {String} [description] 描述
 * @author linjianghe
 */
export function saveUsedPid(name: string, pid: number, seqId: string, describe?: string): void {
  const cacheData = getCache() || {};
  let description = describe;

  if (!description) {
    description = '';
  }

  // 获得该次测试 seqId 对于的数据，每一次执行就会缓存一次
  let data = cacheData[seqId];

  if (data?.list) {
    // 如果存在记录，则进行更新，该记录可能来自 saveUsedPort 方法的调用
    // 从列表中找到同样名字的进程记录
    const [item] = data.list.filter(item => item.name === name);
    if (item) {
      // 如果找到同一个进程，则更新进程id
      item.pid = pid;
      item.description = description;
    } else {
      // 如果找不到同一个进程，则新增
      data.list.push({ name, pid, description });
    }

    // 更新时间
    data.t = Date.now();
  } else {
    data = {
      list: [{ name, pid, description }],
      t: Date.now(),
    };
  }

  // 更新记录
  cacheData[seqId] = data;

  // 保存到本地
  saveCache(cacheData);
}
