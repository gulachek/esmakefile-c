import {
	ICompiler,
	IExecutableOpts,
	ILibraryOpts,
	TranslationUnit,
	Linkable,
	isC,
	RuntimeLanguage,
} from './Compiler.js';

import { isFailure, PkgConfig, PkgSearchable } from './PkgConfig.js';

import { Cookbook, IBuildPath, IRule, Path, RecipeArgs } from 'esmakefile';

import { open } from 'node:fs/promises';

interface IAppleClangLibrary {
	binaryPath: IBuildPath;
	pkgConfigPath: IBuildPath;
}

class ClangCompileCommands implements IRule {
	src: IBuildPath[];
	json: IBuildPath;

	constructor(sources: Iterable<IBuildPath>) {
		this.src = [...sources];
		this.json = Path.build('compile_commands.json');
	}

	prereqs() {
		return this.src;
	}

	targets() {
		return this.json;
	}

	async recipe(args: RecipeArgs): Promise<boolean> {
		const sources = args.absAll(...this.src);
		const json = args.abs(this.json);

		const f = await open(json, 'w');
		await f.appendFile('[', 'utf8');

		for (const src of sources) {
			const mini = await open(src, 'r');
			const contents = await mini.readFile('utf8');
			await f.appendFile(contents, 'utf8');
			await mini.close();
		}
		await f.appendFile(']', 'utf8');
		await f.close();
		return true;
	}
}

export class AppleClang implements ICompiler {
	libraries: Map<string, IAppleClangLibrary> = new Map();
	compileCommands: Set<IBuildPath> = new Set();

	private libs(libNames: Linkable[]): {
		imports: PkgSearchable[];
		libs: IAppleClangLibrary[];
	} {
		const libs: IAppleClangLibrary[] = [];
		const imports: PkgSearchable[] = [];
		for (const link of libNames) {
			const path = Path.build(link);
			const lib = this.libraries.get(path.rel());
			if (lib) {
				libs.push(lib);
				imports.push(lib.pkgConfigPath);
			} else {
				imports.push(link);
			}
		}

		return { libs, imports };
	}

	addCompileCommands(book: Cookbook): void {
		book.add(new ClangCompileCommands(this.compileCommands));
	}

	addExecutable(book: Cookbook, opts: IExecutableOpts): void {
		const { src, output, link } = opts;
		const pkgConfig = new PkgConfig(book);

		const { libs, imports } = this.libs(link);

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const json = Path.gen(tu.src, { ext: '.json' });
			const obj = new AppleClangObject(pkgConfig, tu, out, json, imports);
			this.compileCommands.add(json);
			objPaths.push(out);
			book.add(obj);
		}

		const exe = new AppleClangExecutable(
			opts.runtime,
			pkgConfig,
			objPaths,
			output,
			imports,
			libs,
		);
		book.add(exe);
	}

	addLibrary(book: Cookbook, opts: ILibraryOpts): IBuildPath {
		const { src, name, version, outputDirectory, includePaths, link } = opts;

		const output = outputDirectory.join(`lib${name}.dylib`);

		const pkgConfig = new PkgConfig(book);

		const objPaths: IBuildPath[] = [];

		const { libs, imports } = this.libs(link);

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const json = Path.gen(tu.src, { ext: '.json' });
			const obj = new AppleClangObject(pkgConfig, tu, out, json, imports);
			this.compileCommands.add(json);
			objPaths.push(out);
			book.add(obj);
		}

		const pkgConfigPath = pkgConfig.addPackage({
			packageName: name,
			version,
			cflags: [...includePaths].map((i) => `-I${i}`).join(' '),
			libs: `-L${book.abs(outputDirectory)} -l${name}`,
		});

		const dylib = new AppleClangDylib(
			opts.runtime,
			pkgConfig,
			objPaths,
			output,
			pkgConfigPath,
			imports,
			libs,
		);
		book.add(dylib);

		this.libraries.set(output.rel(), dylib);

		return output;
	}
}

class AppleClangObject implements IRule {
	pkgConfig: PkgConfig;
	translationUnit: TranslationUnit;
	out: IBuildPath;
	json: IBuildPath;
	pkgConfigLibs: PkgSearchable[];

	constructor(
		pkgConfig: PkgConfig,
		src: TranslationUnit,
		out: IBuildPath,
		json: IBuildPath,
		pkgConfigLibs: PkgSearchable[],
	) {
		this.pkgConfig = pkgConfig;
		this.translationUnit = src;
		this.out = out;
		this.json = json;
		this.pkgConfigLibs = pkgConfigLibs || [];
	}

	prereqs() {
		const pkgPaths: Path[] = [];
		for (const p of this.pkgConfigLibs) {
			if (p instanceof Path) pkgPaths.push(p);
		}
		return [this.translationUnit.src, ...pkgPaths];
	}

