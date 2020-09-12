import path from 'path';
import fse from 'fs-extra';
import _ from 'lodash';

import { ChildProcess, ExecOptions } from 'child_process';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { createE2ECoverage } from 'coverage-istanbul';

import {
  BuildProjectOpts,
  E2ERunnerConfig,
  RunE2ETestOpts,
  StartMatmanOpts,
  StartMockstarOpts,
  StartWhistleOpts,
  StopOpts,
  StringObject
} from './types';
import { getSeqId } from './dwt/business';

import pkgInfo from './util/pkg';
import { createLogger } from './util/logger';
import { runByExec } from './util/run-cmd';
import { findAvailablePort, killPort } from './util/port';
import { checkAndWaitURLAvailable, getFromStrOrFunc } from './util/base';
import { getNpmRunner } from './util/npm';
import { clean, saveUsedPid, saveUsedPort } from './dwt/local-cache';
import { exit } from './dwt/process-handler';

import { DWT_PROCESS_ENV } from './dwt/config';

const logger = createLogger('E2ERunner');

interface ProcessCmd {
  originalCmd: string;
  processKey: string;
  cmd: string;
  t: number;
}

export default class E2ERunner {
  public outputPath: string;
  public workspacePath: string;
  public seqId: string;
  public isDev: boolean;
  public npmRunner?: string;
  private cacheData: StringObject<unknown>;
  private readonly cacheProcessArr: ProcessCmd[];
  private readonly startTime: number;

  public constructor(config: E2ERunnerConfig) {
    if (!config.outputPath) {
      throw new Error(`[DWTRunner] config.outputPath is not exist: ${config.outputPath}`);
    }

    // 一旦设置了 config.workspacePath，则必须是存在的路径
    if (!config.workspacePath || !fse.existsSync(config.workspacePath)) {
      throw new Error(`config.workspacePath is not exist! config.workspacePath=${config.workspacePath}`);
    }

    // 测试产物输出目录
    this.outputPath = config.outputPath;

    // 工作区间
    this.workspacePath = config.workspacePath;

    // 是否为开发者模式
    this.isDev = !!config.isDev;

    // 使用 npm/tnpm/cnpm，若不传递，则会自动寻找
    this.npmRunner = config.npmRunner;

    // 自动生成的唯一ID，用于区别不同批次的流程，
    // 尤其是有多个流程在同一个测试机中运行的时候，如果不做区分，则可能会有相互影响
    // 注意不要出现等号，否则whistle里面会有问题
    this.seqId = getSeqId(this.outputPath, this.isDev);

    // 缓存数据
    this.cacheData = {
      outputPath: this.outputPath,
    };

    // 缓存进程，方便后续进行清理
    this.cacheProcessArr = [];

    // 初始化开始时间，最终用于计算执行时长
    this.startTime = Date.now();
  }

  /**
   * 开始启动
   */
  public async start() {
    logger.info('启动自动化测试...');
    logger.info(`${pkgInfo.name} V${pkgInfo.version}`);

    logger.info(`清理文件输出目录：${this.outputPath}`);
    fse.removeSync(this.outputPath);

    // 获取 npmRunner 值
    if (!this.npmRunner) {
      this.npmRunner = await getNpmRunner();
    }

    logger.info(`使用：${this.npmRunner}`);

    await this.clean();
  }

  /**
   * 使用子进程来执行指定的命令
   *
   * @param {String} name 命令的名字，用于自定义识别命令，不同命令之间请保持唯一
   * @param {String} command 要执行的命令
   * @param {ExecOptions} options 执行命令的额外参数
   * @param {Function} customCloseHandler 自定义关闭函数，若返回 true 则会强制中断子进程
   */
  public async runByExec(
    name: string,
    command: string,
    options?: ExecOptions,
    customCloseHandler?: (data: any) => boolean,
  ): Promise<ChildProcess> {
    // 进程中追加一些唯一标识
    const processKey = `${encodeURIComponent(name)}-${this.seqId}`;

    // 如果命令行中没有 processKey 则追加之
    // const cmd = command.indexOf(processKey) < 0 ? `${command} --${processKey}` : command;
    // 暂时不追加，追加似乎无意义
    const cmd = command;

    // 缓存进程记录
    this.cacheProcessArr.push({
      t: Date.now(),
      originalCmd: command,
      processKey,
      cmd,
    });

    logger.info(`即将为${name}执行：${cmd}`);

    // 执行命令
    const cmdRun = await runByExec(cmd, options, customCloseHandler);

    // 此次执行的进程缓存在本地
    saveUsedPid(name, cmdRun.pid, this.seqId, cmd);

    return cmdRun;
  }

