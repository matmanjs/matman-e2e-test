export const DWT_MODE = {
  UNIT: 'unit',
  E2E: 'e2e',
};

export const DWT_PROCESS_ENV = {
  // DWT 执行模式，控制是否单元测试或端对端测试，可选值为 unit 和 e2e
  DWT_MODE: 'DWT_MODE',

  // mockstar 启用的端口
  MOCKSTAR_PORT: 'MOCKSTAR_PORT',

  // whistle 启动的端口
  WHISTLE_PORT: 'WHISTLE_PORT',

  // 项目启动的端口
  PROJECT_PORT: 'PROJECT_PORT',
};

/**
 * 根据运行模式确定一些行为开关，例如是否执行单元测试和端对端测试等开关
 *
 * @return {{isRunUnitTest: Boolean, isRunE2ETest: Boolean}}
 */
function getActionConfigByDWTMode() {
  const dwtMode = process.env[DWT_PROCESS_ENV.DWT_MODE] || '';
  let isRunUnitTest;
  let isRunE2ETest;

  switch (dwtMode) {
    case DWT_MODE.UNIT:
      isRunUnitTest = true;
      isRunE2ETest = false;
      break;
    case DWT_MODE.E2E:
      isRunUnitTest = false;
      isRunE2ETest = true;
      break;
    default:
      isRunUnitTest = true;
      isRunE2ETest = true;
      break;
  }

  return {
    isRunUnitTest,
    isRunE2ETest,
  };
}

/**
 * 判断当前是否执行单元测试
 *
 * @param {Boolean} [isRun] 是否执行，如果该值不是 Boolean 类型，则将自动获取
 * @return {Boolean}
 */
export function shouldRunUnitTest(isRun?: boolean): boolean {
  const { isRunUnitTest } = getActionConfigByDWTMode();
  return typeof isRun === 'boolean' ? isRun : isRunUnitTest;
}

/**
 * 判断当前是否执行端对端测试
 *
 * @param {Boolean} [isRun] 是否执行，如果该值不是 Boolean 类型，则将自动获取
 * @return {Boolean}
 */
export function shouldRunE2ETest(isRun?: boolean): boolean {
  const { isRunE2ETest } = getActionConfigByDWTMode();
  return typeof isRun === 'boolean' ? isRun : isRunE2ETest;
}
