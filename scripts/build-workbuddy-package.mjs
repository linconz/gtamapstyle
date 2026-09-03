import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(repositoryRoot, "dist", "workbuddy");
const stagingDirectory = join(outputDirectory, "package");
const packagedSkillDirectory = join(
  stagingDirectory,
  "skills",
  "gta5-map-style",
);
const archivePath = join(outputDirectory, "gta5-map-style-workbuddy.zip");

function assertGeneratedPath(targetPath) {
  const targetRelativePath = relative(repositoryRoot, targetPath);
  if (
    targetRelativePath.startsWith("..") ||
    !targetRelativePath.startsWith(join("dist", "workbuddy"))
  ) {
    throw new Error(`拒绝清理非 WorkBuddy 构建目录：${targetPath}`);
  }
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function readCanonicalSkill(skillSource) {
  const match = skillSource.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("根目录 SKILL.md 缺少有效的 YAML frontmatter。");
  }

  const nameMatch = match[1].match(/^name:\s*(.+)$/m);
  const descriptionMatch = match[1].match(/^description:\s*(.+)$/m);
  const versionMatch = match[1].match(/^\s{2}version:\s*(.+)$/m);
  if (!nameMatch || !descriptionMatch || !versionMatch) {
    throw new Error(
      "根目录 SKILL.md 必须包含 name、description 和 metadata.version。",
    );
  }

  return {
    name: nameMatch[1].trim().replace(/^['\"]|['\"]$/g, ""),
    description: descriptionMatch[1].trim().replace(/^['\"]|['\"]$/g, ""),
    version: versionMatch[1].trim().replace(/^['\"]|['\"]$/g, ""),
    body: match[2].trimStart(),
  };
}

function createWorkBuddySkill(canonicalSkill, metadata, version) {
  const frontmatter = [
    "---",
    `name: ${canonicalSkill.name}`,
    `display_name: ${yamlString(metadata.displayName)}`,
    `display_name_en: ${yamlString(metadata.displayNameEn)}`,
    `description: ${yamlString(canonicalSkill.description)}`,
    `description_zh: ${yamlString(metadata.descriptionZh)}`,
    `description_en: ${yamlString(metadata.descriptionEn)}`,
    `version: ${yamlString(version)}`,
    `author: ${yamlString(metadata.author)}`,
    `allowed-tools: ${yamlString(metadata.allowedTools)}`,
    "disable-model-invocation: false",
    "user-invocable: true",
    "---",
    "",
  ].join("\n");

  return `${frontmatter}${canonicalSkill.body}`;
}

async function copyIntoPackage(sourceRelativePath) {
  const sourcePath = join(repositoryRoot, sourceRelativePath);
  const targetPath = join(packagedSkillDirectory, sourceRelativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
}

async function main() {
  assertGeneratedPath(stagingDirectory);
  assertGeneratedPath(archivePath);
  await rm(stagingDirectory, { recursive: true, force: true });
  await rm(archivePath, { force: true });
  await mkdir(packagedSkillDirectory, { recursive: true });

  const [skillSource, metadataSource, packageSource, lockSource] =
    await Promise.all([
      readFile(join(repositoryRoot, "SKILL.md"), "utf8"),
      readFile(
        join(repositoryRoot, "platforms", "workbuddy", "skill-metadata.json"),
        "utf8",
      ),
      readFile(join(repositoryRoot, "package.json"), "utf8"),
      readFile(join(repositoryRoot, "package-lock.json"), "utf8"),
    ]);

  const canonicalSkill = readCanonicalSkill(skillSource);
  const metadata = JSON.parse(metadataSource);
  const packageJson = JSON.parse(packageSource);
  if (canonicalSkill.version !== packageJson.version) {
    throw new Error(
      `版本不一致：SKILL.md 为 ${canonicalSkill.version}，package.json 为 ${packageJson.version}。`,
    );
  }

  for (const field of [
    "displayName",
    "displayNameEn",
    "descriptionZh",
    "descriptionEn",
    "author",
    "allowedTools",
  ]) {
    if (typeof metadata[field] !== "string" || metadata[field].trim() === "") {
      throw new Error(`WorkBuddy 元数据缺少有效字段：${field}`);
    }
  }

  const runtimePackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    private: true,
    type: packageJson.type,
    engines: packageJson.engines,
    scripts: {
      check: "node --check scripts/export-city-map.mjs",
    },
    dependencies: packageJson.dependencies,
  };

  await writeFile(
    join(packagedSkillDirectory, "SKILL.md"),
    createWorkBuddySkill(canonicalSkill, metadata, packageJson.version),
    "utf8",
  );
  await writeFile(
    join(packagedSkillDirectory, "package.json"),
    `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(packagedSkillDirectory, "package-lock.json"),
    lockSource,
    "utf8",
  );

  await Promise.all([
    copyIntoPackage("assets/blips"),
    copyIntoPackage("references/openstreetmap-setup.md"),
    copyIntoPackage("scripts/export-city-map.mjs"),
    copyIntoPackage("scripts/render-map.html"),
  ]);

  const zipResult = spawnSync(
    "zip",
    ["-q", "-r", archivePath, "skills"],
    { cwd: stagingDirectory, encoding: "utf8" },
  );
  if (zipResult.error?.code === "ENOENT") {
    throw new Error("未找到 zip 命令。请安装 zip 后重新运行 npm run package:workbuddy。");
  }
  if (zipResult.status !== 0) {
    throw new Error(
      `WorkBuddy 压缩包生成失败：${zipResult.stderr || zipResult.stdout}`,
    );
  }

  await rm(stagingDirectory, { recursive: true, force: true });
  console.log(`WorkBuddy 技能包已生成：${archivePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