  /**
   * 构建业务工程项目
   *
   * @param cmd
   * @param opts
   */
  public async buildProject(cmd: string | ((port: number) => string), opts?: BuildProjectOpts): Promise<string | number | undefined> {
    let cmdStr;

    // project 端口，其中来自环境变量的优先级最高，因为在自动化测试时可以动态设置
    let projectPort = process.env[DWT_PROCESS_ENV.PROJECT_PORT] || opts?.port;

    if (opts?.usePort) {
      logger.info(`project 需要一个端口号！`);

      if (projectPort) {
        // 如果存在被指定的端口，则将其转为数字
        if (typeof projectPort !== 'number') {
          projectPort = parseInt(`${projectPort}`, 10);
        }

        // 如果指定了端口，则杀掉这个端口
        await this.killPort(projectPort);
      } else {
        // 如果没有指定端口，则自动查找一个未被占用的端口
        projectPort = await this.findAvailablePort(3000);
      }

      logger.info(`project 即将使用端口号: ${projectPort}!`);

      cmdStr = getFromStrOrFunc<string, string | number>(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cmd,
        projectPort,
      );

      // 缓存在本地
      saveUsedPort('project-build', projectPort, this.seqId);
    } else {
      cmdStr = getFromStrOrFunc<string, string | number>(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cmd
      );
    }

    await this.runByExec('project-build', cmdStr, { cwd: opts?.cwd || this.workspacePath }, opts?.checkIfBuildCompleted);

    return projectPort;
  }

  /**
   * 启动 mockstar
   *
   * @param cwd
   * @param opts
   */
  public async startMockstar(cwd: string, opts?: StartMockstarOpts): Promise<number> {
    // 默认情况下需要先安装依赖，但也可以指定跳过该步骤
    if (!opts?.skipInstall) {
      // mockstar: 安装依赖
      await this.runByExec('mockstar-install', `${this.npmRunner || 'npm'} install`, { cwd });
    }

    // mockstar 端口，其中来自环境变量的优先级最高，因为在自动化测试时可以动态设置
    let mockstarPort = process.env[DWT_PROCESS_ENV.MOCKSTAR_PORT] || opts?.port;

    if (mockstarPort) {
      // 如果存在被指定的端口，则将其转为数字
      if (typeof mockstarPort !== 'number') {
        mockstarPort = parseInt(`${mockstarPort}`, 10);
      }

      // 如果指定了端口，则杀掉这个端口
      await this.killPort(mockstarPort);
    } else {
      // 如果没有指定端口，则自动查找一个未被占用的端口
      mockstarPort = await this.findAvailablePort(9420);
    }

    logger.info(`mockstar 即将使用端口号: ${mockstarPort}!`);

    // mockstar: 启动
    await this.runByExec(
      'mockstar-start',
      `npx mockstar run -p ${mockstarPort}`,
      { cwd },
      data => data && data.indexOf(`127.0.0.1:${mockstarPort}`) > -1,
    );

    // 缓存在本地
    saveUsedPort('mockstar-start', mockstarPort, this.seqId);

    // TODO 自检一下 mockstar 是否真正启动了，参考检查 whistle 的方式来实现

    return mockstarPort;
  }

  /**
   * 启动 whistle
   *
   * @param opts
   */
  public async startWhistle(opts: StartWhistleOpts): Promise<number> {
    const ruleConfigFileName = 'test.whistle.js';

    // 生成 .whistle.js 配置文件
    const ruleConfigFile = await generateConfigFile(opts, {
      ruleConfigFileName,
      outputPath: this.outputPath,
    });

    // whistle 端口，其中来自环境变量的优先级最高，因为在自动化测试时可以动态设置
    let whistlePort = process.env[DWT_PROCESS_ENV.WHISTLE_PORT] || opts?.port;

    if (whistlePort) {
      // 如果存在被指定的端口，则将其转为数字
      if (typeof whistlePort !== 'number') {
        whistlePort = parseInt(`${whistlePort}`, 10);
      }

      // 如果指定了端口，则杀掉这个端口
      await this.killPort(whistlePort);
    } else {
      // 如果没有指定端口，则自动查找一个未被占用的端口
      whistlePort = await this.findAvailablePort(9421);
    }

    // 需要追加一个 seqId，为本次 whistle 生成唯一的命名空间
    const processKey = `${encodeURIComponent('whistle-start')}-${this.seqId}`;

    const whistleCustomNamespaceArgs = opts.useCurrentStartedWhistle ? '' : `-S ${processKey}`;

    // whistle: 启动
    await this.runByExec(
      'whistle-start',
      `w2 start ${whistleCustomNamespaceArgs} -p ${whistlePort}`,
      {},
      data => data && data.indexOf(`127.0.0.1:${whistlePort}`) > -1,
    );

    // 缓存在本地
    saveUsedPort('whistle-start', whistlePort, this.seqId);

    // 自检一下 whistle 是否真正启动了
    const checkURL = `http://127.0.0.1:${whistlePort}/cgi-bin/server-info`;
    await checkAndWaitURLAvailable(checkURL, { debug: true }).catch((err) => {
      const errMsg = err?.message || err;

      return Promise.reject(`检测 whistle 未成功启动, checkURL=${checkURL}, err=${errMsg}`);
    });

    // 使用 whistle 的规则配置文件
    // w2 use xx/.whistle.js -S whistle-e2etest --force
    let useCmd = `w2 use ${ruleConfigFile} ${whistleCustomNamespaceArgs}`;

    if (opts.forceOverride) {
      useCmd = `${useCmd} --force`;
    }

    // 执行
    await this.runByExec('whistle-use', useCmd);

    return whistlePort;
  }

