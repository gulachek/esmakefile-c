import { ChildProcess, spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Cookbook, IRule, Path, RecipeArgs, IBuildPath } from 'iheartmake';
import { platform } from 'node:os';

export type PkgSearchable = string | IBuildPath;

export type PkgConfigSuccess<T> = {
	value: T;
};

export type PkgConfigFailure = {
	stderr: string;
};

export type PkgConfigResult<T> = PkgConfigSuccess<T> | PkgConfigFailure;

// workaround typescript bug that can't differentiate true/false in
// if/then. don't feel like writing up an issue but this is cleaner
// than comparing if (result.success === true) { success } else { failure }
export function isFailure<T>(
	result: PkgConfigResult<T>,
): result is PkgConfigFailure {
	return 'stderr' in result;
}

export type PkgConfigFlags = PkgConfigResult<string[]>;

interface IPackageOpts {
	packageName: string;
	version: string;
	name?: string;
	description?: string;
	cflags?: string;
	libs?: string;
}

class PackageRecipe implements IRule {
	private _packageName: string;
	public pc: IBuildPath;
	private _name: string;
	private _version: string;
	private _cflags?: string;
	private _libs?: string;
	private _description?: string;

	constructor(opts: IPackageOpts) {
		this._packageName = opts.packageName;
		this._name = opts.name || opts.packageName;
		this._description = opts.description;
		this._version = opts.version;
		this._cflags = opts.cflags;
		this._libs = opts.libs;
		this.pc = Path.build(`pkgconfig/${this._packageName}.pc`);
	}

	targets() {
		return this.pc;
	}

	async recipe(args: RecipeArgs): Promise<boolean> {
		const pkg = args.abs(this.pc);
		const lines = [
			`Name: ${this._name}`,
			`Version: ${this._version}`,
			`Description: ${this._description || '(no description)'}`,
		];

		if (this._cflags) lines.push(`Cflags: ${this._cflags}`);
		if (this._libs) lines.push(`Libs: ${this._libs}`);

		await writeFile(pkg, lines.join('\n'), 'utf8');
		return true;
	}
}

export class PkgConfig {
	private _book: Cookbook;

	private _localModsPath: string;

	constructor(book: Cookbook) {
		const { srcRoot, buildRoot } = book;
		this._book = book;

		const sep = platform() === 'win32' ? ';' : ':';
		this._localModsPath = [buildRoot, srcRoot]
			.map((s) => join(s, 'pkgconfig'))
			.join(sep);
	}

	public addPackage(opts: IPackageOpts): IBuildPath {
		const pkg = new PackageRecipe(opts);
		this._book.add(pkg);
		return pkg.pc;
	}

	public libs(names: PkgSearchable[]): Promise<PkgConfigFlags> {
		return this.flags('--libs', names);
	}

	public cflags(names: PkgSearchable[]): Promise<PkgConfigFlags> {
		return this.flags('--cflags', names);
	}

	private async flags(
		shellFlag: string,
		names: PkgSearchable[],
	): Promise<PkgConfigFlags> {
		const queries = this.query(names);

		const { success, stdout, stderr } = await this.spawn([
			shellFlag,
			...queries,
		]);
		if (!success) {
			return { stderr };
		}

		const flags = stdout.split(/\s+/);
		return { value: flags };
	}

	private async spawn(args: string[]): Promise<IProcExit> {
		const proc = spawn('pkg-config', args, {
			stdio: 'pipe',
			env: {
				...process.env,
				PKG_CONFIG_PATH: this._localModsPath,
			},
		});

		return waitStreams(proc);
	}

	/** name/rel-path -> name/abs-path */
	private query(names: PkgSearchable[]): string[] {
		return names.map((n) => this.resolveName(n));
	}

	private resolveName(name: PkgSearchable): string {
		const path = Path.build(name);
		const targets = new Set(this._book.targets());

		if (path.extname === '.pc' && targets.has(path.rel())) {
			return this._book.abs(path);
		} else if (typeof name !== 'string') {
			throw new Error(`Invalid pkgconfig search for '${name}'`);
		}

		return name;
	}
}

interface IProcExit {
	success: boolean;
	stdout: string;
	stderr: string;
}

async function waitStreams(proc: ChildProcess): Promise<IProcExit> {
	const stdout = new StringBuffer();
	const stderr = new StringBuffer();
	proc.stdout.pipe(stdout);
	proc.stderr.pipe(stderr);
	const success = await waitClose(proc);
	return { stdout: stdout.str(), stderr: stderr.str(), success };
}

function waitClose(proc: ChildProcess): Promise<boolean> {
	return new Promise<boolean>((res) => {
		proc.on('close', (code) => {
			res(code === 0);
		});
	});
}

class StringBuffer extends Writable {
	private _chunks: Buffer[] = [];

	override _write(
		chunk: Buffer,
		_encoding: BufferEncoding,
		cb: (error?: Error) => void,
	) {
		this._chunks.push(chunk);
		cb();
	}

	public str(): string {
		return Buffer.concat(this._chunks).toString();
	}
}
