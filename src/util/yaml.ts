import fs from 'fs-extra';
import yaml from 'js-yaml';
import { createLogger } from './logger';

const logger = createLogger('yaml');

/**
 * 获取 yaml 文件中的配置
 *
 * https://github.com/nodeca/js-yaml#api
 *
 * @param {String} filePath yaml 文件的绝对路径
 * @return {Object || null}
 * @author linjianghe
 */
export function getCache(filePath: string): any {
  let config;

  try {
    config = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    logger.error(`parseYaml ${filePath} catch`, e);
    config = null;
  }
  return config;
}

/**
 * 保存内容到 yaml 文件中
 *
 * @param {Object} obj 要保持的对象
 * @param {String} filePath yaml 文件的绝对路径
 * @author linjianghe
 */
export function saveCache<T>(obj: T, filePath: string): void {
  if (!obj) {
    logger.error(`[saveCache] err, obj is ${typeof obj}`, filePath);
    return;
  }

  let doc;

  try {
    doc = yaml.safeDump(obj, {
      styles: {
        '!!null': 'canonical', // dump null as ~
      },
      sortKeys: true, // sort object keys
    });
  } catch (e) {
    logger.error(e);
  }

  fs.outputFileSync(filePath, doc, 'utf-8');
}
