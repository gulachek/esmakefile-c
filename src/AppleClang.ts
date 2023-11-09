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

import { open, readFile } from 'node:fs/promises';

interface IAppleClangLibrary {
	binaryPath: IBuildPath;
	pkgConfigPath: IBuildPath;
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

	addCompileCommands(book: Cookbook): IBuildPath {
		const rule = new ClangCompileCommands(this.compileCommands);
		book.add(rule);
		return rule.json;
	}

	private _compileAndLink(
		book: Cookbook,
		pkgConfig: PkgConfig,
		output: IBuildPath,
		type: ImageType,
		opts: IExecutableOpts,
	): void {
		const { src, link } = opts;

		const { libs, imports } = this.libs(link);

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const json = Path.gen(tu.src, { ext: '.json' });
			const pchSrc = tu.precompiledHeader;
			const pch = pchSrc && Path.build(pchSrc.rel() + '.pch');

			const obj = new AppleClangObject(
				pkgConfig,
				tu,
				out,
				json,
				imports,
				opts.isDebug,
				pch,
			);
			this.compileCommands.add(json);
			objPaths.push(out);
			book.add(obj);

			if (pch && book.targets().indexOf(pch.rel()) === -1) {
				book.add(pch, [pchSrc], (args) => {
					const clangArgs = baseClangArgs();

					let clang: string;
					let langArg: string;
					if (isC(tu)) {
						clang = 'clang';
						langArg = tu.cVersion.toLowerCase();
					} else {
						clang = 'clang++';
						langArg = tu.cxxVersion.toLowerCase();
					}

					clangArgs.push(`-std=${langArg}`);
					clangArgs.push('-fvisibility=hidden');
					clangArgs.push(args.abs(pchSrc));
					clangArgs.push('-o', args.abs(pch));

					return args.spawn(clang, clangArgs);
				});
			}
		}

		const image = new AppleClangLinkedImage(
			type,
			opts.runtime,
			pkgConfig,
			objPaths,
			output,
			imports,
			libs,
		);

		book.add(image);
	}

	addExecutable(book: Cookbook, opts: IExecutableOpts): IBuildPath {
		const { outputDirectory, name } = opts;
		const output = outputDirectory.join(name);
		const pkgConfig = new PkgConfig(book);

		this._compileAndLink(book, pkgConfig, output, ImageType.Executable, opts);
		return output;
	}

	addLibrary(book: Cookbook, opts: ILibraryOpts): IBuildPath {
		const { name, version, outputDirectory, includePaths, definitions } = opts;

		const output = outputDirectory.join(`lib${name}.dylib`);
		const pkgConfig = new PkgConfig(book);

		this._compileAndLink(book, pkgConfig, output, ImageType.Dylib, opts);

		const cflags: string[] = [];
		for (const i of includePaths) {
			cflags.push(`-I${i}`);
		}

		for (const def in definitions) {
			cflags.push(`-D${def}=${definitions[def]}`);
		}

		const pkgConfigPath = pkgConfig.addPackage({
			packageName: name,
			version,
			cflags: cflags.join(' '),
			libs: `-L${book.abs(outputDirectory)} -l${name}`,
		});

		this.libraries.set(output.rel(), { binaryPath: output, pkgConfigPath });

		return output;
	}
}

class AppleClangObject implements IRule {
	pkgConfig: PkgConfig;
	translationUnit: TranslationUnit;
	out: IBuildPath;
	json: IBuildPath;
	depfile: IBuildPath;
	pkgConfigLibs: PkgSearchable[];
	isDebug: boolean;
	pch?: IBuildPath;

	constructor(
		pkgConfig: PkgConfig,
		src: TranslationUnit,
		out: IBuildPath,
		json: IBuildPath,
		pkgConfigLibs: PkgSearchable[],
		isDebug: boolean,
		pch?: IBuildPath,
	) {
		this.pkgConfig = pkgConfig;
		this.translationUnit = src;
		this.out = out;
		this.json = json;
		this.depfile = Path.gen(src.src, { ext: '.deps' });
		this.pkgConfigLibs = pkgConfigLibs || [];
		this.isDebug = isDebug;
		this.pch = pch;
	}

	prereqs() {
		const reqs: Path[] = [this.translationUnit.src];
		for (const p of this.pkgConfigLibs) {
			if (p instanceof Path) reqs.push(p);
		}

		if (this.pch) {
			reqs.push(this.pch);
		}

		return reqs;
	}

	targets() {
		return [this.out, this.json];
	}

	async recipe(args: RecipeArgs): Promise<boolean> {
		const [src, obj, json, deps] = args.absAll(
			this.translationUnit.src,
			this.out,
			this.json,
			this.depfile,
		);

		const pch: string | undefined = this.pch && args.abs(this.pch);

		const includePaths = new Set(this.translationUnit.includePaths);
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
		clangArgs.push('-c', src, '-o', obj);
		clangArgs.push(`-std=${langArg}`);
		clangArgs.push('-fvisibility=hidden');
		clangArgs.push('-MJ', json);
		clangArgs.push('-MMD', '-MF', deps);
		pch && clangArgs.push('-include-pch', pch);

		for (const i of includePaths) {
			clangArgs.push('-I', i);
		}

		if (this.isDebug) {
			clangArgs.push('-g');
		} else {
			clangArgs.push('-O3');
		}

		const baseDefinitions: Record<string, string> = {
			EXPORT: '__attribute__((visibility("default")))',
			IMPORT: '',
		};

		const definitions = {
			...baseDefinitions,
			...this.translationUnit.definitions,
		};

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

		const result = await args.spawn(clang, clangArgs);
		if (!result) return false;

		const depfileContents = await readFile(deps, 'utf8');
		const lines = depfileContents.split(/\\\n/);

		// first line is target
		for (let i = 1; i < lines.length; ++i) {
			args.addPostreq(lines[i].trim());
		}

		return true;
	}
}

enum ImageType {
	Dylib = 'dylib',
	Executable = 'executable',
}

class AppleClangLinkedImage implements IRule {
	type: ImageType;
	runtime: RuntimeLanguage;
	objs: Path[];
	binaryPath: IBuildPath;
	pkgConfig: PkgConfig;
	pkgConfigLibs: PkgSearchable[];
	libTargets: IBuildPath[];

	constructor(
		type: ImageType,
		runtime: RuntimeLanguage,
		pkgConfig: PkgConfig,
		objs: Path[],
		out: IBuildPath,
		pkgConfigLibs: PkgSearchable[],
		libs: IAppleClangLibrary[],
	) {
		this.type = type;
		this.runtime = runtime;
		this.pkgConfig = pkgConfig;
		this.objs = objs;
		this.binaryPath = out;
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
		switch (this.type) {
			case ImageType.Dylib:
				clangArgs.push('-dynamiclib');
				break;
			case ImageType.Executable:
				break;
			default:
				throw new Error(`ImageType not handled: ${this.type}`);
		}

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
