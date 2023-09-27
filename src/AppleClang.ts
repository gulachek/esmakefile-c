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

export interface IAppleClangLibrary {
	binaryPath: IBuildPath;
	compileInfo: ICompileInfo;
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

function libCompileInfo(libs: IAppleClangLibrary[]): ICompileInfo {
	const info: ICompileInfo = {
		cVersion: 'C89',
		definitions: {},
		includePaths: new Set<string>(),
	};

	for (const lib of libs) {
		mergeCompileInfo(info, lib.compileInfo);
	}

	return info;
}

export class AppleClang implements ICCompiler<IAppleClangLibrary> {
	addCExecutable(
		book: Cookbook,
		opts: ICExecutableOpts<IAppleClangLibrary>,
	): void {
		const { src, output, link } = opts;
		const pkgConfig = new PkgConfig(book);

		const pkgConfigLibs: string[] = [];
		const projectLibs: IAppleClangLibrary[] = [];

		for (const lib of link) {
			if (typeof lib === 'string') {
				pkgConfigLibs.push(lib);
			} else {
				projectLibs.push(lib);
			}
		}

		const compileInfo = libCompileInfo(projectLibs);

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const obj = new AppleClangObject(
				pkgConfig,
				tu,
				out,
				compileInfo,
				pkgConfigLibs,
			);
			objPaths.push(out);
			book.add(obj);
		}

		const exe = new AppleClangExecutable(
			pkgConfig,
			objPaths,
			output,
			pkgConfigLibs,
			projectLibs,
		);
		book.add(exe);
	}

	addCLibrary(book: Cookbook, opts: ICLibraryOpts): IAppleClangLibrary {
		const {
			src,
			name,
			version,
			outputDirectory,
			cVersion,
			includePaths,
			definitions,
		} = opts;

		const output = outputDirectory.join(`lib${name}.dylib`);

		const pkgConfig = new PkgConfig(book);

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const obj = new AppleClangObject(pkgConfig, tu, out);
			objPaths.push(out);
			book.add(obj);
		}

		const dylib = new AppleClangDylib(objPaths, output, {
			cVersion,
			includePaths,
			definitions,
		});
		book.add(dylib);

		pkgConfig.addPackage({
			packageName: name,
			version,
			cflags: [...includePaths].map((i) => `-I${i}`).join(' '),
			libs: `-L${book.abs(outputDirectory)} -l${name}`,
		});

		return dylib;
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
		info?: ICompileInfo,
		pkgConfigLibs?: string[],
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
	compileInfo: ICompileInfo;

	constructor(objs: Path[], out: IBuildPath, compileInfo: ICompileInfo) {
		this.objs = objs;
		this.binaryPath = out;
		this.compileInfo = compileInfo;
	}

	sources() {
		return this.objs;
	}

	targets() {
		return this.binaryPath;
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { sources, targets } = args.paths<AppleClangExecutable>();

		const clangArgs = baseClangArgs();
		clangArgs.push('-dynamiclib');
		clangArgs.push('-o', targets, ...sources);

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
