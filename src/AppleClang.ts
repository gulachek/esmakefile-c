import {
	CVersion,
	ICCompiler,
	ICExecutableOpts,
	ICLibraryOpts,
	ICTranslationUnit,
} from './Compiler.js';

import { isFailure, PkgConfig } from './PkgConfig.js';

import {
	Cookbook,
	IBuildPath,
	IRecipe,
	Path,
	RecipeBuildArgs,
} from 'gulpachek';

import { ChildProcess, spawn } from 'node:child_process';

interface ICompileInfo {
	cVersion: CVersion;
	includePaths: Set<string>;
	definitions: Record<string, string>;
}

interface IAppleClangLibrary {
	binaryPath: IBuildPath;
}

function maxCVersion(a: CVersion, b: CVersion): CVersion {
	const order = ['C89', 'C99', 'C11', 'C17'];
	const aIndex = order.indexOf(a);
	const bIndex = order.indexOf(b);
	if (aIndex < bIndex) {
		return b;
	} else {
		return a;
	}
}

function mergeCompileInfo(base: ICompileInfo, add: ICompileInfo): void {
	base.cVersion = maxCVersion(base.cVersion, add.cVersion);

	for (const key in add.definitions) {
		// do something about conflicting definitions
		base.definitions[key] = add.definitions[key];
	}

	for (const i of add.includePaths) {
		base.includePaths.add(i);
	}
}

export class AppleClang implements ICCompiler {
	libraries: Map<string, IAppleClangLibrary> = new Map();

	private libs(libNames: string[]): IAppleClangLibrary[] {
		const libs: IAppleClangLibrary[] = [];
		for (const name of libNames) {
			const lib = this.libraries.get(name);
			if (lib) libs.push(lib);
		}

		return libs;
	}

	addCExecutable(book: Cookbook, opts: ICExecutableOpts): void {
		const { src, output, link } = opts;
		const pkgConfig = new PkgConfig(book);

		const projectLibs = this.libs(link);

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const obj = new AppleClangObject(pkgConfig, tu, out, link);
			objPaths.push(out);
			book.add(obj);
		}

		const exe = new AppleClangExecutable(
			pkgConfig,
			objPaths,
			output,
			link,
			projectLibs,
		);
		book.add(exe);
	}

	addCLibrary(book: Cookbook, opts: ICLibraryOpts): void {
		const { src, name, version, outputDirectory, includePaths, link } = opts;

		const output = outputDirectory.join(`lib${name}.dylib`);

		const pkgConfig = new PkgConfig(book);

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const obj = new AppleClangObject(pkgConfig, tu, out, link);
			objPaths.push(out);
			book.add(obj);
		}

		const dylib = new AppleClangDylib(
			pkgConfig,
			objPaths,
			output,
			link,
			this.libs(link),
		);
		book.add(dylib);

		this.libraries.set(name, dylib);

		pkgConfig.addPackage({
			packageName: name,
			version,
			cflags: [...includePaths].map((i) => `-I${i}`).join(' '),
			libs: `-L${book.abs(outputDirectory)} -l${name}`,
		});
	}
}

class AppleClangObject implements IRecipe {
	pkgConfig: PkgConfig;
	translationUnit: ICTranslationUnit;
	out: IBuildPath;
	compileInfo?: ICompileInfo;
	pkgConfigLibs: string[];

	constructor(
		pkgConfig: PkgConfig,
		src: ICTranslationUnit,
		out: IBuildPath,
		pkgConfigLibs: string[],
		info?: ICompileInfo,
	) {
		this.pkgConfig = pkgConfig;
		this.translationUnit = src;
		this.out = out;
		this.compileInfo = info;
		this.pkgConfigLibs = pkgConfigLibs || [];
	}

	sources() {
		return this.translationUnit.src;
	}

