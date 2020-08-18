import fs from 'fs-extra';
import $ from 'cheerio';
import { getBase64 } from '../util/base';

/**
 * 覆盖率报告中需要的 Data
 */
export type MapData = {
  [name: string]: {
    name: string;
    value: string;
    desc: string;
  };
};

/**
 * 覆盖率测试报告返回的数据
 */
interface GetCoverageReturnData {
  htmlResult?: string;
  data?: MapData;
}

/**
 * 获取测试报告的选项
 */
interface GetTestReportOpts {
  enableTest?: boolean;
  mochawesomeJsonFilePath: string;
  coverageHtmlPath: string;
  disableAutoAppendReporter?: boolean;
}

/**
 * 测试结果数据格式
 */
export interface TestResult {
  stats?: {
    passes: number;
    failures: number;
    testsRegistered: number;
    duration: number;
    skipped: number;
    pending: number;
  };
  passPercent?: string;
  actualSuccessPercent?: string;
  duration?: string;
  summary?: string;
  resultCode?: number;
}

/**
 * 测试报告数据格式
 */
export interface GetTestReportResult {
  isTestSuccess: boolean;
  testResult: TestResult;
  coverageResult?: GetCoverageReturnData;
  isCoverageSuccess?: boolean;
}

// 执行结果错误码: 0=成功，1=失败, 2=不执行测试
export const TEST_RESULT_CODE = {
  SUCCESS: 0,
  FAIL: 1,
  SKIPPED: 2,
};

/**
 * 获得 seqId，每次启动自动化测试，就会自动生成的唯一ID，用于区别不同批次的流程
 *
 * @param {String} dwtPath dwt目录
 * @param {Boolean} isDev 是否为 dev 模式
 * @return {String} 保留两位有效数字，例如 99.19
 * @author linjianghe
 */
export function getSeqId(dwtPath: string, isDev: boolean): string {
  // 自动生成的唯一ID，用于区别不同批次的流程，
  // 尤其是有多个流程在同一个测试机中运行的时候，如果不做区分，则可能会有相互影响
  // 注意不要出现等号，否则whistle里面会有问题
  return isDev ? 'dev' : getBase64(dwtPath, 6).replace(/=/gi, 'd') + Date.now();
}

/**
 * 获得处理之后的百分值，留两位有效数字
 *
 * @param {Number} percent 百分值，例如 99.19354838709677
 * @return {String} 保留两位有效数字，例如 99.19
 * @author linjianghe
 */
export function getPercentShow(percent: number): string {
  return percent.toFixed(2);
}

/**
 * 将毫秒时间转义为易识别的时间
 *
 * @param {Number} duration 时间，单位毫秒
 * @author linjianghe
 */
export function getDurationShow(duration = 0): string {
  const ONE_SECOND = 1000;
  const ONE_MINUTE = 60 * ONE_SECOND;

  if (duration < ONE_MINUTE) {
    return `${duration / ONE_SECOND}秒`;
  }
  const minutes = Math.floor(duration / ONE_MINUTE);
  const cost = minutes * ONE_MINUTE;
  const seconds = (duration - cost) / ONE_SECOND;
  return `${minutes}分${seconds}秒`;
}

/**
 * 从测试覆盖率 index.html 中获得数据
 *
 * @param {String} filePath
 * @return {Object}
 * @author linjianghe
 */
export function getCoverageDataFromIndexHtml(filePath: string): GetCoverageReturnData {
  const result: GetCoverageReturnData = {};

  if (!fs.existsSync(filePath)) {
    return result;
  }

  try {
    // html 文件内容
    const contents = fs.readFileSync(filePath, { encoding: 'utf8' });

    // 获取关键数据
    result.htmlResult = $('.wrapper .pad1 .clearfix', contents).html() || '';

    const map: MapData = {};

    // 解析出数据
    $('.coverage-wrapper > div', `<div class="coverage-wrapper">${result.htmlResult}</div>`).each(function () {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const $this = $(this);
      const value = $('span', $this).eq(0)
        .text()
        .trim();
      const name = $('span', $this).eq(1)
        .text()
        .trim()
        .toLowerCase();
      const desc = $('span', $this).eq(2)
        .text()
        .trim();

      map[name] = {
        name,
        value,
        desc,
      };
    });

    result.data = map;

    return result;
  } catch (err) {
    return result;
  }
}

/**
 * 从测试报告中获得自己需要的数据
 *
 * @param {String} name
 * @param {Object} opts
 * @return {GetTestReportResult}
 * @author linjianghe
 */
export function getTestReport(name: string, opts: GetTestReportOpts): GetTestReportResult {
  const { enableTest, mochawesomeJsonFilePath, coverageHtmlPath, disableAutoAppendReporter } = opts;

  // 如果不运行测试的话，直接返回
  if (!enableTest) {
    return {
      isTestSuccess: false,
      testResult: {
        resultCode: TEST_RESULT_CODE.SKIPPED,
        summary: `已配置不执行${name}！`,
      },
    };
  }

  const testResult: TestResult = {};

  if (disableAutoAppendReporter) {
    testResult.summary = `由于设置了disableAutoAppendReporter=${disableAutoAppendReporter}，无法获知 reporter，因此无法判断${name}结果`;
  } else {
    // 如果没有这个报告，则说明并没有执行测试
    if (!fs.existsSync(mochawesomeJsonFilePath)) {
      return {
        isTestSuccess: false,
        testResult: {
          resultCode: TEST_RESULT_CODE.FAIL,
          summary: `${name}失败，没有测试报告！`,
        },
      };
    }

    const mochawesomeJsonData = JSON.parse(fs.readFileSync(mochawesomeJsonFilePath, 'utf-8'));

    // 执行的结果状态
    testResult.stats = mochawesomeJsonData.stats || {};

    // 注意 testResult.stats.passPercent 会把 passes 和 pending（用it.skip语法主动跳过的用例） 都算成功
    // testResult.passPercent = getPercentShow(testResult.stats.passPercent);
    if (testResult?.stats) {
      const { testsRegistered, passes, failures, duration, skipped, pending } = testResult.stats;

      // 测试用例通过率
      testResult.passPercent = getPercentShow((passes * 100) / testsRegistered);

      // 测试用例实际成功率
      testResult.actualSuccessPercent = getPercentShow((passes * 100) / (passes + failures));

      // 运行耗时
      testResult.duration = getDurationShow(duration);

      // 报告汇总
      // 单元测试通过率: 98.85%（431/436)，实际成功率: 100.00%（431/(431+0)，耗时 0.112秒，总用例数436个，成功431个，失败0个，主动跳过未执行4个，超时异常未执行1个
      testResult.summary = `${name}成功率: ${testResult.actualSuccessPercent}%（${passes}/(${passes}+${failures})，耗时 ${testResult.duration}，总用例数${testsRegistered}个，成功${passes}个，失败${failures}个，主动跳过未执行${pending}个，超时异常未执行${skipped}个`;

      // 测试代码
      testResult.resultCode = failures !== 0 || skipped !== 0
        ? TEST_RESULT_CODE.FAIL
        : TEST_RESULT_CODE.SUCCESS;
    }
  }

  // 从覆盖率文件中获得覆盖率数据
  const coverageResult = getCoverageDataFromIndexHtml(coverageHtmlPath);

  const isCoverageSuccess = !!(coverageResult?.htmlResult);

  return {
    isTestSuccess: true,
    testResult,
    coverageResult,
    isCoverageSuccess,
  };
}
