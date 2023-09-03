import {
	Cookbook,
	IBuildPath,
	IRecipe,
	Path,
	RecipeBuildArgs,
} from 'gulpachek';
import { ICCompiler, ICExecutableOpts, ICTranslationUnit } from './Compiler.js';

import { ChildProcess, spawn } from 'node:child_process';

export class AppleClang implements ICCompiler {
	addCExecutable(book: Cookbook, opts: ICExecutableOpts): void {
		const { src, output } = opts;

		const objPaths: IBuildPath[] = [];

		for (const tu of src) {
			const out = Path.gen(tu.src, { ext: '.o' });
			const obj = new AppleClangObject(tu, out);
			objPaths.push(out);
			book.add(obj);
		}

		const exe = new AppleClangExecutable(objPaths, output);
		book.add(exe);
	}
}

class AppleClangObject implements IRecipe {
	translationUnit: ICTranslationUnit;
	out: IBuildPath;

	constructor(src: ICTranslationUnit, out: IBuildPath) {
		this.translationUnit = src;
		this.out = out;
	}

	sources() {
		return this.translationUnit.src;
	}

	targets() {
		return this.out;
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { sources, targets } = args.paths<AppleClangObject>();
		const { cVersion, includePaths, definitions } = this.translationUnit;

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

		return spawnAsync('clang', clangArgs, args);
	}
}

class AppleClangExecutable implements IRecipe {
	objs: Path[];
	out: IBuildPath;

	constructor(objs: Path[], out: IBuildPath) {
		this.objs = objs;
		this.out = out;
	}

	sources() {
		return this.objs;
	}

	targets() {
		return this.out;
	}

	async buildAsync(args: RecipeBuildArgs): Promise<boolean> {
		const { sources, targets } = args.paths<AppleClangExecutable>();

		const clangArgs = baseClangArgs();
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