  /**
   * 启动 matman
   *
   * @param cwd
   * @param opts
   */
  public async startMatman(cwd: string, opts?: StartMatmanOpts): Promise<void> {
    // 默认情况下需要先安装依赖，但也可以指定跳过该步骤
    if (!opts?.skipInstall) {
      // mockstar: 安装依赖
      await this.runByExec('matman-install', `${this.npmRunner || 'npm'} install`, { cwd });
    }
  }

  /**
   * 启动 e2e test
   *
   * @param cmd
   * @param opts
   */
  public async runE2ETest(cmd: string, opts?: RunE2ETestOpts): Promise<string> {
    const e2eOutputPath = path.resolve(this.outputPath, opts?.outputPath || './e2e');

    // DWT 需要这些配置
    process.env.DWT_TEST_TYPE = 'e2e';
    process.env.DWT_OUTPUT_PATH = e2eOutputPath;
    process.env.DWT_MOCHAWESOME_FILE_PATH = opts?.mochawesomeJsonFilePath;

    // 执行命令，如果有端口号的话，要携带之
    const command = opts?.whistlePort ? `npx cross-env ${DWT_PROCESS_ENV.WHISTLE_PORT}=${opts?.whistlePort} ${cmd}` : `npx ${cmd}`;

    // 启动端对端测试
    await this.runByExec(
      'e2e-test-run',
      command,
      { cwd: opts?.cwd || this.workspacePath },
    );

    // 处理覆盖率
    if (opts?.matmanAppPath && fse.pathExistsSync(opts?.matmanAppPath)) {
      // 处理测试覆盖率
      await this.createE2ECoverage(opts?.matmanAppPath);

      // copy build to output
      await this.copyBuildOutputToArchive(opts?.matmanAppPath, path.join(e2eOutputPath, 'coverage'));
    }

    return e2eOutputPath;
  }

  /**
   * 清理
   */
  public async clean(): Promise<void> {
    logger.info('开始清理...');
    // 清理本地缓存的记录，记录了过去占用的端口、进程等信息
    // 这里很重要，尤其是在非 docker 场景下，可能会存在资源不够用的情况
    await clean(this.seqId);
  }

  /**
   * 停止
   */
  public async stop(opts?: StopOpts) {
    // 缓存一些 e2eRunner 的数据
    fse.outputJsonSync(path.join(this.outputPath, 'e2eRunner.json'), this);

    // 在停止之前执行
    await this.runBeforeStop();

    // 做最后的清理
    await this.clean();

    logger.info(`自动化测试总流程已经花费了 ${this.getTotalCost() / 1000}s，接下来将要退出整个流程...`);

    // 默认情况，会强制结束所有流程，但是有些场景下，会导致后续行为出错，
    // 此时可以配置 skipExit = false 来阻止自动强制结束流程
    if (!opts?.skipExit) {
      await exit(2000);
    }

    logger.info('已退出整个流程');
  }

  /**
   * 在停止之前执行
   */
  public async runBeforeStop() {
    // do some thing
  }

  /**
   * 找到当前未被占用的端口号
   *
   * @param {Number} [port] 查找的起始端口号
   * @param {Array} [skipList] 需要忽略的端口号
   * @return {Promise}
   * @author linjianghe
   */
  public async findAvailablePort(port: number, skipList?: (number | string)[]): Promise<number> {
    return findAvailablePort(port || 9420, skipList);
  }