	targets() {
		return [this.out, this.json];
	}

	async recipe(args: RecipeArgs): Promise<boolean> {
		const [src, obj, json] = args.absAll(
			this.translationUnit.src,
			this.out,
			this.json,
		);

		const includePaths = new Set(this.translationUnit.includePaths);
		const definitions = { ...this.translationUnit.definitions };

		let clang: string;
		let langArg: string;

		if (isC(this.translationUnit)) {
			clang = 'clang';
			langArg = this.translationUnit.cVersion.toLowerCase();
		} else {
			clang = 'clang++';
			langArg = this.translationUnit.cxxVersion.toLowerCase();
		}

		const clangArgs = baseClangArgs();
		clangArgs.push('-g', '-c', src, '-MJ', json, '-o', obj);
		clangArgs.push(`-std=${langArg}`);

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

		return args.spawn(clang, clangArgs);
	}
}

class AppleClangExecutable implements IRule {
	runtime: RuntimeLanguage;
	pkgConfig: PkgConfig;
	objs: Path[];
	out: IBuildPath;
	libTargets: IBuildPath[] = [];
	pkgConfigLibs: PkgSearchable[] = [];

	constructor(
		runtime: RuntimeLanguage,
		pkgConfig: PkgConfig,
		objs: Path[],
		out: IBuildPath,
		pkgConfigLibs: PkgSearchable[],
		libs: IAppleClangLibrary[],
	) {
		this.runtime = runtime;
		this.pkgConfig = pkgConfig;
		this.objs = objs;
		this.out = out;
		this.pkgConfigLibs = pkgConfigLibs || [];

		for (const lib of libs) {
			this.libTargets.push(lib.binaryPath);
		}
	}

	prereqs() {
		const pkgPaths: Path[] = [];
		for (const p of this.pkgConfigLibs) {
			if (p instanceof Path) pkgPaths.push(p);
		}
		return [...this.objs, ...this.libTargets, ...pkgPaths];
	}

	targets() {
		return this.out;
	}

	async recipe(args: RecipeArgs): Promise<boolean> {
		const objs = args.absAll(...this.objs);
		const out = args.abs(this.out);

		const clangArgs = baseClangArgs();
		clangArgs.push('-o', out, ...objs);

		if (this.pkgConfigLibs.length) {
			const result = await this.pkgConfig.libs(this.pkgConfigLibs);
			if (isFailure(result)) {
				args.logStream.write(result.stderr);
				return false;
			} else {
				clangArgs.push(...result.value);
			}
		}

		const clang = this.runtime === 'C' ? 'clang' : 'clang++';
		return args.spawn(clang, clangArgs);
	}
}

class AppleClangDylib implements IRule, IAppleClangLibrary {
	runtime: RuntimeLanguage;
	objs: Path[];
	binaryPath: IBuildPath;
	pkgConfigPath: IBuildPath;
	pkgConfig: PkgConfig;
	pkgConfigLibs: PkgSearchable[];
	libTargets: IBuildPath[];

	constructor(
		runtime: RuntimeLanguage,
		pkgConfig: PkgConfig,
		objs: Path[],
		out: IBuildPath,
		pkgConfigPath: IBuildPath,
		pkgConfigLibs: PkgSearchable[],
		libs: IAppleClangLibrary[],
	) {
		this.runtime = runtime;
		this.pkgConfig = pkgConfig;
		this.objs = objs;
		this.binaryPath = out;
		this.pkgConfigPath = pkgConfigPath;
		this.pkgConfigLibs = pkgConfigLibs;
		this.libTargets = [];
		for (const lib of libs) {
			this.libTargets.push(lib.binaryPath);
		}
	}

	prereqs() {
		const pkgPaths: Path[] = [];
		for (const p of this.pkgConfigLibs) {
			if (p instanceof Path) pkgPaths.push(p);
		}
		return [...this.objs, ...this.libTargets, ...pkgPaths];
	}

	targets() {
		return this.binaryPath;
	}

	async recipe(args: RecipeArgs): Promise<boolean> {
		const objs = args.absAll(...this.objs);
		const out = args.abs(this.binaryPath);

		const clangArgs = baseClangArgs();
		clangArgs.push('-dynamiclib');
		clangArgs.push('-o', out, ...objs);

		if (this.pkgConfigLibs.length) {
			const result = await this.pkgConfig.libs(this.pkgConfigLibs);
			if (isFailure(result)) {
				args.logStream.write(result.stderr);
				return false;
			} else {
				clangArgs.push(...result.value);
			}
		}

		const clang = this.runtime === 'C' ? 'clang' : 'clang++';
		return args.spawn(clang, clangArgs);
	}
}

function baseClangArgs(): string[] {
	return ['-fcolor-diagnostics'];
}