	targets() {
		return this.out;
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { sources, targets } = args.paths<AppleClangObject>();

		const baseInfo: ICompileInfo = {
			cVersion: this.translationUnit.cVersion,
			includePaths: new Set(this.translationUnit.includePaths),
			definitions: { ...this.translationUnit.definitions },
		};

		const info = this.compileInfo;
		if (info) {
			if (
				maxCVersion(this.translationUnit.cVersion, info.cVersion) !==
				this.translationUnit.cVersion
			) {
				// TODO - this is a horrible error message w/ no details
				throw new Error(`Some linked library requires a higher C version`);
			}

			mergeCompileInfo(baseInfo, info);
		}

		const { cVersion, includePaths, definitions } = baseInfo;

		const clangArgs = baseClangArgs();
		clangArgs.push('-c', sources, '-o', targets);
		clangArgs.push(`-std=${cVersion.toLowerCase()}`);

		for (const i of includePaths) {
			clangArgs.push('-I', i);
		}

		for (const key in definitions) {
			const val = definitions[key];
			clangArgs.push(`-D${key}=${val}`);
		}

		if (this.pkgConfigLibs.length) {
			const result = await this.pkgConfig.cflags(this.pkgConfigLibs);
			if (isFailure(result)) {
				args.logStream.write(result.stderr);
				return false;
			} else {
				clangArgs.push(...result.value);
			}
		}

		return spawnAsync('clang', clangArgs, args);
	}
}

class AppleClangExecutable implements IRecipe {
	pkgConfig: PkgConfig;
	objs: Path[];
	out: IBuildPath;
	libTargets: IBuildPath[] = [];
	pkgConfigLibs: string[] = [];

	constructor(
		pkgConfig: PkgConfig,
		objs: Path[],
		out: IBuildPath,
		pkgConfigLibs: string[],
		libs: IAppleClangLibrary[],
	) {
		this.pkgConfig = pkgConfig;
		this.objs = objs;
		this.out = out;
		this.pkgConfigLibs = pkgConfigLibs || [];

		for (const lib of libs) {
			this.libTargets.push(lib.binaryPath);
		}
	}

	sources() {
		return [...this.objs, ...this.libTargets];
	}

	targets() {
		return this.out;
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { sources, targets } = args.paths<AppleClangExecutable>();

		const clangArgs = baseClangArgs();
		clangArgs.push('-o', targets, ...sources);

		if (this.pkgConfigLibs.length) {
			const result = await this.pkgConfig.libs(this.pkgConfigLibs);
			if (isFailure(result)) {
				args.logStream.write(result.stderr);
				return false;
			} else {
				clangArgs.push(...result.value);
			}
		}

		return spawnAsync('clang', clangArgs, args);
	}
}

class AppleClangDylib implements IRecipe, IAppleClangLibrary {
	objs: Path[];
	binaryPath: IBuildPath;
	pkgConfig: PkgConfig;
	pkgConfigLibs: string[];
	libTargets: IBuildPath[];

	constructor(
		pkgConfig: PkgConfig,
		objs: Path[],
		out: IBuildPath,
		pkgConfigLibs: string[],
		libs: IAppleClangLibrary[],
	) {
		this.pkgConfig = pkgConfig;
		this.objs = objs;
		this.binaryPath = out;
		this.pkgConfigLibs = pkgConfigLibs;
		this.libTargets = [];
		for (const lib of libs) {
			this.libTargets.push(lib.binaryPath);
		}
	}

	sources() {
		return [...this.objs, ...this.libTargets];
	}

	targets() {
		return this.binaryPath;
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { sources, targets } = args.paths<AppleClangExecutable>();

		const clangArgs = baseClangArgs();
		clangArgs.push('-dynamiclib');
		// TODO - prune out libTargets from over linking
		clangArgs.push('-o', targets, ...sources);

		if (this.pkgConfigLibs.length) {
			const result = await this.pkgConfig.libs(this.pkgConfigLibs);
			if (isFailure(result)) {
				args.logStream.write(result.stderr);
				return false;
			} else {
				clangArgs.push(...result.value);
			}
		}

		return spawnAsync('clang', clangArgs, args);
	}
}

async function spawnAsync(
	command: string,
	programArgs: string[],
	buildArgs: RecipeBuildArgs,
): Promise<boolean> {
	const proc = spawn(command, programArgs, { stdio: 'pipe' });
	proc.stderr.pipe(buildArgs.logStream);
	proc.stdout.pipe(buildArgs.logStream);
	return waitClose(proc);
}

function waitClose(proc: ChildProcess): Promise<boolean> {
	return new Promise<boolean>((res) => {
		proc.on('close', (code) => {
			res(code === 0);
		});
	});
}

function baseClangArgs(): string[] {
	return ['-fcolor-diagnostics'];
}