  /**
   * 杀掉指定端口的进程
   *
   * @param {Number} port 端口号
   * @return {Promise}
   * @author linjianghe
   */
  public async killPort(port: number | number[]): Promise<void> {
    return killPort(port);
  }

  /**
   * 分析并生成测试覆盖率数据
   *
   * @param matmanAppPath
   */
  public async createE2ECoverage(matmanAppPath: string): Promise<void> {
    const globPattern = path.join(matmanAppPath, 'build/coverage_output/**/*.json');
    const reporterDir = path.join(matmanAppPath, 'build/coverage').replace(/ /g, '\\ ');

    logger.info('准备生成端对端自动化测试报告！', globPattern, reporterDir);

    await createE2ECoverage(globPattern, {
      dir: reporterDir,
    })
      .then((data: any) => {
        logger.info('生成端对端自动化测试报告成功！', JSON.stringify(data));
      })
      .catch((err: Error) => {
        logger.error(`生成端对端自动化测试报告失败！err: ${err?.message || err}`);
      });
  }

  /**
   * 将端对端测试运行结果拷贝到归档目录中
   *
   * @param matmanAppPath
   * @param coverageOutputPath
   */
  public async copyBuildOutputToArchive(matmanAppPath: string, coverageOutputPath: string): Promise<void> {
    try {
      logger.info('准备将端对端测试产物复制到归档目录中...');

      const srcPath = path.join(matmanAppPath, 'build');
      const distPath = path.join(this.outputPath, 'e2e_build_output');
      const reporterDir = path.join(matmanAppPath, 'build/coverage');

      if (fse.pathExistsSync(srcPath)) {
        // 将端对端测试运行结果拷贝到归档目录中
        fse.copySync(srcPath, distPath);
      }

      if (fse.pathExistsSync(reporterDir)) {
        // 把生成的覆盖率的结果单独拷贝处理
        fse.copySync(reporterDir, coverageOutputPath);
      }

      // 需要移除部分不需要的文件，避免最后归档文件过大
      fse.removeSync(path.join(distPath, 'coverage_output'));

      logger.info('端对端测试产物已复制到归档目录中！');
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * 设置缓存数据
   *
   * @param {Object} obj
   */
  public addCacheData(obj: unknown): void {
    this.cacheData = _.merge({}, this.cacheData, obj);
  }

  /**
   * 获得缓存数据
   *
   * @return {Object}
   */
  public getCacheData(): StringObject<unknown> {
    return this.cacheData;
  }

  /**
   * 获得缓存数据的子进程列表
   *
   * @return {Array}
   */
  public getCacheProcessArr(): ProcessCmd[] {
    return this.cacheProcessArr;
  }

  /**
   * 获取从开始到现在的耗时，单位为 ms
   *
   * @return {Number}
   */
  public getTotalCost(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * 产生 whistle 规则配置文件
 *
 * @param opts
 * @param params
 */
async function generateConfigFile(
  opts: StartWhistleOpts,
  params: { outputPath: string; ruleConfigFileName: string },
): Promise<string> {
  const whistleRules = opts.getWhistleRules();

  // 校验合法性
  if (!whistleRules || !whistleRules.name || !whistleRules.rules) {
    logger.error('无法自动生成 whistle 代理规则！', JSON.stringify(opts));
    return Promise.reject('无法自动生成 whistle 代理规则！');
  }

  // 额外处理下代理规则
  let ruleContent = whistleRules.rules;

  // 设置开启 Capture TUNNEL CONNECTs，否则 https 情况下可能会有问题
  const shouldEnableCapture = '* enable://capture';
  ruleContent = `${shouldEnableCapture}\n\n${ruleContent}`;

  // 在 devnet 机器中，需要额外配置一个 pac 文件，否则无法直接访问外网
  // 自定义修改规则内容
  if (typeof opts.handleRuleContent === 'function') {
    ruleContent = opts.handleRuleContent(ruleContent, params.outputPath);
  }

  // 更新
  whistleRules.rules = ruleContent;

  // 文件内容
  const ruleConfigFileContent = `module.exports = ${JSON.stringify(whistleRules, null, 2)};`;

  // whistle 配置文件路径，自动生成，一般情况下无需修改
  const ruleConfigFile = path.join(params.outputPath, params.ruleConfigFileName);

  // 保存文件
  fse.outputFileSync(ruleConfigFile, ruleConfigFileContent);
  logger.info(`成功生成 whistle 规则配置文件: ${ruleConfigFile}`);
  logger.debug(`whistleRules： ${JSON.stringify(whistleRules)}`);

  return ruleConfigFile;
}
