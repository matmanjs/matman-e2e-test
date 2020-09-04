import { execSync } from "child_process";

export async function getNpmRunner(): Promise<string> {
  const getLatestVersion = (npmRunner: string) => {
    return new Promise((resolve) => {
      try {
        const latest = execSync(`${npmRunner} view matman-e2e-test version`, { timeout: 1500 }).toString().trim();

        resolve({
          from: npmRunner,
          latest
        });
      } catch (e) {
        if (process.env.SHOW_DEBUG_LOG) {
          console.log(e);
        }
      }
    });
  };

  const getFromNpm = getLatestVersion('npm');

  const getFromTNpm = getLatestVersion('tnpm');

  const getFromCNpm = getLatestVersion('cnpm');

  const getFromTimeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        from: 'timeout',
        latest: 'unknown'
      });
    }, 2000);
  });

  try {
    const result = await Promise.race([
      getFromNpm,
      getFromTNpm,
      getFromCNpm,
      getFromTimeout
    ]) as ({ from: string, latest: string });

    if (['npm', 'tnpm', 'cnpm'].indexOf(result.from) > -1) {
      return result.from;
    } else {
      return 'npm';
    }

  } catch (e) {
    return 'npm';
  }
}
