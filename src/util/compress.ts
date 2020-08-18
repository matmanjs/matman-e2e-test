import path from 'path';
import fse from 'fs-extra';
import compressing from 'compressing';

export default async function compress(outputPath: string, zipName?: string): Promise<string> {
  // 产出文件：output.zip，将整个 output 打包，以便在其他场景下使用
  const outputZipPath = path.join(outputPath, zipName || 'output.zip');

  // 如果该目录下已经存在该文件，则删除，避免重复打包
  if (fse.pathExistsSync(outputZipPath)) {
    fse.removeSync(outputZipPath);
  }

  // 待打包的目录
  const source = outputPath;

  // 临时目录，为避免和项目中文件夹重名，使用一个随机的文件夹名字
  const tmpDir = path.join(source, `../tmp_${Date.now()}`);

  // 临时拷贝待打包的目录，以 outputPath 名，注意需要去掉.号，避免 mac 等系统默认看不到解压文件
  const tmpZipFolderPath = path.join(tmpDir, path.basename(outputPath).replace(/\./gi, ''));

  // 临时打包出来的文件
  const tmpOutputZipPath = path.join(tmpDir, path.basename(outputZipPath));

  // 将 source 复制到待打包目录
  fse.copySync(source, tmpZipFolderPath);

  // 将待打包目录压缩zip
  await compressing.zip.compressDir(tmpZipFolderPath, tmpOutputZipPath);

  // 然后再移动目的地
  fse.moveSync(tmpOutputZipPath, outputZipPath, {
    overwrite: true,
  });

  // 最后要注意清理掉临时目录
  fse.removeSync(tmpDir);

  return outputZipPath;
}
